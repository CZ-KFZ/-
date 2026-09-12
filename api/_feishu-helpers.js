// ============================================================
// 飞书多维表格 API 公共辅助函数（给 Vercel Serverless Function 用）
// 导出：getToken / listRecords / getFirstRecord / updateRecord
// 注意：本项目 package.json 里 type=module，这里必须用 ESM 语法
// ============================================================

const FEISHU_BASE = 'https://open.feishu.cn/open-apis'

// 安全解析响应：若不是 JSON，返回带原始文本的错误对象（避免抛 JSON parse 错误）
async function safeJson(res) {
  const text = await res.text()
  try {
    return { ok: true, data: JSON.parse(text) }
  } catch (e) {
    return {
      ok: false,
      error: `响应不是 JSON（HTTP ${res.status}）: ${text.slice(0, 200)}`,
      raw: text
    }
  }
}

const TABLE_ENV_MAP = {
  articles: 'FEISHU_TABLE_ARTICLES',
  projects: 'FEISHU_TABLE_PROJECTS',
  notes: 'FEISHU_TABLE_NOTES',
  timeline: 'FEISHU_TABLE_TIMELINE',
  settings: 'FEISHU_TABLE_SETTINGS',
  codes: 'FEISHU_TABLE_CODES',
  collections: 'FEISHU_TABLE_COLLECTIONS'
}

export function requireEnv() {
  const appId = process.env.FEISHU_APP_ID
  const appSecret = process.env.FEISHU_APP_SECRET
  const appToken = process.env.FEISHU_APP_TOKEN
  if (!appId || !appSecret || !appToken) return null
  return { appId, appSecret, appToken }
}

export function getTableId(type) {
  const envName = TABLE_ENV_MAP[type]
  if (!envName) return null
  return process.env[envName] || null
}

// token 缓存（飞书 token 有效期约 2 小时，提前 5 分钟过期）
let cachedToken = null
let tokenExpiry = 0

export async function getToken(appId, appSecret) {
  const now = Date.now()
  if (cachedToken && now < tokenExpiry) {
    return cachedToken
  }
  const res = await fetch(`${FEISHU_BASE}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret })
  })
  const parsed = await safeJson(res)
  if (!parsed.ok) throw new Error(`获取 token ${parsed.error}`)
  const data = parsed.data
  if (data.code !== 0) throw new Error(`获取 token 失败: ${data.msg}`)
  cachedToken = data.tenant_access_token
  // 飞书返回的 expire 单位是秒，提前 5 分钟过期更安全
  const expireSec = data.expire || 7200
  tokenExpiry = now + (expireSec - 300) * 1000
  return cachedToken
}

export async function listRecords(token, appToken, tableId) {
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
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` }
    })
    const parsed = await safeJson(res)
    if (!parsed.ok) throw new Error(`读取记录 ${parsed.error}`)
    const data = parsed.data
    if (data.code !== 0) throw new Error(`读取记录失败: ${data.msg}`)
    allRecords = allRecords.concat(data.data.items || [])
    hasMore = data.data.has_more
    pageToken = data.data.page_token || ''
  }
  return allRecords
}

export async function getFirstRecord(token, appToken, tableId) {
  const records = await listRecords(token, appToken, tableId)
  return records[0] || null
}

export async function updateRecord(token, appToken, tableId, recordId, fields) {
  const url = `${FEISHU_BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/records/${encodeURIComponent(recordId)}`
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify({ fields })
  })
  const parsed = await safeJson(res)
  if (!parsed.ok) throw new Error(`更新记录 ${parsed.error}`)
  const data = parsed.data
  if (data.code !== 0) throw new Error(`更新记录失败: ${data.msg}`)
  return data.data || {}
}
