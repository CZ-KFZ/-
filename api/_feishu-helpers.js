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

// 表单 share_token 映射（混合方案用 form-submit 写入）
const FORM_ENV_MAP = {
  aid: 'FEISHU_FORM_AID'
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

export function getFormShareToken(type) {
  const envName = FORM_ENV_MAP[type]
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

// ============================================================
// 飞书表单提交（混合方案：用 form-submit 写入，字段格式与 records API 略有不同）
// ============================================================

// 上传附件给 form-submit 用（parent_type 是 bitable_tmp_point，需要带 share_token）
// 返回 file_token，form-submit 的附件字段格式：[{ file_token }]（跟 records API 一样）
export async function uploadFormAttachment(token, appToken, shareToken, base64Data, fileName) {
  const matches = base64Data.match(/^data:(image\/\w+);base64,(.+)$/)
  if (!matches) throw new Error('图片格式不合法')
  const mimeType = matches[1]
  const base64 = matches[2]
  const buffer = Buffer.from(base64, 'base64')

  const boundary = '----EchoVerseForm' + Date.now()
  const extra = JSON.stringify({ share_token: shareToken })
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file_name"\r\n\r\n${fileName}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="parent_type"\r\n\r\nbitable_tmp_point\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="parent_node"\r\n\r\n${appToken}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="size"\r\n\r\n${buffer.length}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="extra"\r\n\r\n${extra}\r\n`),
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
  if (!parsed.ok) throw new Error(`form 附件上传 ${parsed.error}`)
  const data = parsed.data
  if (data.code !== 0) throw new Error(`form 附件上传失败: ${data.msg}`)
  return data.data?.file_token
}

// 通过表单 API 提交记录（混合方案）
// 注意：字段格式与 records API 略有不同：
//   - select 字段用字符串 "选项名"，不是数组 ["选项名"]
//   - 不在表单里的字段（如状态、申请时间、设备指纹）不要传，飞书会用表格默认值/留空
//   - 附件字段仍用 [{ file_token }] 格式
// 参数：shareToken（表单分享 token），content（字段值对象）
export async function submitForm(token, shareToken, content) {
  const url = `${FEISHU_BASE}/base/v3/bases/tables/forms/submit`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify({ share_token: shareToken, content })
  })
  const parsed = await safeJson(res)
  if (!parsed.ok) throw new Error(`form 提交 ${parsed.error}`)
  const data = parsed.data
  if (data.code !== 0) throw new Error(`form 提交失败: ${data.msg}`)
  return data.data || {}
}
