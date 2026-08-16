// ============================================================
// EchoVerse · Vercel Serverless Function
// 飞书多维表格附件下载代理
//
// 作用：前端不能直接访问飞书附件（临时 URL 带 session、跨域、需鉴权），
//      由这个后端函数：换 token → 拿临时下载 URL → 流式透传给前端。
//
// 调用：GET /api/feishu-file?file_token=xxx&name=文件名.jpg
// 返回：附件二进制（带正确 Content-Type，可直接 <img src=...> 用）
//
// 依赖环境变量：FEISHU_APP_ID / FEISHU_APP_SECRET
// ============================================================

const FEISHU_BASE = 'https://open.feishu.cn/open-apis'

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
// 主处理函数
// ------------------------------------------------------------
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { file_token, name } = req.query
  if (!file_token) {
    return res.status(400).json({ error: '缺少 file_token 参数' })
  }

  const appId = process.env.FEISHU_APP_ID
  const appSecret = process.env.FEISHU_APP_SECRET
  if (!appId || !appSecret) {
    return res.status(500).json({ error: '未配置飞书凭证' })
  }

  try {
    const token = await getToken(appId, appSecret)

    // 1) 拿临时下载 URL
    const urlRes = await fetch(
      `${FEISHU_BASE}/drive/v1/medias/batch_get_tmp_download_url?file_tokens=${encodeURIComponent(file_token)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const urlData = await urlRes.json()
    if (urlData.code !== 0 || !urlData.data?.tmp_download_urls?.length) {
      return res.status(404).json({
        error: '获取下载链接失败: ' + (urlData.msg || '未知错误')
      })
    }
    const tmpUrl = urlData.data.tmp_download_urls[0].tmp_download_url

    // 2) 流式代理下载并透传给前端
    const fileRes = await fetch(tmpUrl)
    if (!fileRes.ok) {
      return res.status(fileRes.status).json({ error: `下载失败: ${fileRes.status}` })
    }

    const contentType = fileRes.headers.get('content-type') || 'application/octet-stream'
    res.setHeader('Content-Type', contentType)
    // 附件内容稳定（file_token 不变就指向同一文件），可长缓存
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable')
    if (name) {
      res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(name)}`)
    }

    const buf = Buffer.from(await fileRes.arrayBuffer())
    return res.status(200).send(buf)
  } catch (err) {
    console.error('[feishu-file]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
