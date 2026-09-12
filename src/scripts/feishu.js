// ============================================================
// EchoVerse · 飞书数据层（前端）
// 调 Vercel Serverless Function（/api/feishu）拉飞书多维表格数据
// 解析飞书记录的字段结构（fields 是个对象），含附件 URL 构造
// 当后端未配置或拉取失败时，返回 null 让上层走 mock fallback
// ============================================================

// 是否在开发环境（Vite 注入）
const isDev = import.meta.env.DEV

// ------------------------------------------------------------
// 调后端代理
// ------------------------------------------------------------
async function fetchFromFeishu(type) {
  const url = isDev
    ? `/api/feishu?type=${type}`
    : `https://${window.location.hostname}/api/feishu?type=${type}`

  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    if (data.fallback || !data.success) return null
    return data.records
  } catch (err) {
    console.warn(`[EchoVerse] 飞书数据拉取失败（${type}），使用 mock：`, err.message)
    return null
  }
}

// 多表合并查询：一次请求拉多个表，减少 serverless 冷启动
// 返回 { articles: [...], collections: [...] } 格式
export async function fetchFeishuMulti(typeList) {
  if (!typeList || !typeList.length) return {}
  const url = isDev
    ? `/api/feishu?types=${typeList.join(',')}`
    : `https://${window.location.hostname}/api/feishu?types=${typeList.join(',')}`

  try {
    const res = await fetch(url)
    if (!res.ok) return {}
    const data = await res.json()
    if (data.fallback || !data.success) return {}
    return data.data || {}
  } catch (err) {
    console.warn('[EchoVerse] 多表拉取失败：', err.message)
    return {}
  }
}

// ------------------------------------------------------------
// 解析单选字段：飞书单选返回 { text: "选项名" }，多选返回 [{ text }]
// 这里统一提取出选项名字符串
// ------------------------------------------------------------
function extractOption(fieldValue, fallback = '') {
  if (!fieldValue) return fallback
  if (typeof fieldValue === 'string') return fieldValue
  if (typeof fieldValue === 'object') {
    if (Array.isArray(fieldValue)) {
      const first = fieldValue[0]
      return first ? (first.text || first.value || first.name || fallback) : fallback
    }
    return fieldValue.text || fieldValue.value || fieldValue.name || fallback
  }
  return fallback
}

// ------------------------------------------------------------
// 解析超链接字段：飞书「超链接」类型返回 { text, link } 或
// [{ text, link }]；字符串则原样返回。
// 不解析会导致 href 变成 [object Object]，点击跳到 /object Object
// ------------------------------------------------------------
function extractUrl(fieldValue, fallback = '') {
  if (!fieldValue) return fallback
  if (typeof fieldValue === 'string') return fieldValue
  if (typeof fieldValue === 'object') {
    if (Array.isArray(fieldValue)) {
      const first = fieldValue[0]
      if (!first) return fallback
      return first.link || first.url || first.text || fallback
    }
    return fieldValue.link || fieldValue.url || fieldValue.text || fallback
  }
  return fallback
}

// ------------------------------------------------------------
// 解析附件字段：飞书附件返回 [{ file_token, name, type, url, ... }]
// url 是临时的（带 session），前端不能直接用。
// 要用公开可访问的 URL，需要：
//   - 表格设为"互联网可阅读" + 用 download 接口
//   - 或前端展示时走后端代理下载
// 简化：这里返回 file_token，由后端代理下载（/api/feishu-file?token=xxx）
// ------------------------------------------------------------
function parseAttachment(fieldValue) {
  if (!fieldValue || !Array.isArray(fieldValue) || !fieldValue.length) return null
  const file = fieldValue[0]
  return {
    name: file.name,
    type: file.type,
    // 通过后端代理下载文件（避免暴露 session）
    url: `/api/feishu-file?file_token=${file.file_token}&name=${encodeURIComponent(file.name || '')}`
  }
}

