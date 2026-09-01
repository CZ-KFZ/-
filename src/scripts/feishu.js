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
function normalizeArticle(record) {
  const f = record.fields || {}
  const cover = parseAttachment(f['封面'])
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
    featured: f['推荐'] || false
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
    demoUrl: f['Demo链接'] || null
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
    excerpt: f['摘要'] || '',
    graphNode: f['关联节点'] || '',
    publishedAt: formatDate(f['发布时间'])
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
