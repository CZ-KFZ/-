// ============================================================
// EchoVerse · 兑换码核销 v2（单行存储）
//
// 1 篇文章 1 行，兑换码池以「|」分隔存于长文本字段
//   飞书「兑换码」表字段：
//   - 文章标题（文本）           → 谁在定义"阴"与"阳"？
//   - 兑换码池（长文本）         → CODE1|CODE2|CODE3|...
//   - 已用兑换码（长文本）       → CODE4|...（初始为空）
//   - 总数（数字）               → 1000
//   - 已用数（数字）             → 0
//
// 兼容：池字段若以「[」开头则按 JSON 数组解析（向后兼容旧数据）
//
// 流程：
//   1) 读取兑换码表（按文章标题匹配到那 1 行）
//   2) 解析「兑换码池」→ 查找用户输入的码
//   3) 找到 → 从池中删除 + 加到「已用兑换码」→ 回写飞书
//   4) 查文章表返回全文
// ============================================================

import {
  requireEnv,
  getTableId,
  getToken,
  listRecords,
  updateRecord
} from './_feishu-helpers.js'

// 飞书长文本字段可能返回 [{ text: "xxx" }] 格式
function extractText(val) {
  if (!val) return ''
  if (typeof val === 'string') return val
  if (Array.isArray(val)) {
    return val.map(v => {
      if (typeof v === 'string') return v
      if (v?.text) return v.text
      if (v?.value) return v.value
      return ''
    }).join('')
  }
  if (typeof val === 'object') return val.text || val.value || JSON.stringify(val)
  return String(val)
}

// 解析兑换码列表：兼容 JSON 数组、| 分隔、换行分隔、逗号分隔
// 返回 { list: String[], isJson: Boolean } —— isJson 决定回写时用哪种格式
function parseCodeList(text) {
  if (!text) return { list: [], isJson: false }
  const raw = typeof text === 'string' ? text : String(text)
  const trimmed = raw.trim()
  // 1) JSON 数组（旧数据兼容）
  if (trimmed.startsWith('[')) {
    try {
      const arr = JSON.parse(trimmed)
      if (Array.isArray(arr)) {
        return { list: arr.map(c => String(c).toUpperCase()), isJson: true }
      }
    } catch {
      // JSON 解析失败，降级到分隔符模式
    }
  }
  // 2) 分隔符模式：优先 |，其次换行，最后逗号
  let parts
  if (trimmed.includes('|')) {
    parts = trimmed.split('|')
  } else if (trimmed.includes('\n')) {
    parts = trimmed.split(/\r?\n/)
  } else {
    parts = trimmed.split(',')
  }
  const list = parts
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .map(s => s.toUpperCase())
  return { list, isJson: false }
}

// 按原格式回写兑换码列表
function stringifyCodeList(list, isJson) {
  if (isJson) return JSON.stringify(list)
  return list.join('|')
}

function findField(fields, candidates) {
  for (const k of candidates) {
    if (fields[k] !== undefined && fields[k] !== null && fields[k] !== '') return fields[k]
  }
  return ''
}

const TITLE_FIELDS = ['文章标题', '对应文章标题', '标题', '对应文章']
const POOL_FIELDS = ['兑换码池', '兑换码', '卡密池', '码池']
const USED_POOL_FIELDS = ['已用兑换码', '已用码', '已使用码']
const COUNT_FIELDS = ['总数', '总量', '数量']
const USED_COUNT_FIELDS = ['已用数', '已用', '已使用数']
const ARTICLE_TITLE_FIELDS = ['标题', '文章标题', '名称']

