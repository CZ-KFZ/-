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
  // 2) 分隔符模式：优先 |，其次换行，再次分号，最后逗号
  let parts
  if (trimmed.includes('|')) {
    parts = trimmed.split('|')
  } else if (trimmed.includes('\n')) {
    parts = trimmed.split(/\r?\n/)
  } else if (trimmed.includes(';')) {
    parts = trimmed.split(';')
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

const TITLE_FIELDS = ['文章标题', '对应文章标题', '标题', '对应文章', '合集名', '合集标题', '对应合集']
const COLLECTION_TITLE_FIELDS = ['合集名', '名称', '标题', '合集标题']
const POOL_FIELDS = ['兑换码池', '兑换码', '卡密池', '码池']
const USED_POOL_FIELDS = ['已用兑换码', '已用码', '已使用码']
const COUNT_FIELDS = ['总数', '总量', '数量']
const USED_COUNT_FIELDS = ['已用数', '已用', '已使用数']
const ARTICLE_TITLE_FIELDS = ['标题', '文章标题', '名称']
const COLLECTION_LINK_FIELDS = ['包含文章', '关联文章', '文章列表']

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
  if (!env) return res.status(200).json({ ok: false, message: '服务器未配置飞书环境变量（缺 FEISHU_APP_ID / FEISHU_APP_SECRET / FEISHU_APP_TOKEN）' })

  const codesTableId = getTableId('codes')
  if (!codesTableId) return res.status(200).json({ ok: false, message: '未配置 FEISHU_TABLE_CODES 环境变量（兑换码表 ID）' })
  const articlesTableId = getTableId('articles')
  if (!articlesTableId) return res.status(200).json({ ok: false, message: '未配置 FEISHU_TABLE_ARTICLES 环境变量（文章表 ID）' })

  let body = req.body
  if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch { body = {} }
  }
  body = body || {}
  const userCode = String(body.code || '').trim().toUpperCase()
  if (!userCode) return res.status(200).json({ ok: false, message: '请输入兑换码' })
  const userArticleTitle = String(body.articleTitle || '').trim()
  const userCollectionName = String(body.collectionName || '').trim()
  const redeemType = String(body.type || 'article').toLowerCase() // 'article' | 'collection'

  // 模糊匹配：去除书名号、引号、空格后再比较
  const normalizeTitle = (t) => String(t || '')
    .replace(/[\s《》""''「」『』'"]/g, '')
    .toLowerCase()

  try {
    const token = await getToken(env.appId, env.appSecret)

    // 1) 读兑换码表
    const codeRows = await listRecords(token, env.appToken, codesTableId)

    // 2) 按标题/合集名匹配到对应行
    let targetRow = null
    const matchKey = redeemType === 'collection' ? userCollectionName : userArticleTitle
    const matchFields = redeemType === 'collection'
      ? [...COLLECTION_TITLE_FIELDS, ...TITLE_FIELDS]
      : TITLE_FIELDS

    if (matchKey) {
      // 2a) 严格匹配
      targetRow = codeRows.find((r) => {
        const t = extractText(findField(r.fields || {}, matchFields))
        return t === matchKey
      })
      // 2b) 模糊匹配
      if (!targetRow) {
        const userNorm = normalizeTitle(matchKey)
        targetRow = codeRows.find((r) => {
          const t = extractText(findField(r.fields || {}, matchFields))
          return normalizeTitle(t) === userNorm
        })
      }
      if (!targetRow) {
        const label = redeemType === 'collection' ? '合集' : '文章'
        return res.status(200).json({
          ok: false,
          message: `该${label}「${matchKey}」未在兑换码表中配置，请检查飞书「兑换码」表是否已添加该${label}对应的行`
        })
      }
    } else {
      targetRow = codeRows[0]
    }
    if (!targetRow) return res.status(200).json({ ok: false, message: '兑换码表为空' })

    const targetFields = targetRow.fields || {}
    const rowTitle = extractText(findField(targetFields, matchFields))

    // 3) 解析兑换码池
    const poolText = extractText(findField(targetFields, POOL_FIELDS))
    const { list: pool, isJson: poolIsJson } = parseCodeList(poolText)

    if (pool.length === 0) return res.status(200).json({ ok: false, message: '兑换码池为空' })

    // 4) 在池中查找用户输入的码
    const idx = pool.indexOf(userCode)
    if (idx === -1) {
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

    const poolFieldName = POOL_FIELDS.find(k => targetFields[k] !== undefined && targetFields[k] !== null && targetFields[k] !== '') || POOL_FIELDS[0]
    const usedPoolFieldName = USED_POOL_FIELDS.find(k => targetFields[k] !== undefined && targetFields[k] !== null && targetFields[k] !== '') || USED_POOL_FIELDS[0]
    const countFieldName = COUNT_FIELDS.find(k => targetFields[k] !== undefined && targetFields[k] !== null) || null
    const usedCountFieldName = USED_COUNT_FIELDS.find(k => targetFields[k] !== undefined && targetFields[k] !== null) || null

    const updatePatch = {
      [poolFieldName]: stringifyCodeList(newPool, poolIsJson),
      [usedPoolFieldName]: stringifyCodeList(newUsedPool, poolIsJson)
    }
    if (countFieldName) updatePatch[countFieldName] = newPool.length
    if (usedCountFieldName) updatePatch[usedCountFieldName] = newUsedPool.length

    await updateRecord(token, env.appToken, codesTableId, targetRow.record_id, updatePatch)

    // 6) 分支：合集返回合集内所有文章 id；单篇返回文章全文
    if (redeemType === 'collection') {
      // 合集核销：读合集表，找到对应合集行，取「包含文章」多向关联里的 record_id 列表
      const collectionsTableId = getTableId('collections')
      if (!collectionsTableId) {
        return res.status(200).json({ ok: false, message: '未配置 FEISHU_TABLE_COLLECTIONS 环境变量（合集表 ID）' })
      }
      const collectionRows = await listRecords(token, env.appToken, collectionsTableId)
      const userNorm = normalizeTitle(userCollectionName || rowTitle)
      const collectionRow = collectionRows.find((r) => {
        const t = extractText(findField(r.fields || {}, COLLECTION_TITLE_FIELDS))
        return normalizeTitle(t) === userNorm || t === userCollectionName || t === rowTitle
      })
      if (!collectionRow) {
        return res.status(200).json({ ok: false, message: '合集表里没找到对应合集，请检查「兑换码」表标题与「合集」表合集名是否一致' })
      }

      const cFields = collectionRow.fields || {}
      const linkedRaw = findField(cFields, COLLECTION_LINK_FIELDS) || []
      const linkedArr = Array.isArray(linkedRaw) ? linkedRaw : [linkedRaw]
      // 多向关联字段返回 [{ record_ids: [..], table_id, text, text_arr, type }]
      // record_ids 是复数（带 s），嵌套在数组第一个对象里
      const firstLinked = linkedArr[0] || {}
      const articleIds = Array.isArray(firstLinked.record_ids)
        ? firstLinked.record_ids.filter(Boolean)
        : (Array.isArray(firstLinked.record_id)
            ? firstLinked.record_id.filter(Boolean)
            : linkedArr.map((item) => (item && (item.record_id || item.recordId)) || '').filter(Boolean))

      if (!articleIds.length) {
        return res.status(200).json({ ok: false, message: '该合集没有关联任何文章，请在飞书「合集」表的「包含文章」字段里勾选文章' })
      }

      return res.status(200).json({
        ok: true,
        type: 'collection',
        collectionId: collectionRow.record_id,
        collectionName: extractText(findField(cFields, COLLECTION_TITLE_FIELDS)),
        articleIds,
        unlockedCount: articleIds.length
      })
    }

    // 单篇核销：查文章表返回全文
    const allArticles = await listRecords(token, env.appToken, articlesTableId)
    const rowNorm = normalizeTitle(rowTitle)
    const userNorm = normalizeTitle(userArticleTitle)
    const article = allArticles.find((a) => {
      const t = extractText(findField(a.fields || {}, ARTICLE_TITLE_FIELDS))
      if (!t) return false
      const tNorm = normalizeTitle(t)
      return t === rowTitle || t === userArticleTitle ||
             tNorm === rowNorm || tNorm === userNorm
    })

    if (!article) return res.status(200).json({ ok: false, message: '该兑换码对应的文章不存在或已下架（请检查飞书文章表和兑换码表的标题是否一致）' })

    const artFields = article.fields || {}
    const fullContent = extractText(artFields['全文内容'] || artFields['全文'] || artFields['付费正文'] || artFields['正文'] || '')
    const articleTitle = extractText(findField(artFields, ARTICLE_TITLE_FIELDS))

    return res.status(200).json({
      ok: true,
      type: 'article',
      articleId: article.record_id,
      articleTitle,
      articleContent: fullContent
    })
  } catch (err) {
    console.error('[redeem v2]', err.message)
    return res.status(200).json({ ok: false, message: '核销服务异常：' + err.message })
  }
}
