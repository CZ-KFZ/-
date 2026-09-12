// ============================================================
// EchoVerse · Vercel Serverless Function
// 飞书多维表格 API 代理（只读查询）
//
// 环境变量（在 Vercel 后台配置）：
//   FEISHU_APP_ID / FEISHU_APP_SECRET / FEISHU_APP_TOKEN
//   FEISHU_TABLE_ARTICLES / PROJECTS / NOTES / TIMELINE / SETTINGS / CODES / COLLECTIONS
//
// 用法：
//   /api/feishu?type=articles          单表查询
//   /api/feishu?types=articles,collections  多表合并查询（一次请求，减少冷启动）
// ============================================================

import {
  requireEnv,
  getTableId,
  getToken,
  listRecords,
  getFirstRecord
} from './_feishu-helpers.js'

async function fetchOneType(type, token, env) {
  const tableId = getTableId(type)
  if (!tableId) return { error: `未配置 ${type} 表 Table ID`, records: [] }
  try {
    if (type === 'settings') {
      const r = await getFirstRecord(token, env.appToken, tableId)
      return { records: r ? [r] : [] }
    }
    const records = await listRecords(token, env.appToken, tableId)
    return { records }
  } catch (err) {
    console.error(`[feishu api] ${type}:`, err.message)
    return { error: err.message, records: [] }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const { type, types } = req.query

  const env = requireEnv()
  if (!env) {
    return res.status(200).json({ error: '未配置飞书环境变量', fallback: true })
  }

  // 多表合并查询：?types=articles,collections
  if (types) {
    const typeList = types.split(',').map((t) => t.trim()).filter(Boolean)
    if (!typeList.length) {
      return res.status(400).json({ error: 'types 参数为空' })
    }
    try {
      const token = await getToken(env.appId, env.appSecret)
      // 并行拉取所有表
      const results = await Promise.all(
        typeList.map((t) => fetchOneType(t, token, env))
      )
      const combined = {}
      typeList.forEach((t, i) => {
        combined[t] = results[i].records
      })
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
      return res.status(200).json({ success: true, data: combined })
    } catch (err) {
      console.error('[feishu api] multi:', err.message)
      return res.status(200).json({ error: err.message, fallback: true })
    }
  }

  // 单表查询：?type=articles
  const tableId = getTableId(type)
  if (!tableId) {
    const validTypes = ['articles', 'projects', 'notes', 'timeline', 'settings', 'codes', 'collections', 'qa']
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: `未知的数据类型: ${type}` })
    }
    return res.status(200).json({ error: `未配置 ${type} 表 Table ID`, fallback: true })
  }

  try {
    const token = await getToken(env.appId, env.appSecret)
    let records
    if (type === 'settings') {
      const r = await getFirstRecord(token, env.appToken, tableId)
      records = r ? [r] : []
    } else {
      records = await listRecords(token, env.appToken, tableId)
    }
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
    return res.status(200).json({ success: true, records })
  } catch (err) {
    console.error('[feishu api]', err.message)
    return res.status(200).json({ error: err.message, fallback: true })
  }
}
