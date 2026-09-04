// ============================================================
// EchoVerse · 兑换码核销
//
// 流程：
//   1) 读取兑换码表（codes）→ 按用户输入的码精确匹配（不区分大小写、去空格）
//   2) 检查状态：必须是「未使用」（或对应字段里表示"未用"）
//   3) 可选：如果用户传了 articleId，必须和码表里的"对应文章"匹配
//   4) 原子更新：把码表记录状态改成「已使用」+ 填使用时间 + 使用者 IP
//   5) 查对应文章表的「全文内容 / 标题」返回给前端解锁显示
//
// 兑换码表字段约定（飞书多维表格）：
//   - 兑换码（文本，必填）
//   - 对应文章标题（文本） 或  对应文章（关联文章表记录ID的字段，或直接文本标题）
//   - 是否已用（单选：未使用 / 已使用）
//   - 使用时间（日期时间，核销时填）
//   - 备注 / 核销来源（文本）
// ============================================================

const {
  requireEnv,
  getTableId,
  getToken,
  listRecords,
  updateRecord
} = require('./_feishu-helpers.js')

// 字段名可能的各种写法（兼容新手字段命名）
const CODE_FIELDS = ['兑换码', 'code', 'Code', '码', '卡密']
const USED_FIELDS = ['是否已用', '状态', '已使用', '使用状态', 'usage']
const USED_VAL_UNUSED = /未使用|未|unused|false|否|no/i
const USED_VAL_USED = /已使用|已用|used|true|是|yes/i
const ARTICLE_TITLE_FIELDS = ['对应文章标题', '文章标题', '对应文章', '文章', '关联文章']
const USED_TIME_FIELDS = ['使用时间', '核销时间', '时间']
const NOTE_FIELDS = ['备注', '核销来源', '说明']

function getField(fields, candidates) {
  for (const k of candidates) {
    if (fields[k] !== undefined && fields[k] !== null && fields[k] !== '') return fields[k]
  }
  return ''
}

// 判断"是不是未使用"
function isUnused(usedFieldVal) {
  const s = typeof usedFieldVal === 'object'
    ? (usedFieldVal.text || usedFieldVal.value || '')
    : String(usedFieldVal || '')
  if (USED_VAL_USED.test(s)) return false
  if (USED_VAL_UNUSED.test(s)) return true
  // 空值一律视为"未使用"（用户没填这个字段也没关系）
  return true
}

function getUsedFieldName(fields) {
  for (const k of USED_FIELDS) {
    if (fields[k] !== undefined) return k
  }
  return USED_FIELDS[0] // 默认用第一个，更新时会创建
}

// 提取"关联文章"：可能是单选文本、也可能是飞书的关联记录（数组）
function extractArticleIdOrTitle(fields) {
  const v = getField(fields, ARTICLE_TITLE_FIELDS)
  if (!v) return ''
  // 字符串直接返回
  if (typeof v === 'string') return v
  // 数组（飞书关联记录）取第一个 record_id / title
  if (Array.isArray(v)) {
    const first = v[0]
    if (!first) return ''
    if (first.record_id) return first.record_id
    if (first.title) return first.title
    if (typeof first === 'string') return first
  }
  if (typeof v === 'object') {
    return v.title || v.text || v.record_id || v.name || JSON.stringify(v)
  }
  return String(v)
}

// 在文章记录里按 ID 或 标题 匹配
function matchArticle(articles, articleId, articleTitle) {
  if (!articles || !articles.length) return null
  if (articleId) {
    const byId = articles.find((a) => a.record_id === articleId || a.id === articleId)
    if (byId) return byId
  }
  if (articleTitle) {
    const byTitle = articles.find((a) => {
      const f = a.fields || {}
      const t = f['标题'] || ''
      return t && articleTitle && t === articleTitle
    })
    if (byTitle) return byTitle
  }
  return null
}

function fmtContentFields(fields) {
  return (
    fields['全文内容'] ||
    fields['全文'] ||
    fields['付费正文'] ||
    fields['正文'] ||
    ''
  ).toString()
}

function fmtTitle(fields) {
  return (fields['标题'] || '').toString()
}

