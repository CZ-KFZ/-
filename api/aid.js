// ============================================================
// EchoVerse · 互助申请 API
// 处理「给她的一小束光」卫生巾 / 吃饭补助申请
//
// 安全措施：
//   1. 严格输入校验（类型白名单、手机号、微信号、地址、简述长度）
//   2. 多维度去重：设备指纹 + 手机号 + 微信号（任一命中即拒绝）
//   3. 周期频控：卫生巾 1次/月，吃饭 1次/周
//   4. 全局 IP 频控：单 IP 每天 3 次
//   5. Honeypot 防机器人
//   6. 请求体大小限制
//   7. 名额总量校验：卫生巾 12/月，吃饭 2/周
//   8. 错误信息脱敏，不泄露飞书表结构
//
// 环境变量：FEISHU_TABLE_AID（互助申请表的 Table ID）
//
// 飞书表格字段约定：
//   申请类型（文本）· 微信号（文本）· 手机号（文本）· 收件地址（文本）
//   收款码（文本）· 困难简述（文本）· 设备指纹（文本）
//   状态（文本）· 申请时间（日期）· 审核备注（文本）
//
// 用法：
//   POST /api/aid  body: { type, wechat, phone, address, payCode, desc, fingerprint, website? }
//   GET  /api/aid?quota=1  查询剩余名额
// ============================================================

import { requireEnv, getTableId, getToken, createRecord, listRecords } from './_feishu-helpers.js'

// ============================================================
// 名额常量
// ============================================================
const PAD_MONTHLY_MAX = 12      // 卫生巾：12 名 / 月
const MEAL_WEEKLY_MAX = 2       // 吃饭：2 名 / 周
const IP_DAILY_MAX = 3          // 单 IP 每天最多 3 次申请

// ============================================================
// 安全工具函数
// ============================================================

// 手机号校验（中国大陆 11 位）
function isValidPhone(phone) {
  if (typeof phone !== 'string') return false
  return /^1[3-9]\d{9}$/.test(phone.trim())
}

// 微信号校验：6-20 位，字母开头，允许字母数字 _ -
function isValidWechat(wechat) {
  if (typeof wechat !== 'string') return false
  const w = wechat.trim()
  if (w.length < 6 || w.length > 20) return false
  return /^[a-zA-Z][a-zA-Z0-9_-]{5,19}$/.test(w)
}

// 文本长度校验
function clampText(str, min, max) {
  if (typeof str !== 'string') return null
  const s = str.trim()
  if (s.length < min || s.length > max) return null
  return s
}

// 简单哈希（用于设备指纹、手机号、微信号去重，避免明文比对）
function simpleHash(str) {
  if (!str) return ''
  let h = 5381
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) >>> 0
  }
  return 'h' + h.toString(36)
}

// 从请求中获取客户端 IP
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for']
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown'
}

// ============================================================
// 内存级频率限制（单实例有效；生产环境建议升级 Vercel KV）
// ============================================================
const ipDailyLimit = new Map() // ip -> { count, resetAt }

function checkIpDailyLimit(ip) {
  const now = Date.now()
  const record = ipDailyLimit.get(ip)
  if (!record || now > record.resetAt) {
    ipDailyLimit.set(ip, { count: 1, resetAt: now + 24 * 60 * 60 * 1000 })
    return { allowed: true }
  }
  if (record.count >= IP_DAILY_MAX) {
    return { allowed: false }
  }
  record.count++
  return { allowed: true }
}

// 定期清理过期记录
setInterval(() => {
  const now = Date.now()
  for (const [ip, record] of ipDailyLimit) {
    if (now > record.resetAt) ipDailyLimit.delete(ip)
  }
}, 60 * 60 * 1000).unref()

// ============================================================
// 时间周期判定
// ============================================================

// 自然月起止（北京时间，UTC+8）
function getMonthRange(date = new Date()) {
  // 转北京时间
  const beijing = new Date(date.getTime() + 8 * 60 * 60 * 1000)
  const year = beijing.getUTCFullYear()
  const month = beijing.getUTCMonth()
  const startUtc = Date.UTC(year, month, 1) - 8 * 60 * 60 * 1000
  const endUtc = Date.UTC(year, month + 1, 1) - 8 * 60 * 60 * 1000
  return { start: startUtc, end: endUtc }
}

// 自然周起止（周一为一周起点，北京时间）
function getWeekRange(date = new Date()) {
  const beijing = new Date(date.getTime() + 8 * 60 * 60 * 1000)
  const day = beijing.getUTCDay() // 0=周日, 1=周一
  const diffToMonday = (day === 0 ? -6 : 1 - day)
  const mondayUtc = Date.UTC(beijing.getUTCFullYear(), beijing.getUTCMonth(), beijing.getUTCDate() + diffToMonday) - 8 * 60 * 60 * 1000
  const nextMondayUtc = mondayUtc + 7 * 24 * 60 * 60 * 1000
  return { start: mondayUtc, end: nextMondayUtc }
}

