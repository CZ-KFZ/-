// ============================================================
// EchoVerse · Vercel Serverless Function
// 飞书多维表格 API 代理
//
// 作用：前端不能直接调飞书 API（会暴露密钥），由这个后端函数代理。
// 鉴权：用 FEISHU_APP_ID + FEISHU_APP_SECRET 换 tenant_access_token，
//       再调多维表格 API 读取记录。
//
// 环境变量（在 Vercel 后台配置）：
//   FEISHU_APP_ID        飞书自建应用的 App ID
//   FEISHU_APP_SECRET    飞书自建应用的 App Secret
//   FEISHU_APP_TOKEN     多维表格的 app_token（URL 里 /base/ 后面那串）
//   FEISHU_TABLE_*       各数据表的 table_id（可选，不配则对应类型走 fallback）
//     FEISHU_TABLE_ARTICLES    文章表
//     FEISHU_TABLE_PROJECTS    作品表
//     FEISHU_TABLE_NOTES       笔记表
//     FEISHU_TABLE_TIMELINE    成长轨迹表
//     FEISHU_TABLE_SETTINGS    站点设置表
// ============================================================

const FEISHU_BASE = 'https://open.feishu.cn/open-apis'

// 各数据表的环境变量名映射
const TABLE_ENV_MAP = {
  articles: 'FEISHU_TABLE_ARTICLES',
  projects: 'FEISHU_TABLE_PROJECTS',
  notes: 'FEISHU_TABLE_NOTES',
  timeline: 'FEISHU_TABLE_TIMELINE',
  settings: 'FEISHU_TABLE_SETTINGS'
}

// ------------------------------------------------------------
// 获取 tenant_access_token
// ------------------------------------------------------------
async function getToken(appId, appSecret) {
  const res = await fetch(`${FEISHU_BASE}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret })
  })
  const data = await res.json()
  if (data.code !== 0) {
    throw new Error(`获取 token 失败: ${data.msg}`)
  }
  return data.tenant_access_token
}

// ------------------------------------------------------------
// 读取多维表格记录（自动翻页）
// ------------------------------------------------------------
async function listRecords(token, appToken, tableId) {
  let allRecords = []
  let pageToken = ''
  let hasMore = true

  while (hasMore) {
    const url = new URL(
      `${FEISHU_BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/records`
    )
    url.searchParams.set('page_size', '500')
    if (pageToken) url.searchParams.set('page_token', pageToken)

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    })
    const data = await res.json()
    if (data.code !== 0) {
      throw new Error(`读取记录失败: ${data.msg}`)
    }
    allRecords = allRecords.concat(data.data.items || [])
    hasMore = data.data.has_more
    pageToken = data.data.page_token || ''
  }

  return allRecords
}

// ------------------------------------------------------------
// 读取单条记录（站点设置）
// ------------------------------------------------------------
async function getFirstRecord(token, appToken, tableId) {
  const records = await listRecords(token, appToken, tableId)
  return records[0] || null
}

// ------------------------------------------------------------
// 主处理函数
// ------------------------------------------------------------
export default async function handler(req, res) {
  // 只允许 GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { type } = req.query

  // 校验环境变量
  const appId = process.env.FEISHU_APP_ID
  const appSecret = process.env.FEISHU_APP_SECRET
  const appToken = process.env.FEISHU_APP_TOKEN

  if (!appId || !appSecret || !appToken) {
    return res.status(200).json({
      error: '未配置飞书环境变量',
      fallback: true
    })
  }

  const tableEnv = TABLE_ENV_MAP[type]
  if (!tableEnv) {
    return res.status(400).json({ error: `未知的数据类型: ${type}` })
  }
  const tableId = process.env[tableEnv]
  if (!tableId) {
    return res.status(200).json({
      error: `未配置 ${tableEnv}`,
      fallback: true
    })
  }

  try {
    // 1) 拿 token
    const token = await getToken(appId, appSecret)

    // 2) 读数据
    let records
    if (type === 'settings') {
      const record = await getFirstRecord(token, appToken, tableId)
      records = record ? [record] : []
    } else {
      records = await listRecords(token, appToken, tableId)
    }

    // 3) 返回原始记录（前端解析字段）
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
    return res.status(200).json({
      success: true,
      records: records
    })
  } catch (err) {
    console.error('[feishu]', err.message)
    return res.status(200).json({
      error: err.message,
      fallback: true
    })
  }
}