// ------------------------------------------------------------
// 解析飞书记录为文章结构
// 飞书字段约定：标题/分类/分类显示名/日期/阅读时长/摘要/封面/正文/推荐
// ------------------------------------------------------------
export function normalizeArticle(record) {
  const f = record.fields || {}
  const cover = parseAttachment(f['封面'])
  // 是否付费：字段「是否付费」单选，只要不是「免费」或明确「付费」都算付费
  const paidOpt = extractOption(f['是否付费'], '')
  const isPaid = /付费|是|paid|true/i.test(paidOpt)
  const priceRaw = f['售价（元）'] ?? f['售价'] ?? f['价格'] ?? ''
  const price = priceRaw === '' || priceRaw === null || priceRaw === undefined
    ? 0
    : Number(priceRaw) || 0
  const buyUrl = extractUrl(f['购买链接'] || f['付费链接'] || f['商品链接'] || '')
  const fullContent = f['全文内容'] || f['全文'] || f['付费正文'] || ''
  const freeExcerpt = f['免费部分'] || f['试读'] || f['摘要'] || ''
  // 正文格式：单选「Markdown」→ 用 markdown.js 渲染；其他（含空）→ 纯文本段落
  const formatOpt = extractOption(f['正文格式'], '')
  const contentFormat = /markdown|md/i.test(formatOpt) ? 'markdown' : 'plain'

  return {
    id: record.record_id,
    title: f['标题'] || '',
    category: extractOption(f['分类'], 'design'),
    categoryLabel: f['分类显示名'] || extractOption(f['分类'], ''),
    date: formatDate(f['日期']),
    readTime: f['阅读时长'] || '',
    excerpt: f['摘要'] || '',
    content: f['正文'] || '',
    coverImage: cover ? cover.url : null,
    // 隐藏字段：复选框勾选后不在网站显示
    hidden: (() => {
      const raw = f['隐藏'] ?? f['是否隐藏'] ?? f['隐藏文章'] ?? false
      return raw === true || raw === 1 || /是|隐藏|true|yes/i.test(String(raw))
    })(),
    // 推荐字段：兼容复选框(true/false)、单选(是/否)、数字(1/0)
    featured: (() => {
      const raw = f['推荐'] ?? f['是否推荐'] ?? f['首页推荐'] ?? false
      return raw === true || raw === 1 || /是|推荐|true|yes/i.test(String(raw))
    })(),
    // 付费相关
    isPaid,
    price,
    buyUrl,
    fullContent,
    freeExcerpt,
    // 正文渲染格式：plain 纯文本 / markdown
    contentFormat
  }
}

// ------------------------------------------------------------
// 解析飞书记录为作品结构
// 飞书字段约定：标题/分类/分类显示名/年份/简介/封面/主题色/视频/Demo链接
// ------------------------------------------------------------
function normalizeProject(record) {
  const f = record.fields || {}
  const cover = parseAttachment(f['封面'])
  const video = parseAttachment(f['视频'])
  // 推荐字段：兼容复选框(true/false)、单选(是/否)、数字(1/0)
  const featuredRaw = f['推荐'] ?? f['是否推荐'] ?? f['首页推荐'] ?? false
  const featured = featuredRaw === true || featuredRaw === 1 || /是|推荐|true|yes/i.test(String(featuredRaw))
  return {
    id: record.record_id,
    title: f['标题'] || '',
    category: extractOption(f['分类'], 'design'),
    categoryLabel: f['分类显示名'] || extractOption(f['分类'], ''),
    year: String(f['年份'] || ''),
    desc: f['简介'] || '',
    accent: extractOption(f['主题色'], 'purple'),
    coverImage: cover ? cover.url : null,
    video: video ? video.url : null,
    demoUrl: f['Demo链接'] || f['访问链接'] || f['链接'] || null,
    featured
  }
}

// ------------------------------------------------------------
// 解析飞书记录为笔记结构
// 飞书字段约定：标题/标签/摘要/关联节点/发布时间
// 标签字段是数组，每项是 { text: '标签名' }
// ------------------------------------------------------------
function normalizeNote(record) {
  const f = record.fields || {}
  const tagsRaw = f['标签'] || []
  const tags = (Array.isArray(tagsRaw) ? tagsRaw : [tagsRaw]).map((t, i) => {
    const tones = ['purple', 'cyan', 'pink']
    return {
      label: typeof t === 'string' ? t : t.text || t.name || '',
      tone: tones[i % 3]
    }
  }).filter((t) => t.label)

  return {
    id: record.record_id,
    title: f['标题'] || '',
    tags,
    excerpt: f['摘要'] || f['内容摘要'] || '',
    graphNode: f['关联节点'] || '',
    category: extractOption(f['分类'], '未分类'),
    categoryLabel: f['分类显示名'] || extractOption(f['分类'], '') || f['分类名'] || '',
    publishedAt: formatDate(f['发布时间'] || f['创建时间'] || f['日期'])
  }
}