// ============================================================
// CORS
// ============================================================
function setCors(req, res) {
  const origin = req.headers.origin || ''
  const allowedOrigins = [
    /^https?:\/\/localhost(:\d+)?$/,
    /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
    /\.vercel\.app$/,
  ]
  const isAllowed = origin && allowedOrigins.some((re) => re.test(origin))
  if (isAllowed) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST')
}

// ============================================================
// 主处理函数
// ============================================================
export default async function handler(req, res) {
  setCors(req, res)

  // ----------------------------------------------------------
  // GET /api/aid?quota=1  查询剩余名额（脱敏，不暴露申请记录）
  // ----------------------------------------------------------
  if (req.method === 'GET' && req.query?.quota) {
    return getQuota(req, res)
  }

  // ----------------------------------------------------------
  // POST /api/aid  提交申请
  // ----------------------------------------------------------
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // 请求体大小限制：最多 4KB（含收款码文本）
  const contentLength = parseInt(req.headers['content-length'] || '0', 10)
  if (contentLength > 4096) {
    return res.status(413).json({ error: '请求体过大' })
  }

  // 解析请求体
  let body = {}
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
  } catch {
    return res.status(400).json({ error: '请求体不是合法 JSON' })
  }

  // Honeypot 检查：填了 website 字段说明是机器人
  const honeypot = String(body.website || '').trim()
  if (honeypot) {
    return res.status(200).json({ success: true, message: '申请已收到' })
  }

  // 字段提取
  const type = String(body.type || '').trim()
  const wechat = String(body.wechat || '').trim()
  const phone = String(body.phone || '').trim()
  const address = String(body.address || '').trim()
  const payCode = String(body.payCode || '').trim()
  const desc = clampText(body.desc, 5, 200)
  const fingerprint = String(body.fingerprint || '').trim().slice(0, 64)

  // 类型白名单
  if (!['pad', 'meal'].includes(type)) {
    return res.status(400).json({ error: '申请类型不正确' })
  }

  // 必填校验
  if (!isValidWechat(wechat)) {
    return res.status(400).json({ error: '微信号格式不正确（6-20 位，字母开头）' })
  }
  if (!isValidPhone(phone)) {
    return res.status(400).json({ error: '手机号格式不正确' })
  }
  if (!desc) {
    return res.status(400).json({ error: '困难简述需 5-200 字' })
  }
  if (type === 'pad' && address.length < 5) {
    return res.status(400).json({ error: '卫生巾补助需填写收件地址' })
  }
  if (type === 'meal' && !payCode) {
    return res.status(400).json({ error: '吃饭补助需填写微信收款码链接' })
  }
  if (!fingerprint) {
    return res.status(400).json({ error: '设备指纹缺失' })
  }

  // IP 全局频控
  const ip = getClientIp(req)
  const ipCheck = checkIpDailyLimit(ip)
  if (!ipCheck.allowed) {
    return res.status(429).json({ error: '今日申请次数已用完，请明天再试' })
  }

  // 检查飞书环境变量
  const env = requireEnv()
  if (!env) {
    return res.status(503).json({ error: '服务暂不可用' })
  }
  const tableId = getTableId('aid')
  if (!tableId) {
    return res.status(503).json({ error: '服务暂不可用' })
  }

  try {
    const token = await getToken(env.appId, env.appSecret)

    // 读取所有申请记录做去重和名额计算
    let records = []
    try {
      records = await listRecords(token, env.appToken, tableId)
    } catch (queryErr) {
      console.warn('[aid api] 读取记录失败：', queryErr.message)
      return res.status(500).json({ error: '服务暂不可用，请稍后重试' })
    }

    // 哈希化去重键
    const fpHash = simpleHash(fingerprint)
    const phoneHash = simpleHash(phone)
    const wechatHash = simpleHash(wechat.toLowerCase())

    // 周期时间窗
    const monthRange = getMonthRange()
    const weekRange = getWeekRange()

    // 当前周期内已通过的申请（状态非「拒绝」「黑名单」）
    // 这里用申请时间字段判定周期；若无申请时间字段则回退用 record 创建时间
    const isInPeriod = (r, range) => {
      const ts = r.fields?.['申请时间']
      let t = 0
      if (typeof ts === 'number') t = ts
      else if (typeof ts === 'string') t = Date.parse(ts) || 0
      else if (r.created_time) t = Date.parse(r.created_time) || 0
      return t >= range.start && t < range.end
    }

    const isEffective = (r) => {
      const st = String(r.fields?.['状态'] || '待审').trim()
      return st !== '拒绝' && st !== '黑名单'
    }

    // 1) 去重：设备指纹 / 手机号 / 微信号 在对应周期内是否已申请
    //    卫生巾按月，吃饭按周
    const periodRange = type === 'pad' ? monthRange : weekRange
    const periodLabel = type === 'pad' ? '本月' : '本周'
    const dupFound = records.some((r) => {
      if (!isInPeriod(r, periodRange)) return false
      if (!isEffective(r)) return false
      const rFp = simpleHash(String(r.fields?.['设备指纹'] || ''))
      const rPhone = simpleHash(String(r.fields?.['手机号'] || ''))
      const rWx = simpleHash(String(r.fields?.['微信号'] || '').toLowerCase())
      return rFp === fpHash || rPhone === phoneHash || rWx === wechatHash
    })
    if (dupFound) {
      return res.status(409).json({ error: `你${periodLabel}已申请过此补助，请下个周期再试` })
    }

    // 2) 名额总量校验
    const periodCount = records.filter((r) =>
      String(r.fields?.['申请类型'] || '') === type
      && isInPeriod(r, periodRange)
      && isEffective(r)
    ).length
    const max = type === 'pad' ? PAD_MONTHLY_MAX : MEAL_WEEKLY_MAX
    if (periodCount >= max) {
      return res.status(409).json({ error: `${periodLabel}名额已满，请下个周期再试` })
    }

    // 3) 黑名单检查（任何周期内被标记为黑名单的设备/手机/微信号永久拒绝）
    const blacklisted = records.some((r) => {
      if (String(r.fields?.['状态'] || '') !== '黑名单') return false
      const rFp = simpleHash(String(r.fields?.['设备指纹'] || ''))
      const rPhone = simpleHash(String(r.fields?.['手机号'] || ''))
      const rWx = simpleHash(String(r.fields?.['微信号'] || '').toLowerCase())
      return rFp === fpHash || rPhone === phoneHash || rWx === wechatHash
    })
    if (blacklisted) {
      return res.status(403).json({ error: '申请资格受限，如有异议请联系站方' })
    }

    // 4) 写入飞书
    const fields = {
      '申请类型': type,
      '微信号': wechat,
      '手机号': phone,
      '收件地址': address,
      '收款码': payCode,
      '困难简述': desc,
      '设备指纹': fingerprint,
      '状态': '待审',
      '申请时间': Date.now()
    }

    await createRecord(token, env.appToken, tableId, fields)

    return res.status(200).json({
      success: true,
      message: '申请已收到，审核结果会在 48 小时内通知'
    })
  } catch (err) {
    console.error('[aid api] 写入失败：', err.message)
    return res.status(500).json({ error: '申请失败，请稍后重试' })
  }
}