export default async function handler(req, res) {
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
  if (!codesTableId) return res.status(200).json({ ok: false, message: '未配置兑换码表' })
  const articlesTableId = getTableId('articles')
  if (!articlesTableId) return res.status(200).json({ ok: false, message: '未配置文章表' })

  let body = req.body
  if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch { body = {} }
  }
  body = body || {}
  const userCode = String(body.code || '').trim().toUpperCase()
  if (!userCode) return res.status(200).json({ ok: false, message: '请输入兑换码' })
  const userArticleTitle = String(body.articleTitle || '').trim()

  try {
    const token = await getToken(env.appId, env.appSecret)

    // 1) 读兑换码表（通常只有几行，每行 1 篇文章）
    const codeRows = await listRecords(token, env.appToken, codesTableId)

    // 2) 按文章标题匹配到对应行
    let targetRow = null
    if (userArticleTitle) {
      targetRow = codeRows.find((r) => {
        const t = extractText(findField(r.fields || {}, TITLE_FIELDS))
        return t === userArticleTitle
      })
    }
    // 没匹配到就取第一行（兜底）
    if (!targetRow) targetRow = codeRows[0]
    if (!targetRow) return res.status(200).json({ ok: false, message: '兑换码表为空' })

    const targetFields = targetRow.fields || {}
    const rowArticleTitle = extractText(findField(targetFields, TITLE_FIELDS))

    // 3) 解析兑换码池（兼容 JSON 数组与 | 分隔两种格式）
    const poolText = extractText(findField(targetFields, POOL_FIELDS))
    const { list: pool, isJson: poolIsJson } = parseCodeList(poolText)

    if (pool.length === 0) return res.status(200).json({ ok: false, message: '兑换码池为空' })

    // 4) 在池中查找用户输入的码
    const idx = pool.indexOf(userCode)
    if (idx === -1) {
      // 检查是否在已用列表里
      const usedText = extractText(findField(targetFields, USED_POOL_FIELDS))
      const usedPool = parseCodeList(usedText).list
      if (usedPool.includes(userCode)) {
        return res.status(200).json({ ok: false, message: '该兑换码已使用' })
      }
      return res.status(200).json({ ok: false, message: '兑换码不存在或格式不正确' })
    }

    // 5) 核销：从池中删除 + 加入已用列表
    const newPool = [...pool]
    newPool.splice(idx, 1)

    const usedText = extractText(findField(targetFields, USED_POOL_FIELDS))
    const newUsedPool = [...parseCodeList(usedText).list, userCode]

    // 找到字段名用于回写
    const poolFieldName = POOL_FIELDS.find(k => targetFields[k] !== undefined && targetFields[k] !== null && targetFields[k] !== '') || POOL_FIELDS[0]
    const usedPoolFieldName = USED_POOL_FIELDS.find(k => targetFields[k] !== undefined && targetFields[k] !== null && targetFields[k] !== '') || USED_POOL_FIELDS[0]
    const countFieldName = COUNT_FIELDS.find(k => targetFields[k] !== undefined && targetFields[k] !== null) || null
    const usedCountFieldName = USED_COUNT_FIELDS.find(k => targetFields[k] !== undefined && targetFields[k] !== null) || null

    const updatePatch = {
      // 按原格式回写：池字段是什么格式，已用字段也用同样格式
      [poolFieldName]: stringifyCodeList(newPool, poolIsJson),
      [usedPoolFieldName]: stringifyCodeList(newUsedPool, poolIsJson)
    }
    if (countFieldName) updatePatch[countFieldName] = newPool.length
    if (usedCountFieldName) updatePatch[usedCountFieldName] = newUsedPool.length

    await updateRecord(token, env.appToken, codesTableId, targetRow.record_id, updatePatch)

    // 6) 查文章表返回全文
    const allArticles = await listRecords(token, env.appToken, articlesTableId)
    const article = allArticles.find((a) => {
      const t = extractText(findField(a.fields || {}, ARTICLE_TITLE_FIELDS))
      return t && (t === rowArticleTitle || t === userArticleTitle)
    }) || (rowArticleTitle && allArticles.find((a) => {
      const t = extractText(findField(a.fields || {}, ARTICLE_TITLE_FIELDS))
      return t === rowArticleTitle
    }))

    if (!article) return res.status(200).json({ ok: false, message: '该兑换码对应的文章不存在或已下架' })

    const artFields = article.fields || {}
    const fullContent = extractText(artFields['全文内容'] || artFields['全文'] || artFields['付费正文'] || artFields['正文'] || '')
    const articleTitle = extractText(findField(artFields, ARTICLE_TITLE_FIELDS))

    return res.status(200).json({
      ok: true,
      articleId: article.record_id,
      articleTitle,
      articleContent: fullContent
    })
  } catch (err) {
    console.error('[redeem v2]', err.message)
    return res.status(200).json({ ok: false, message: '核销服务异常：' + err.message })
  }
}