// ------------------------------------------------------------
// 解析飞书记录为时间线节点
// 飞书字段约定：时间段/标题/描述/圆点配色
// ------------------------------------------------------------
function normalizeTimeline(record) {
  const f = record.fields || {}
  return {
    period: f['时间段'] || '',
    title: f['标题'] || '',
    desc: f['描述'] || '',
    dot: extractOption(f['圆点配色'], 'primary')
  }
}

// ------------------------------------------------------------
// 解析站点设置
// 飞书字段约定：姓名/头像首字/头像图片/身份描述/简介/技能标签/社交链接
// ------------------------------------------------------------
function normalizeSettings(record) {
  const f = record.fields || {}
  const avatar = parseAttachment(f['头像图片'])
  const skillsRaw = f['技能标签'] || []
  const skills = (Array.isArray(skillsRaw) ? skillsRaw : [skillsRaw]).map((s) => {
    const label = typeof s === 'string' ? s : s.text || s.name || ''
    return { label, tone: 'default' }
  }).filter((s) => s.label)

  const socialsRaw = f['社交链接'] || []
  const socials = (Array.isArray(socialsRaw) ? socialsRaw : [socialsRaw]).map((s) => {
    if (typeof s === 'string') return { label: '·', title: s, href: s }
    return {
      label: s['图标字符'] || '·',
      title: s['名称'] || '',
      href: s['链接'] || '#'
    }
  })

  return {
    ownerName: f['姓名'] || '',
    avatarChar: f['头像首字'] || '阴',
    avatarImage: avatar ? avatar.url : null,
    identity: f['身份描述'] || '',
    bio: f['简介'] || '',
    skills,
    socials
  }
}

// ------------------------------------------------------------
// 飞书日期字段处理：返回的是时间戳（毫秒）
// ------------------------------------------------------------
function formatDate(fieldValue) {
  if (!fieldValue) return ''
  if (typeof fieldValue === 'number') {
    const d = new Date(fieldValue)
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
  }
  if (typeof fieldValue === 'string') return fieldValue
  if (fieldValue instanceof Array && fieldValue[0]) {
    return formatDate(fieldValue[0])
  }
  return ''
}

// ------------------------------------------------------------
// 暴露的拉取函数：返回归一化后的数据，或 null（触发上层 fallback）
// ------------------------------------------------------------

export async function fetchArticles() {
  const records = await fetchFromFeishu('articles')
  if (!records) return null
  return records.map(normalizeArticle)
}

export async function fetchProjects() {
  const records = await fetchFromFeishu('projects')
  if (!records) return null
  return records.map(normalizeProject)
}

export async function fetchNotes() {
  const records = await fetchFromFeishu('notes')
  if (!records) return null
  return records.map(normalizeNote)
}

export async function fetchTimeline() {
  const records = await fetchFromFeishu('timeline')
  if (!records) return null
  return records.map(normalizeTimeline)
}

export async function fetchSiteSettings() {
  const records = await fetchFromFeishu('settings')
  if (!records || !records.length) return null
  return normalizeSettings(records[0])
}

