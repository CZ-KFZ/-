// ============================================================
// 飞书多维表格 API 公共辅助函数（给 Vercel Serverless Function 用）
// 导出：getToken / listRecords / getFirstRecord / updateRecord
// ============================================================

const FEISHU_BASE = 'https://open.feishu.cn/open-apis'

// 各数据表的环境变量名映射（codes 是新增的兑换码表）
const TABLE_ENV_MAP = {
  articles: 'FEISHU_TABLE_ARTICLES',
  projects: 'FEISHU_TABLE_PROJECTS',
  notes: 'FEISHU_TABLE_NOTES',
  timeline: 'FEISHU_TABLE_TIMELINE',
  settings: 'FEISHU_TABLE_SETTINGS',
  codes: 'FEISHU_TABLE_CODES'
}

function requireEnv() {
  const appId = process.env.FEISHU_APP_ID
  const appSecret = process.env.FEISHU_APP_SECRET
  const appToken = process.env.FEISHU_APP_TOKEN
  if (!appId || !appSecret || !appToken) return null
  return { appId, appSecret, appToken }
}

function getTableId(type) {
  const envName = TABLE_ENV_MAP[type]
  if (!envName) return null
  return process.env[envName] || null
}

async function getToken(appId, appSecret) {
  const res = await fetch(`${FEISHU_BASE}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret })
  })
  const data = await res.json()
  if (data.code !== 0) throw new Error(`获取 token 失败: ${data.msg}`)
  return data.tenant_access_token
}

async function listRecords(token, appToken, tableId, filter = null) {
  let allRecords = []
  let pageToken = ''
  let hasMore = true

  while (hasMore) {
    const url = new URL(
      `${FEISHU_BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/records`
    )
    url.searchParams.set('page_size', '500')
    if (pageToken) url.searchParams.set('page_token', pageToken)

    const body = filter ? JSON.stringify({ filter }) : undefined
    const method = filter ? 'POST' : 'GET'
    const headers = { Authorization: `Bearer ${token}` }
    if (filter) headers['Content-Type'] = 'application/json; charset=utf-8'

    const res = await fetch(url, { method, headers, body })
    const data = await res.json()
    if (data.code !== 0) throw new Error(`读取记录失败: ${data.msg}`)
    allRecords = allRecords.concat(data.data.items || [])
    hasMore = data.data.has_more
    pageToken = data.data.page_token || ''
  }
  return allRecords
}

async function getFirstRecord(token, appToken, tableId, filter = null) {
  const records = await listRecords(token, appToken, tableId, filter)
  return records[0] || null
}

/**
 * 更新单条多维表格记录
 * @param {string} token tenant_access_token
 * @param {string} appToken
 * @param {string} tableId
 * @param {string} recordId
 * @param {object} fields 字段对象
 */
async function updateRecord(token, appToken, tableId, recordId, fields) {
  const url = `${FEISHU_BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/records/${encodeURIComponent(recordId)}`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify({ fields })
  })
  const data = await res.json()
  if (data.code !== 0) throw new Error(`更新记录失败: ${data.msg}`)
  return data.data || {}
}

module.exports = {
  TABLE_ENV_MAP,
  requireEnv,
  getTableId,
  getToken,
  listRecords,
  getFirstRecord,
  updateRecord
}