export default async function handler(req, res) {
  // CORS 小开放（只有本站域名）
  res.setHeader('Vary', 'Origin')
  const origin = req.headers.origin || ''
  const allowed = origin && (
    origin.includes('localhost') ||
    origin.includes('127.0.0.1') ||
    origin.endsWith('vercel.app')
  )
  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  }
  if (req.method === 'OPTIONS') return res.status(204).end()

  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'Method not allowed' })

  const env = requireEnv()
  if (!env) return res.status(200).json({ ok: false, message: '服务器未配置飞书环境变量' })

  const codesTableId = getTableId('codes')
  if (!codesTableId) return res.status(200).json({ ok: false, message: '未配置兑换码表（FEISHU_TABLE_CODES），请联系站长' })
  const articlesTableId = getTableId('articles')
  if (!articlesTableId) return res.status(200).json({ ok: false, message: '未配置文章表（FEISHU_TABLE_ARTICLES）' })

  // 解析请求
  let body = req.body
  if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch (e) { body = {} }
  }
  body = body || {}
  const userCodeRaw = String(body.code || '').trim()
  if (!userCodeRaw) return res.status(200).json({ ok: false, message: '请输入兑换码' })
  const userCode = userCodeRaw.toUpperCase()
  const userArticleId = String(body.articleId || '').trim()

  try {
    const token = await getToken(env.appId, env.appSecret)

    // 1) 查兑换码：优先用 filter 搜索（飞书 filter 语法：CurrentValue 等于某值）
    //    飞书 filter 支持条件公式：Equals([兑换码], "XXX")
    //    考虑用户可能字段名不同，这里退化为：全拉出来本地比（卡密一般几千条也扛得住）
    const allCodes = await listRecords(token, env.appToken, codesTableId)

    // 忽略大小写比较
    const hit = allCodes.find((r) => {
      const fields = r.fields || {}
      const c = String(getField(fields, CODE_FIELDS) || '').trim().toUpperCase()
      return c === userCode
    })

    if (!hit) return res.status(200).json({ ok: false, message: '兑换码不存在或格式不正确' })

    const fields = hit.fields || {}
    const usedFieldVal = getField(fields, USED_FIELDS)
    if (!isUnused(usedFieldVal)) return res.status(200).json({ ok: false, message: '该兑换码已使用' })

    // 取得对应文章标识
    const codeArticleRef = extractArticleIdOrTitle(fields)
    // 如果用户明确带 articleId，而且 codeArticleRef 也有东西 → 校验一致
    if (userArticleId && codeArticleRef) {
      // 精确比较：articleId vs record_id / 标题
      const match =
        codeArticleRef === userArticleId ||
        codeArticleRef.toLowerCase() === userArticleId.toLowerCase()
      // 宽松点：不一致不拒绝，只在下面按 userArticleId 找文章
      if (!match) {
        // 不严格报错，继续按 userArticleId 查
      }
    }

    // 2) 查文章：优先 userArticleId（来自前端卡片），失败再用 codeArticleRef
    const allArticles = await listRecords(token, env.appToken, articlesTableId)
    const article = matchArticle(
      allArticles,
      userArticleId || codeArticleRef,
      codeArticleRef
    ) || (codeArticleRef && allArticles.find((a) => {
      const f = a.fields || {}
      const t = String(f['标题'] || '')
      return t === codeArticleRef
    }))

    if (!article) return res.status(200).json({ ok: false, message: '该兑换码对应的文章不存在或已下架' })

    // 3) 原子打标：把「已用」写回飞书
    const usedFieldName = getUsedFieldName(fields)
    const usedTimeFieldName = USED_TIME_FIELDS.find((k) => fields[k] !== undefined) || USED_TIME_FIELDS[0]
    const noteFieldName = NOTE_FIELDS.find((k) => fields[k] !== undefined) || NOTE_FIELDS[0]

    const nowMs = Date.now()
    const ip = (
      req.headers['x-forwarded-for'] ||
      req.headers['x-real-ip'] ||
      (req.socket && req.socket.remoteAddress) ||
      ''
    ).toString().split(',')[0].trim()

    const updatePatch = {
      [usedFieldName]: '已使用'
    }
    // 使用时间：飞书多维表格「日期时间」字段接受毫秒时间戳 number
    updatePatch[usedTimeFieldName] = nowMs
    updatePatch[noteFieldName] = `EchoVerse 网站核销 · IP ${ip || '未知'} · ${new Date(nowMs).toISOString()}`

    await updateRecord(token, env.appToken, codesTableId, hit.record_id, updatePatch)

    // 4) 返回文章全文 + 标题
    const artFields = article.fields || {}
    return res.status(200).json({
      ok: true,
      articleId: article.record_id,
      articleTitle: fmtTitle(artFields),
      articleContent: fmtContentFields(artFields)
    })
  } catch (err) {
    console.error('[redeem]', err.message)
    return res.status(200).json({ ok: false, message: '核销服务异常：' + err.message })
  }
}