// ============================================================
// 剩余名额查询（脱敏：只返回数字，不返回任何申请记录）
// ============================================================
async function getQuota(req, res) {
  const env = requireEnv()
  if (!env) {
    // 未配置飞书时返回默认名额，让前端正常展示
    return res.status(200).json({
      pad: { remaining: PAD_MONTHLY_MAX, max: PAD_MONTHLY_MAX, period: '月' },
      meal: { remaining: MEAL_WEEKLY_MAX, max: MEAL_WEEKLY_MAX, period: '周' }
    })
  }
  const tableId = getTableId('aid')
  if (!tableId) {
    return res.status(200).json({
      pad: { remaining: PAD_MONTHLY_MAX, max: PAD_MONTHLY_MAX, period: '月' },
      meal: { remaining: MEAL_WEEKLY_MAX, max: MEAL_WEEKLY_MAX, period: '周' }
    })
  }

  try {
    const token = await getToken(env.appId, env.appSecret)
    const records = await listRecords(token, env.appToken, tableId)

    const monthRange = getMonthRange()
    const weekRange = getWeekRange()

    const isInPeriod = (r, range) => {
      const ts = r.fields?.['申请时间']
      let t = 0
      if (typeof ts === 'number') t = ts
      else if (typeof ts === 'string') t = Date.parse(ts) || 0
      else if (r.created_time) t = Date.parse(r.created_time) || 0
      return t >= range.start && t < range.end
    }
    const isEffective = (r) => {
      const st = String(r.fields?.['状态'] || '待审').trim()
      return st !== '拒绝' && st !== '黑名单'
    }

    const padUsed = records.filter((r) =>
      String(r.fields?.['申请类型'] || '') === 'pad'
      && isInPeriod(r, monthRange)
      && isEffective(r)
    ).length
    const mealUsed = records.filter((r) =>
      String(r.fields?.['申请类型'] || '') === 'meal'
      && isInPeriod(r, weekRange)
      && isEffective(r)
    ).length

    return res.status(200).json({
      pad: {
        remaining: Math.max(0, PAD_MONTHLY_MAX - padUsed),
        max: PAD_MONTHLY_MAX,
        period: '月'
      },
      meal: {
        remaining: Math.max(0, MEAL_WEEKLY_MAX - mealUsed),
        max: MEAL_WEEKLY_MAX,
        period: '周'
      }
    })
  } catch (err) {
    console.error('[aid api] 名额查询失败：', err.message)
    // 查询失败时返回默认名额，不阻断前端展示
    return res.status(200).json({
      pad: { remaining: PAD_MONTHLY_MAX, max: PAD_MONTHLY_MAX, period: '月' },
      meal: { remaining: MEAL_WEEKLY_MAX, max: MEAL_WEEKLY_MAX, period: '周' }
    })
  }
}
