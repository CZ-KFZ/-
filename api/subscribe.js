// ============================================================
// EchoVerse · 邮箱订阅 API
// 将访客邮箱写入飞书多维表格「订阅者」表
//
// 环境变量：FEISHU_TABLE_SUBSCRIBERS（订阅者表的 Table ID）
//
// 飞书表格字段约定：
//   邮箱（文本）· 订阅时间（日期）· 来源（文本，可选）· IP（文本，可选）
//
// 用法：POST /api/subscribe  body: { email, source? }
// ============================================================

import { requireEnv, getTableId, getToken, createRecord } from './_feishu-helpers.js'

// 简单邮箱格式校验
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export default async function handler(req, res) {
  // 只允许 POST
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // CORS：允许前端跨域调用（部署在同域时可省略）
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'POST')

  // 解析请求体
  let body = {}
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
  } catch {
    return res.status(400).json({ error: '请求体不是合法 JSON' })
  }

  const email = String(body.email || '').trim()
  const source = String(body.source || '首页订阅').trim()

  if (!email) {
    return res.status(400).json({ error: '邮箱不能为空' })
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: '邮箱格式不正确' })
  }

  // 检查飞书环境变量
  const env = requireEnv()
  if (!env) {
    return res.status(200).json({ error: '未配置飞书环境变量，订阅功能暂不可用', fallback: true })
  }

  const tableId = getTableId('subscribers')
  if (!tableId) {
    return res.status(200).json({ error: '未配置 FEISHU_TABLE_SUBSCRIBERS，订阅功能暂不可用', fallback: true })
  }

  try {
    const token = await getToken(env.appId, env.appSecret)

    // 写入飞书表格（订阅时间字段有默认值「记录创建时间」，无需手动传）
    const fields = {
      '邮箱': email,
      '来源': source
    }

    await createRecord(token, env.appToken, tableId, fields)

    return res.status(200).json({ success: true, message: '订阅成功，感谢关注！' })
  } catch (err) {
    console.error('[subscribe api] 写入失败：', err.message)
    return res.status(500).json({ error: '订阅失败，请稍后重试' })
  }
}
