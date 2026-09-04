// ============================================================
// EchoVerse · Vercel Serverless Function
// 飞书多维表格 API 代理（只读查询）
//
// 环境变量（在 Vercel 后台配置）：
//   FEISHU_APP_ID / FEISHU_APP_SECRET / FEISHU_APP_TOKEN
//   FEISHU_TABLE_ARTICLES / PROJECTS / NOTES / TIMELINE / SETTINGS / CODES
// ============================================================

import {
  requireEnv,
  getTableId,
  getToken,
  listRecords,
  getFirstRecord
} from './_feishu-helpers.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const { type } = req.query

  const env = requireEnv()
  if (!env) {
    return res.status(200).json({ error: '未配置飞书环境变量', fallback: true })
  }
  const tableId = getTableId(type)
  if (!tableId) {
    if (type !== 'articles' && type !== 'projects' && type !== 'notes' && type !== 'timeline' && type !== 'settings' && type !== 'codes') {
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
