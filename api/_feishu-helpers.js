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
  collections: 'FEISHU_TABLE_COLLECTIONS',
  qa: 'FEISHU_TABLE_QA',
  subscribers: 'FEISHU_TABLE_SUBSCRIBERS',
  aid: 'FEISHU_TABLE_AID'
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

// 新增一条记录到飞书多维表格
export async function createRecord(token, appToken, tableId, fields) {
  const url = `${FEISHU_BASE}/bitable/v1/apps/${appToken}/tables/${tableId}/records`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify({ fields })
  })
  const parsed = await safeJson(res)
  if (!parsed.ok) throw new Error(`新增记录 ${parsed.error}`)
  const data = parsed.data
  if (data.code !== 0) throw new Error(`新增记录失败: ${data.msg}`)
  return data.data || {}
}

// 上传附件到飞书（用于多维表格附件字段）
// 返回 file_token，写入附件字段时格式：[{ file_token }]
// 参数：base64Data (data:image/...;base64,xxx)，fileName
export async function uploadAttachment(token, appToken, base64Data, fileName) {
  // 解析 base64
  const matches = base64Data.match(/^data:(image\/\w+);base64,(.+)$/)
  if (!matches) throw new Error('图片格式不合法')
  const mimeType = matches[1]
  const base64 = matches[2]
  const buffer = Buffer.from(base64, 'base64')

  // 构造 multipart/form-data
  const boundary = '----EchoVerseBoundary' + Date.now()
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file_name"\r\n\r\n${fileName}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="parent_type"\r\n\r\nbitable_file\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="parent_node"\r\n\r\n${appToken}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="size"\r\n\r\n${buffer.length}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`),
    buffer,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ])

  const url = `${FEISHU_BASE}/drive/v1/medias/upload_all`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`
    },
    body
  })
  const parsed = await safeJson(res)
  if (!parsed.ok) throw new Error(`上传附件 ${parsed.error}`)
  const data = parsed.data
  if (data.code !== 0) throw new Error(`上传附件失败: ${data.msg}`)
  return data.data?.file_token
}