// ------------------------------------------------------------
// 解析飞书记录为合集结构
// 飞书字段约定：合集名/合集简介/合集封面/是否付费/合集售价/购买链接/包含文章（多向关联）
// 「包含文章」多向关联字段返回 [{ record_id, text }] 数组，提取 record_id 列表
// ------------------------------------------------------------
export function normalizeCollection(record) {
  const f = record.fields || {}
  const cover = parseAttachment(f['合集封面'])

  // 多向关联字段返回 [{ record_ids: [..], table_id, text, text_arr, type }]
  // record_ids 是复数（带 s），嵌套在数组第一个对象里
  const linkedRaw = f['包含文章'] || []
  const linkedArr = Array.isArray(linkedRaw) ? linkedRaw : [linkedRaw]
  const firstLinked = linkedArr[0] || {}
  const articleIds = Array.isArray(firstLinked.record_ids)
    ? firstLinked.record_ids.filter(Boolean)
    : (Array.isArray(firstLinked.record_id)
        ? firstLinked.record_id.filter(Boolean)
        : [])
  const articleCount = articleIds.length || Number(f['文章数量']) || 0

  // 是否付费
  const paidOpt = extractOption(f['是否付费'], '')
  const isPaid = /付费|是|paid|true/i.test(paidOpt)
  const priceRaw = f['合集售价'] ?? f['售价'] ?? f['价格'] ?? ''
  const price = priceRaw === '' || priceRaw === null || priceRaw === undefined
    ? 0
    : Number(priceRaw) || 0
  const buyUrl = extractUrl(f['购买链接'] || f['付费链接'] || f['商品链接'] || '')

  return {
    id: record.record_id,
    title: f['合集名'] || f['名称'] || '未命名合集',
    desc: f['合集简介'] || f['简介'] || '',
    coverImage: cover ? cover.url : null,
    isPaid,
    price,
    buyUrl,
    articleIds,
    articleCount
  }
}

export async function fetchCollections() {
  const records = await fetchFromFeishu('collections')
  if (!records) return null
  return records.map(normalizeCollection)
}

// ------------------------------------------------------------
// 解析飞书记录为 QA 问答对结构
// 飞书字段约定：问题 / 答案 / 关键词（可选，用于辅助匹配）/ 分类（可选）
// ------------------------------------------------------------
function normalizeQa(record) {
  const f = record.fields || {}
  const keywordsRaw = f['关键词'] || []
  // 关键词可能是多选数组，也可能是文本（用 、, ; ；分隔）
  const kwList = Array.isArray(keywordsRaw) ? keywordsRaw : [keywordsRaw]
  const keywords = kwList
    .map((k) => (typeof k === 'string' ? k : k.text || k.name || ''))
    .filter(Boolean)
    .flatMap((k) => k.split(/[、,，;；\n]+/))
    .map((k) => k.trim())
    .filter(Boolean)

  return {
    id: record.record_id,
    question: f['问题'] || '',
    answer: f['答案'] || '',
    keywords,
    category: extractOption(f['分类'], '')
  }
}

export async function fetchQa() {
  const records = await fetchFromFeishu('qa')
  if (!records) return null
  return records.map(normalizeQa)
}

// ------------------------------------------------------------
// 兑换码：后端校验 + 原子标记已用
// 入参：
//   { code, articleId, articleTitle }            → 单篇兑换（type 默认 article）
//   { code, collectionId, collectionName, type:'collection' } → 合集兑换
// 返回：
//   单篇：{ ok:true, type:'article', articleContent, articleTitle, articleId }
//   合集：{ ok:true, type:'collection', collectionId, collectionName, articleIds:[..], unlockedCount }
//   失败：{ ok:false, message }
// ------------------------------------------------------------
export async function redeemCode({ code, articleId, articleTitle, collectionId, collectionName, type }) {
  if (!code) return { ok: false, message: '兑换码不能为空' }
  const trimmed = code.trim().toUpperCase()
  const url = isDev
    ? '/api/redeem'
    : `https://${window.location.hostname}/api/redeem`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        code: trimmed,
        articleId: articleId || '',
        articleTitle: articleTitle || '',
        collectionId: collectionId || '',
        collectionName: collectionName || '',
        type: type || 'article'
      })
    })
    const data = await res.json()
    if (!data.ok) return { ok: false, message: data.message || '兑换失败' }
    // 合集兑换：返回合集内所有文章 id
    if (data.type === 'collection') {
      return {
        ok: true,
        type: 'collection',
        collectionId: data.collectionId || '',
        collectionName: data.collectionName || '',
        articleIds: data.articleIds || [],
        unlockedCount: data.unlockedCount || 0
      }
    }
    // 单篇兑换：返回文章内容
    return {
      ok: true,
      type: 'article',
      articleContent: data.articleContent || '',
      articleTitle: data.articleTitle || '',
      articleId: data.articleId || ''
    }
  } catch (err) {
    console.warn('[EchoVerse] 兑换码校验失败：', err.message)
    return { ok: false, message: '网络异常，请稍后再试' }
  }
}
