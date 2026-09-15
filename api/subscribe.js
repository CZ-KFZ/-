// ============================================================
// EchoVerse · 邮箱订阅 API
// 将访客邮箱写入飞书多维表格「订阅者」表
//
// 安全措施：
//   1. 严格邮箱格式校验（长度、字符、域名）
//   2. 邮箱去重（同一邮箱不能重复订阅）
//   3. IP 频率限制（同一 IP 每小时最多 5 次）
//   4. Honeypot 防机器人（隐藏字段，机器人会填）
//   5. 请求体大小限制
//
// 环境变量：FEISHU_TABLE_SUBSCRIBERS（订阅者表的 Table ID）
//
// 飞书表格字段约定：
//   邮箱（文本）· 订阅时间（日期）· 来源（文本）· IP（文本）
//
// 用法：POST /api/subscribe  body: { email, source?, website? }
// ============================================================

import { requireEnv, getTableId, getToken, createRecord, listRecords } from './_feishu-helpers.js'

// ============================================================
// 安全工具函数
// ============================================================

// 严格邮箱格式校验
function isValidEmail(email) {
  if (typeof email !== 'string') return false
  // 长度限制：总长度不超过 254，本地部分不超过 64
  if (email.length > 254) return false
  const [local, domain] = email.split('@')
  if (!local || !domain) return false
  if (local.length > 64) return false
  // 本地部分：允许字母数字和 . _ - + ，但不能以 . 开头或结尾，不能连续 .
  if (!/^[a-zA-Z0-9]([a-zA-Z0-9._+-]*[a-zA-Z0-9])?$/.test(local)) return false
  if (local.includes('..')) return false
  // 域名部分：必须有至少一个点，每段只能含字母数字和 - ，不能以 - 开头或结尾
  const domainParts = domain.split('.')
  if (domainParts.length < 2) return false
  for (const part of domainParts) {
    if (!part || part.length > 63) return false
    if (!/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(part)) return false
  }
  // 顶级域名至少 2 个字符
  const tld = domainParts[domainParts.length - 1]
  if (tld.length < 2) return false
  return true
}

// 从请求中获取客户端 IP
function getClientIp(req) {
  // Vercel 会设置 x-forwarded-for
  const forwarded = req.headers['x-forwarded-for']
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown'
}

// ============================================================
// 内存级频率限制（单实例有效，多实例下可能不完全生效）
// 生产环境建议升级到 Vercel KV (Upstash Redis)
// ============================================================
const ipRateLimit = new Map() // ip -> { count, resetAt }
const emailCooldown = new Map() // email -> timestamp

const RATE_LIMIT_MAX = 5 // 每 IP 每小时最多 5 次
const RATE_LIMIT_WINDOW = 60 * 60 * 1000 // 1 小时
const EMAIL_COOLDOWN = 60 * 1000 // 同一邮箱 1 分钟内不能重复提交

function checkRateLimit(ip) {
  const now = Date.now()
  const record = ipRateLimit.get(ip)
  if (!record || now > record.resetAt) {
    ipRateLimit.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW })
    return { allowed: true }
  }
  if (record.count >= RATE_LIMIT_MAX) {
    const retryAfter = Math.ceil((record.resetAt - now) / 1000)
    return { allowed: false, retryAfter }
  }
  record.count++
  return { allowed: true }
}

function checkEmailCooldown(email) {
  const now = Date.now()
  const lastSubmit = emailCooldown.get(email)
  if (lastSubmit && now - lastSubmit < EMAIL_COOLDOWN) {
    return false
  }
  emailCooldown.set(email, now)
  return true
}

// 定期清理过期的限制记录（防止内存泄漏）
setInterval(() => {
  const now = Date.now()
  for (const [ip, record] of ipRateLimit) {
    if (now > record.resetAt) ipRateLimit.delete(ip)
  }
  for (const [email, ts] of emailCooldown) {
    if (now - ts > EMAIL_COOLDOWN) emailCooldown.delete(email)
  }
}, 10 * 60 * 1000).unref()

// ============================================================
// 主处理函数
// ============================================================
export default async function handler(req, res) {
  // 只允许 POST
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // CORS：限制允许的来源（同域 + localhost + vercel.app）
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
  res.setHeader('Access-Control-Allow-Methods', 'POST')

  // 请求体大小限制：最多 1KB
  const contentLength = parseInt(req.headers['content-length'] || '0', 10)
  if (contentLength > 1024) {
    return res.status(413).json({ error: '请求体过大' })
  }

  // 解析请求体
  let body = {}
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
  } catch {
    return res.status(400).json({ error: '请求体不是合法 JSON' })
  }

  const email = String(body.email || '').trim().toLowerCase()
  const source = String(body.source || '首页订阅').trim().slice(0, 50) // 限制来源长度
  const honeypot = String(body.website || '').trim() // Honeypot 字段，正常人不会填

  // Honeypot 检查：如果填了，说明是机器人
  if (honeypot) {
    // 假装成功，不写入数据库
    return res.status(200).json({ success: true, message: '订阅成功，感谢关注！' })
  }

  // 邮箱不能为空
  if (!email) {
    return res.status(400).json({ error: '邮箱不能为空' })
  }

  // 严格邮箱格式校验
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: '邮箱格式不正确，请输入有效的邮箱地址' })
  }

  // IP 频率限制
  const ip = getClientIp(req)
  const rateCheck = checkRateLimit(ip)
  if (!rateCheck.allowed) {
    res.setHeader('Retry-After', String(rateCheck.retryAfter))
    return res.status(429).json({ error: `提交过于频繁，请 ${rateCheck.retryAfter} 秒后重试` })
  }

  // 同一邮箱冷却时间
  if (!checkEmailCooldown(email)) {
    return res.status(429).json({ error: '该邮箱刚刚已提交，请稍后再试' })
  }

  // 检查飞书环境变量
  const env = requireEnv()
  if (!env) {
    return res.status(200).json({ error: '未配置飞书环境变量，订阅功能暂不可用', fallback: true })
  }

  const tableId = getTableId('subscribers')
  if (!tableId) {
    return res.status(200).json({ error: '未配置 FEISHU_TABLE_SUBSCRIBERS，订阅功能暂不可用', fallback: true })
  }

  try {
    const token = await getToken(env.appId, env.appSecret)

    // 邮箱去重：查询飞书表格，检查该邮箱是否已存在
    try {
      const existingRecords = await listRecords(token, env.appToken, tableId)
      const exists = existingRecords.some((r) => {
        const recordEmail = String(r.fields?.['邮箱'] || '').trim().toLowerCase()
        return recordEmail === email
      })
      if (exists) {
        return res.status(409).json({ error: '该邮箱已订阅，无需重复提交' })
      }
    } catch (queryErr) {
      // 查询失败不阻断订阅，只是跳过去重检查
      console.warn('[subscribe api] 邮箱去重查询失败，跳过去重：', queryErr.message)
    }

    // 写入飞书表格
    const fields = {
      '邮箱': email,
      '来源': source,
      'IP': ip
    }

    await createRecord(token, env.appToken, tableId, fields)

    return res.status(200).json({ success: true, message: '订阅成功，感谢关注！' })
  } catch (err) {
    console.error('[subscribe api] 写入失败：', err.message)
    return res.status(500).json({ error: '订阅失败，请稍后重试' })
  }
}
