// ============================================================
// 对话 chat.js（增强版）
// 15 项功能：语音、操作栏、思考过程、流式输出、内联卡片、
// 推荐追问、Markdown、知识图谱、风格切换、人设面板、
// 主题皮肤、历史增强、Slash指令、输入增强、通知提醒
// ============================================================

import { CHAT_HISTORY, QUICK_PROMPTS, ECHO_REPLIES } from '../data.js'
import { fetchProjects, fetchArticles, fetchNotes, fetchSiteSettings } from '../feishu.js'

// ------------------------------------------------------------
// 全局数据
// ------------------------------------------------------------
let LIVE_DATA = { loaded: false, projects: [], articles: [], notes: [], settings: null }
let conversation = []
let isEchoTyping = false
let chatStyle = localStorage.getItem('echoverse:chat:style') || 'normal'
let chatTheme = localStorage.getItem('echoverse:chat:theme') || 'dark'
let inputHistory = JSON.parse(localStorage.getItem('echoverse:chat:input-history') || '[]')
let inputHistoryIndex = -1
let pinnedConvs = JSON.parse(localStorage.getItem('echoverse:chat:pinned') || '[]')

async function ensureLiveData() {
  if (LIVE_DATA.loaded) return LIVE_DATA
  const [projects, articles, notes, settings] = await Promise.all([
    fetchProjects().catch(() => null),
    fetchArticles().catch(() => null),
    fetchNotes().catch(() => null),
    fetchSiteSettings().catch(() => null)
  ])
  LIVE_DATA.projects = Array.isArray(projects) ? projects : []
  LIVE_DATA.articles = Array.isArray(articles) ? articles : []
  LIVE_DATA.notes = Array.isArray(notes) ? notes : []
  LIVE_DATA.settings = settings || null
  LIVE_DATA.loaded = true
  return LIVE_DATA
}

// ------------------------------------------------------------
// 名称 & 头像
// ------------------------------------------------------------
function ownerName() { const s = LIVE_DATA.settings; return (s && s.ownerName) || '阴之体道' }
function doppelName() { const on = ownerName(); return on === '阴之体道' ? 'Echo' : on }
function avatarChar() { const s = LIVE_DATA.settings; if (s && s.avatarChar) return s.avatarChar; const on = ownerName(); return on ? on.slice(0, 1) : 'E' }

function avatarHtml(size = 'w-8 h-8') {
  const s = LIVE_DATA.settings
  if (s && s.avatarImage) return `<div class="${size} rounded-full overflow-hidden shrink-0 ring-2 ring-white/30"><img src="${s.avatarImage}" alt="头像" class="w-full h-full object-cover" /></div>`
  return `<div class="${size} rounded-full bg-gradient-to-br from-[var(--evo-purple-400)] to-[var(--evo-pink)] flex items-center justify-center text-white text-xs font-bold shrink-0">${avatarChar()}</div>`
}

function updateHeaderAvatar() {
  const el = document.getElementById('evo-chat-header-avatar')
  if (!el) return
  el.outerHTML = avatarHtml('w-10 h-10').replace('class="', 'id="evo-chat-header-avatar" class="')
}

// ------------------------------------------------------------
// 问候 & 初始对话
// ------------------------------------------------------------
function greetingHtml() {
  const on = ownerName(), dn = doppelName()
  const bio = (LIVE_DATA.settings && (LIVE_DATA.settings.bio || LIVE_DATA.settings.identity)) || ''
  const sentence = bio ? `（${bio}）` : '作品、经历、思考等任何问题。'
  return `<p>你好！我是 <strong>${dn}</strong>，是 <strong>${on}</strong> 的数字分身。我基于她沉淀的所有数字化资产训练而成，可以回答关于她的${sentence} 你想了解什么呢？</p>`
}
function initialConversation() {
  return [
    { role: 'echo', html: greetingHtml(), sources: [] },
    { role: 'user', text: '能介绍一下她最有代表性的项目吗？' },
    generateProjectsReply('能介绍一下她最有代表性的项目吗？')
  ]
}

// ============================================================
// 功能 7：Markdown 渲染
// ============================================================
function renderMarkdown(text) {
  if (!text) return ''
  let html = text
  // 代码块
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre class="bg-black/40 rounded-lg p-3 my-2 overflow-x-auto text-xs"><code class="text-[var(--evo-cyan)]">${escapeHtml(code)}</code></pre>`
  })
  // 行内代码
  html = html.replace(/`([^`]+)`/g, '<code class="bg-black/30 px-1.5 py-0.5 rounded text-[var(--evo-pink)] text-xs">$1</code>')
  // 标题
  html = html.replace(/^### (.+)$/gm, '<h3 class="text-base font-bold mt-3 mb-1 text-[var(--evo-ink)]">$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold mt-4 mb-2 text-[var(--evo-ink)]">$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold mt-4 mb-2 text-[var(--evo-ink)]">$1</h1>')
  // 引用
  html = html.replace(/^> (.+)$/gm, '<blockquote class="border-l-2 border-[var(--evo-purple-400)] pl-3 my-2 text-[var(--evo-ink-2)] italic">$1</blockquote>')
  // 加粗
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="text-[var(--evo-ink)]">$1</strong>')
  // 斜体
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
  // 链接
  html = html.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" class="text-[var(--evo-cyan)] underline">$1</a>')
  // 无序列表
  html = html.replace(/^[-*] (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
  html = html.replace(/(<li class="ml-4 list-disc">[\s\S]*?<\/li>)(\n(?!<li))/g, '<ul class="my-2 space-y-1 text-sm">$1</ul>$2')
  // 有序列表
  html = html.replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal">$1</li>')
  html = html.replace(/(<li class="ml-4 list-decimal">[\s\S]*?<\/li>)(\n(?!<li))/g, '<ol class="my-2 space-y-1 text-sm">$1</ol>$2')
  // 段落
  html = html.replace(/\n\n/g, '</p><p class="mt-2">')
  html = `<p>${html}</p>`
  html = html.replace(/<p>\s*<\/p>/g, '')
  return html
}
function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML }

// ============================================================
// 功能 5：内联卡片（作品/文章）
// ============================================================
function projectCard(p) {
  const cover = p.cover || p.image || ''
  const coverHtml = cover ? `<div class="w-16 h-16 rounded-lg overflow-hidden shrink-0 bg-[var(--evo-surface-2)]"><img src="${cover}" alt="" class="w-full h-full object-cover" onerror="this.style.display='none'"/></div>` : ''
  const link = p.link ? `<a href="${p.link}" target="_blank" class="text-xs text-[var(--evo-cyan)] hover:underline">查看详情 →</a>` : ''
  return `<div class="flex gap-3 p-3 rounded-lg bg-[var(--evo-surface-2)]/50 border border-[var(--evo-border)] my-2">
    ${coverHtml}
    <div class="min-w-0 flex-1">
      <div class="font-medium text-[var(--evo-ink)] text-sm truncate">${p.title}</div>
      ${p.desc ? `<div class="text-xs text-[var(--evo-ink-2)] mt-1 line-clamp-2">${p.desc}</div>` : ''}
      <div class="mt-1 flex items-center gap-2">
        ${p.categoryLabel || p.category ? `<span class="text-xs text-[var(--evo-purple-300)]">${p.categoryLabel || p.category}</span>` : ''}
        ${link}
      </div>
    </div>
  </div>`
}

function articleCard(a) {
  const cover = a.cover || a.image || ''
  const coverHtml = cover ? `<div class="w-16 h-16 rounded-lg overflow-hidden shrink-0 bg-[var(--evo-surface-2)]"><img src="${cover}" alt="" class="w-full h-full object-cover" onerror="this.style.display='none'"/></div>` : ''
  const link = a.link ? `<a href="${a.link}" target="_blank" class="text-xs text-[var(--evo-cyan)] hover:underline">阅读全文 →</a>` : ''
  return `<div class="flex gap-3 p-3 rounded-lg bg-[var(--evo-surface-2)]/50 border border-[var(--evo-border)] my-2">
    ${coverHtml}
    <div class="min-w-0 flex-1">
      <div class="font-medium text-[var(--evo-ink)] text-sm truncate">${a.title}</div>
      ${a.excerpt ? `<div class="text-xs text-[var(--evo-ink-2)] mt-1 line-clamp-2">${a.excerpt}</div>` : ''}
      <div class="mt-1 flex items-center gap-2">
        ${a.date ? `<span class="text-xs text-[var(--evo-ink-3)]">${a.date}</span>` : ''}
        ${link}
      </div>
    </div>
  </div>`
}

// ============================================================
// 搜索辅助
// ============================================================
function norm(s) { return (s || '').toString().toLowerCase() }
function includesAny(text, keywords) { const t = norm(text); return keywords.some((k) => t.includes(norm(k))) }
function searchItems(items, text, extraFields = []) {
  const q = norm(text)
  const hit = (it) => {
    const hay = [it.title, it.desc, it.excerpt, it.content, it.category, it.categoryLabel, (it.tags || []).join(' '), ...extraFields.map((f) => it[f])].join(' ')
    return norm(hay).includes(q)
  }
  return items.filter(hit)
}

// 风格前缀
function stylePrefix() {
  if (chatStyle === 'casual') return '用轻松日常的口吻回答，像朋友聊天一样。'
  if (chatStyle === 'poetic') return '用诗意、文学化的语言回答，带点意境。'
  return ''
}

// 生成回复时，把风格要求融入（通过在内容前加风格引导标记，回复生成器会读取）
function applyStyle(html) {
  if (!html) return html
  // 风格主要影响语气，这里通过包装实现：日常风格加口语化尾缀
  if (chatStyle === 'casual') {
    return html.replace(/<\/p>\s*$/, ' ～</p>')
  }
  return html
}

// ============================================================
// 回复生成器
// ============================================================
function generateProjectsReply(text) {
  const all = LIVE_DATA.projects
  const matched = text && !/代表|推荐|最新|项目|作品/.test(text) ? searchItems(all, text).slice(0, 5) : all.slice(0, 5)
  const list = (matched && matched.length ? matched : all.slice(0, 5))
  const on = ownerName()
  if (!list.length) return { html: applyStyle(`<p>目前作品集里还没有内容，${on} 还在持续产出中，敬请期待。</p>`), sources: [], followUps: [] }
  const cards = list.map((p) => projectCard(p)).join('')
  return {
    html: applyStyle(`<p>${on} 目前有 <strong>${all.length}</strong> 个作品，这里是${matched.length ? '相关的' : '部分代表性'}项目：</p>${cards}`),
    sources: [{ label: `作品集 - ${list.length} 个项目`, tone: 'purple' }],
    followUps: list.slice(0, 2).map((p) => `${p.title} 用了什么技术？`)
  }
}

function generateArticlesReply(text) {
  const all = LIVE_DATA.articles
  const matched = text && !/推荐|最新|文章|写/.test(text) ? searchItems(all, text).slice(0, 5) : all.slice(0, 5)
  const list = (matched && matched.length ? matched : all.slice(0, 5))
  const on = ownerName()
  if (!list.length) return { html: applyStyle(`<p>目前文章库里还没有内容，${on} 还在持续写作中。</p>`), sources: [], followUps: [] }
  const cards = list.map((a) => articleCard(a)).join('')
  return {
    html: applyStyle(`<p>${on} 目前写了 <strong>${all.length}</strong> 篇文章，${matched.length ? '根据你的问题，推荐这些：' : '近期值得一读：'}</p>${cards}`),
    sources: [{ label: `文章 - ${list.length} 篇`, tone: 'cyan' }],
    followUps: list.slice(0, 2).map((a) => `${a.title} 主要讲了什么？`)
  }
}

function generateNotesReply(text) {
  const all = LIVE_DATA.notes
  const matched = text && !/笔记|花园|想法|思考/.test(text) ? searchItems(all, text).slice(0, 6) : all.slice(0, 6)
  const list = (matched && matched.length ? matched : all.slice(0, 6))
  const on = ownerName()
  if (!list.length) return { html: applyStyle(`<p>数字花园目前还没有种下种子，${on} 会陆续把碎片化思考、阅读笔记上传进来。</p>`), sources: [], followUps: [] }
  const items = list.map((n) => {
    const cat = n.category || n.categoryLabel ? `<span class="text-[var(--evo-pink)]">【${n.category || n.categoryLabel}】</span>` : ''
    const content = n.excerpt || n.content || n.title || ''
    return `<li><strong>${n.title || '一则笔记'}</strong>${cat} — ${content}</li>`
  }).join('')
  return {
    html: applyStyle(`<p>她的数字花园里有 <strong>${all.length}</strong> 条笔记节点，${matched.length ? '和你问题相关的有这些：' : '最新几条：'}</p><ul class="list-disc list-inside space-y-2 text-sm">${items}</ul>`),
    sources: [{ label: `数字花园 - ${list.length} 条笔记`, tone: 'pink' }],
    followUps: ['她最近在思考什么？', '有关于创作的笔记吗？']
  }
}

function generateAboutReply(text) {
  const s = LIVE_DATA.settings, on = ownerName()
  const identity = s && s.identity ? s.identity : `${on} 的数字分身 Echo — 沉淀作品、文章、思考的数字化空间站。`
  const bio = s && s.bio ? s.bio : ''
  const skills = s && Array.isArray(s.skills) && s.skills.length ? s.skills : []
  const skillsHtml = skills.length ? `<p class="mt-3 mb-2"><strong>擅长方向：</strong></p><div class="flex flex-wrap gap-2">${skills.map((sk) => `<span class="px-2 py-1 rounded bg-[var(--evo-purple-500)]/20 text-[var(--evo-purple-300)] text-xs">${sk}</span>`).join('')}</div>` : ''
  const socials = s && Array.isArray(s.socials) && s.socials.length ? s.socials : []
  const socialsHtml = socials.length ? `<p class="mt-3 text-sm"><strong>联系方式：</strong> ${socials.map((x) => typeof x === 'string' ? x : (x.label || '') + (x.url ? `（${x.url}）` : '')).join(' · ')}</p>` : ''
  return {
    html: applyStyle(`<p><strong>${on}</strong> — ${identity}</p>${bio ? `<p class="mt-2 text-[var(--evo-ink-2)]">${bio}</p>` : ''}${skillsHtml}${socialsHtml}`),
    sources: [{ label: '站点设置 - 关于我', tone: 'purple' }],
    followUps: ['她最擅长什么？', '她最近在做什么？']
  }
}

function generateTimelineReply() {
  const on = ownerName()
  const nProjects = LIVE_DATA.projects.length, nArticles = LIVE_DATA.articles.length, nNotes = LIVE_DATA.notes.length
  const lastProj = LIVE_DATA.projects[0], lastArt = LIVE_DATA.articles[0]
  const lines = []
  if (lastProj) lines.push(`最近完成作品：<strong>${lastProj.title}</strong>${lastProj.year ? `（${lastProj.year}）` : ''}`)
  if (lastArt) lines.push(`最近发表文章：<strong>${lastArt.title}</strong>${lastArt.date ? ` · ${lastArt.date}` : ''}`)
  lines.push(`整体产出：<strong>${nProjects}</strong> 个作品 · <strong>${nArticles}</strong> 篇文章 · <strong>${nNotes}</strong> 条笔记`)
  return {
    html: applyStyle(`<p>${on} 最近一直在产出内容，当前状态：</p><ul class="list-disc list-inside space-y-1 text-sm">${lines.map((l) => `<li>${l}</li>`).join('')}</ul>`),
    sources: [{ label: `作品集 · ${nProjects}`, tone: 'purple' }, { label: `文章 · ${nArticles}`, tone: 'cyan' }, nNotes ? { label: `笔记 · ${nNotes}`, tone: 'pink' } : null].filter(Boolean),
    followUps: ['她最满意哪个作品？', '最近有新文章吗？']
  }
}

function matchReply(text) {
  const t = text || '', lower = t.toLowerCase()
  if (includesAny(t, ['你是谁', '我是谁', '介绍一下', '自我介绍', '她是谁', '关于她', '简介', '身份'])) return generateAboutReply(t)
  if (includesAny(t, ['最近在做', '最近做什么', '近况', '最近忙', '现在在做', '经历', '时间线', '职业'])) return generateTimelineReply()
  if (includesAny(t, ['作品', '项目', 'portfolio', '作品集', '设计', '代表作', '代表性']) || searchItems(LIVE_DATA.projects, t).length > 0) return generateProjectsReply(t)
  if (includesAny(t, ['文章', '写', '博客', 'articles', '推荐文章', '最近文章']) || searchItems(LIVE_DATA.articles, t).length > 0) return generateArticlesReply(t)
  if (includesAny(t, ['笔记', '花园', '数字花园', '想法', '碎片化', '思考', 'garden', 'notes']) || searchItems(LIVE_DATA.notes, t).length > 0) return generateNotesReply(t)
  if (includesAny(t, ['技术栈', '技术', '会什么', '擅长', '技能', '能力', '会用', '什么技术'])) {
    const s = LIVE_DATA.settings
    const arr = s && Array.isArray(s.skills) && s.skills.length ? s.skills : []
    if (arr.length) return { html: applyStyle(`<p>她主要的技术栈 / 技能包括：</p><div class="flex flex-wrap gap-2">${arr.map((sk) => `<span class="px-2 py-1 rounded bg-[var(--evo-cyan)]/20 text-[var(--evo-cyan)] text-xs">${sk}</span>`).join('')}</div>`), sources: [{ label: '站点设置 - 技能项', tone: 'cyan' }], followUps: ['她用这些技术做过什么？'] }
  }
  const p = searchItems(LIVE_DATA.projects, t).slice(0, 3), a = searchItems(LIVE_DATA.articles, t).slice(0, 3), n = searchItems(LIVE_DATA.notes, t).slice(0, 3)
  if (p.length || a.length || n.length) {
    const parts = [], sources = []
    if (p.length) { parts.push(`<p><strong>作品中相关内容：</strong></p><div class="space-y-1">${p.map((x) => projectCard(x)).join('')}</div>`); sources.push({ label: `作品 - ${p.length}`, tone: 'purple' }) }
    if (a.length) { parts.push(`<p><strong>文章中相关内容：</strong></p><div class="space-y-1">${a.map((x) => articleCard(x)).join('')}</div>`); sources.push({ label: `文章 - ${a.length}`, tone: 'cyan' }) }
    if (n.length) { parts.push(`<p><strong>笔记中相关内容：</strong></p><ul class="list-disc list-inside space-y-1 text-sm">${n.map((x) => `<li>${x.title || '一则笔记'}${x.excerpt || x.content ? ` — ${x.excerpt || x.content}` : ''}</li>`).join('')}</ul>`); sources.push({ label: `笔记 - ${n.length}`, tone: 'pink' }) }
    return { html: applyStyle(`<p>我在她的知识库里搜索了「${t}」，找到这些相关内容：</p>${parts.join('')}`), sources, followUps: [] }
  }
  for (const item of ECHO_REPLIES) {
    if (item.matches.some((kw) => lower.includes(kw.toLowerCase()))) return { html: applyStyle(item.reply), sources: item.sources || [], followUps: [] }
  }
  const on = ownerName()
  return { html: applyStyle(`<p>这个问题我暂时在 ${on} 的知识库里没有找到相关内容，你可以换一种说法试试，或者问我关于她的作品、文章、思考和经历～</p>`), sources: [], followUps: [] }
}

// ============================================================
// 功能 2：消息操作栏（复制 / 重新生成 / 👍 / 👎 / 朗读）
// ============================================================
function messageActionBar(msg, index) {
  if (msg.role !== 'echo') return ''
  return `<div class="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
    <button data-action="copy" data-idx="${index}" class="px-2 py-1 rounded text-xs text-[var(--evo-ink-3)] hover:bg-[var(--evo-surface-2)] hover:text-[var(--evo-ink)] transition-colors" title="复制">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
    </button>
    <button data-action="regenerate" data-idx="${index}" class="px-2 py-1 rounded text-xs text-[var(--evo-ink-3)] hover:bg-[var(--evo-surface-2)] hover:text-[var(--evo-ink)] transition-colors" title="重新生成">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
    </button>
    <button data-action="speak" data-idx="${index}" class="px-2 py-1 rounded text-xs text-[var(--evo-ink-3)] hover:bg-[var(--evo-surface-2)] hover:text-[var(--evo-ink)] transition-colors" title="朗读">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
    </button>
    <button data-action="like" data-idx="${index}" class="px-2 py-1 rounded text-xs text-[var(--evo-ink-3)] hover:bg-[var(--evo-surface-2)] hover:text-[var(--evo-state-success)] transition-colors" title="赞">👍</button>
    <button data-action="dislike" data-idx="${index}" class="px-2 py-1 rounded text-xs text-[var(--evo-ink-3)] hover:bg-[var(--evo-surface-2)] hover:text-[var(--evo-state-error)] transition-colors" title="踩">👎</button>
  </div>`
}

function handleMessageAction(action, idx) {
  const msg = conversation[idx]
  if (!msg) return
  if (action === 'copy') {
    const text = msg.html.replace(/<[^>]+>/g, '')
    navigator.clipboard.writeText(text).then(() => toast('已复制到剪贴板'))
  } else if (action === 'regenerate') {
    // 找到这条 echo 消息前面的 user 消息
    const userMsg = conversation.slice(0, idx).reverse().find((m) => m.role === 'user')
    if (userMsg) {
      conversation = conversation.slice(0, idx)
      renderMessages()
      processReply(userMsg.text)
    }
  } else if (action === 'speak') {
    speakText(msg.html.replace(/<[^>]+>/g, ''))
  } else if (action === 'like' || action === 'dislike') {
    toast(action === 'like' ? '感谢反馈 👍' : '已记录，会持续改进 👎')
  }
}

// ============================================================
// 功能 6：推荐追问
// ============================================================
function followUpButtons(followUps) {
  if (!followUps || !followUps.length) return ''
  const items = followUps.slice(0, 3)
  return `<div class="flex flex-wrap gap-2 mt-3">
    ${items.map((q) => `<button data-followup="${escapeHtml(q)}" class="px-3 py-1 rounded-full text-xs border border-[var(--evo-border)] text-[var(--evo-ink-2)] hover:border-[var(--evo-purple-400)] hover:text-[var(--evo-purple-300)] transition-colors">${q}</button>`).join('')}
  </div>`
}

// ============================================================
// 渲染消息
// ============================================================
function messageEl(msg, index) {
  const wrap = document.createElement('div')
  if (msg.role === 'user') {
    wrap.className = 'flex gap-3 sm:gap-4 flex-row-reverse evo-animate-fade-in'
    wrap.innerHTML = `<div class="w-8 h-8 rounded-full bg-[var(--evo-surface-2)] flex items-center justify-center text-[var(--evo-ink-2)] text-xs font-bold shrink-0">你</div><div class="max-w-[80%]"><div class="bg-[var(--evo-primary)] rounded-2xl rounded-tr-sm px-4 sm:px-5 py-3"><p class="text-white break-words"></p></div></div>`
    wrap.querySelector('p').textContent = msg.text
  } else {
    wrap.className = 'flex gap-3 sm:gap-4 evo-animate-fade-in group'
    const sourcesHtml = msg.sources && msg.sources.length ? `<div class="flex flex-wrap gap-2 items-center mt-2"><span class="text-xs text-[var(--evo-ink-3)]">来源：</span>${msg.sources.map((s) => sourceChip(s)).join('')}</div>` : ''
    wrap.innerHTML = `${avatarHtml()}<div class="max-w-[80%] min-w-0"><div class="evo-glass rounded-2xl rounded-tl-sm px-4 sm:px-5 py-3 text-[var(--evo-ink)] text-sm leading-relaxed break-words evo-msg-content" data-streaming="${msg.streaming ? '1' : '0'}"></div>${sourcesHtml}${messageActionBar(msg, index)}${followUpButtons(msg.followUps)}</div>`
    const content = wrap.querySelector('.evo-msg-content')
    if (msg.streaming) {
      content.innerHTML = msg.html || ''
    } else {
      content.innerHTML = msg.html || ''
    }
  }
  return wrap
}

function sourceChip(s) {
  const colorMap = { purple: 'bg-[var(--evo-purple-500)]/20 text-[var(--evo-purple-300)]', cyan: 'bg-[var(--evo-cyan)]/20 text-[var(--evo-cyan)]', pink: 'bg-[var(--evo-pink)]/20 text-[var(--evo-pink)]' }
  const cls = colorMap[s.tone] || colorMap.purple
  return `<span class="px-2 py-1 rounded-[var(--evo-radius-sm)] ${cls} text-xs cursor-pointer hover:opacity-80 transition-opacity">${s.label}</span>`
}

let renderTimer = null
function renderMessages() {
  const box = document.getElementById('evo-chat-messages')
  if (!box) return
  box.innerHTML = ''
  conversation.forEach((msg, i) => box.appendChild(messageEl(msg, i)))
  // 绑定操作栏
  box.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => handleMessageAction(btn.dataset.action, Number(btn.dataset.idx)))
  })
  // 绑定推荐追问
  box.querySelectorAll('[data-followup]').forEach((btn) => {
    btn.addEventListener('click', () => sendUserMessage(btn.dataset.followup))
  })
  scrollToBottom()
}

function scrollToBottom() {
  const box = document.getElementById('evo-chat-messages')
  if (box) box.scrollTop = box.scrollHeight
}

// ============================================================
// 功能 3：思考过程 + 功能 4：流式输出
// ============================================================
function showThinking() {
  isEchoTyping = true
  const box = document.getElementById('evo-chat-messages')
  const wrap = document.createElement('div')
  wrap.id = 'evo-thinking'
  wrap.className = 'flex gap-3 sm:gap-4 evo-animate-fade-in'
  const steps = ['检索知识库', '匹配相关内容', '组织语言']
  wrap.innerHTML = `${avatarHtml()}<div class="max-w-[80%] min-w-0"><div class="evo-glass rounded-2xl rounded-tl-sm px-4 sm:px-5 py-3 text-sm"><div class="text-[var(--evo-ink-3)] mb-2">思考中…</div>${steps.map((s, i) => `<div class="flex items-center gap-2 text-xs mb-1" data-step="${i}"><span class="evo-thinking-dot w-1.5 h-1.5 rounded-full bg-[var(--evo-purple-400)]"></span><span class="text-[var(--evo-ink-2)]">${s}</span></div>`).join('')}</div></div>`
  box.appendChild(wrap)
  scrollToBottom()
  // 逐步点亮步骤
  let step = 0
  const interval = setInterval(() => {
    const dots = wrap.querySelectorAll('[data-step]')
    if (dots[step]) {
      dots[step].querySelector('.evo-thinking-dot').classList.add('bg-[var(--evo-state-success)]')
      dots[step].querySelector('.evo-thinking-dot').classList.remove('bg-[var(--evo-purple-400)]')
    }
    step++
    if (step >= steps.length) clearInterval(interval)
  }, 300)
}

function removeThinking() {
  const el = document.getElementById('evo-thinking')
  if (el) el.remove()
}

// 流式输出回复
function streamReply(msg) {
  return new Promise((resolve) => {
    const box = document.getElementById('evo-chat-messages')
    // 创建一个空的消息容器
    const echoMsg = { role: 'echo', html: '', sources: msg.sources, followUps: msg.followUps, streaming: true }
    conversation.push(echoMsg)
    renderMessages()
    const contentEl = box.querySelector('.evo-msg-content:last-child')
    if (!contentEl) { resolve(); return }

    const fullHtml = msg.html
    // 提取纯文本用于逐字显示，保留 HTML 标签结构
    // 简化版：按字符逐个显示完整 HTML
    let i = 0
    const speed = 8 // 每字毫秒
    const timer = setInterval(() => {
      i += 2
      contentEl.innerHTML = fullHtml.slice(0, i)
      scrollToBottom()
      if (i >= fullHtml.length) {
        clearInterval(timer)
        echoMsg.html = fullHtml
        echoMsg.streaming = false
        // 流式结束后重新渲染（补上操作栏、来源、追问）
        const idx = conversation.indexOf(echoMsg)
        conversation[idx] = { role: 'echo', html: fullHtml, sources: msg.sources, followUps: msg.followUps }
        renderMessages()
        resolve()
      }
    }, speed)
  })
}

// ============================================================
// 发送消息主流程
// ============================================================
function processReply(text) {
  showThinking()
  notifyTyping(true)
  const delay = 600 + Math.random() * 400
  setTimeout(async () => {
    removeThinking()
    isEchoTyping = false
    await ensureLiveData()
    const reply = matchReply(text.trim())
    await streamReply(reply)
    notifyTyping(false)
    notifyReply()
  }, delay)
}

function sendUserMessage(text) {
  if (!text || !text.trim() || isEchoTyping) return
  const trimmed = text.trim()
  conversation.push({ role: 'user', text: trimmed })
  // 保存输入历史
  inputHistory.unshift(trimmed)
  if (inputHistory.length > 50) inputHistory.pop()
  localStorage.setItem('echoverse:chat:input-history', JSON.stringify(inputHistory))
  inputHistoryIndex = -1
  renderMessages()
  const input = document.getElementById('evo-chat-input')
  input.value = ''
  autoResize(input)
  updateCharCount()
  input.focus()
  processReply(trimmed)
}

// ============================================================
// 功能 1：语音输入 / 输出
// ============================================================
let recognition = null
function initVoice() {
  const micBtn = document.getElementById('evo-mic-btn')
  if (!micBtn) return
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SR) {
    micBtn.title = '当前浏览器不支持语音输入'
    micBtn.style.opacity = '0.4'
    return
  }
  recognition = new SR()
  recognition.lang = 'zh-CN'
  recognition.continuous = false
  recognition.interimResults = true
  let finalTranscript = ''
  recognition.onresult = (e) => {
    let interim = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) finalTranscript += e.results[i][0].transcript
      else interim += e.results[i][0].transcript
    }
    const input = document.getElementById('evo-chat-input')
    input.value = finalTranscript + interim
    autoResize(input)
    updateCharCount()
  }
  recognition.onend = () => {
    micBtn.classList.remove('text-[var(--evo-state-error)]', 'animate-pulse')
    micBtn.classList.add('text-[var(--evo-ink-3)]')
    if (finalTranscript) {
      const input = document.getElementById('evo-chat-input')
      input.value = finalTranscript
      autoResize(input)
      updateCharCount()
      sendUserMessage(finalTranscript)
      finalTranscript = ''
    }
  }
  recognition.onerror = () => {
    micBtn.classList.remove('text-[var(--evo-state-error)]', 'animate-pulse')
    micBtn.classList.add('text-[var(--evo-ink-3)]')
  }
  micBtn.addEventListener('click', () => {
    if (recognition && recognition._running) {
      recognition.stop()
      recognition._running = false
      return
    }
    try {
      finalTranscript = ''
      recognition.start()
      recognition._running = true
      micBtn.classList.remove('text-[var(--evo-ink-3)]')
      micBtn.classList.add('text-[var(--evo-state-error)]', 'animate-pulse')
    } catch {}
  })
}

function speakText(text) {
  if (!('speechSynthesis' in window)) { toast('当前浏览器不支持朗读'); return }
  window.speechSynthesis.cancel()
  const utter = new SpeechSynthesisUtterance(text)
  utter.lang = 'zh-CN'
  utter.rate = 1.0
  window.speechSynthesis.speak(utter)
}

// ============================================================
// 功能 13：Slash 指令
// ============================================================
const SLASH_COMMANDS = [
  { cmd: '/作品', desc: '列出所有作品', action: () => sendUserMessage('介绍一下她的作品') },
  { cmd: '/文章', desc: '列出最近文章', action: () => sendUserMessage('推荐几篇文章') },
  { cmd: '/关于我', desc: '关于她的介绍', action: () => sendUserMessage('介绍一下她') },
  { cmd: '/最近', desc: '最近在做什么', action: () => sendUserMessage('她最近在做什么') },
  { cmd: '/技能', desc: '技术栈和技能', action: () => sendUserMessage('她的技术栈是什么') },
  { cmd: '/随机', desc: '随机推荐内容', action: () => { const all = [...LIVE_DATA.projects, ...LIVE_DATA.articles]; if (all.length) sendUserMessage(all[Math.floor(Math.random() * all.length)].title) } },
  { cmd: '/清空', desc: '清空当前对话', action: () => newChat() }
]

function handleSlashMenu(input) {
  const menu = document.getElementById('evo-slash-menu')
  if (!menu) return
  const val = input.value
  if (val.startsWith('/') && val.length <= 10) {
    const q = val.slice(1).toLowerCase()
    const matches = SLASH_COMMANDS.filter((c) => c.cmd.toLowerCase().includes(q) || c.desc.includes(q))
    if (matches.length) {
      menu.innerHTML = matches.map((c) => `<button data-slash="${c.cmd}" class="w-full text-left px-3 py-2 hover:bg-[var(--evo-surface-2)] transition-colors flex justify-between items-center"><span class="text-sm text-[var(--evo-ink)]">${c.cmd}</span><span class="text-xs text-[var(--evo-ink-3)]">${c.desc}</span></button>`).join('')
      menu.classList.remove('hidden')
      menu.querySelectorAll('[data-slash]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const cmd = SLASH_COMMANDS.find((c) => c.cmd === btn.dataset.slash)
          input.value = ''
          autoResize(input)
          updateCharCount()
          menu.classList.add('hidden')
          if (cmd) cmd.action()
        })
      })
      return
    }
  }
  menu.classList.add('hidden')
}

// ============================================================
// 功能 14：输入框增强（多行、字数、历史）
// ============================================================
function autoResize(textarea) {
  textarea.style.height = 'auto'
  textarea.style.height = Math.min(textarea.scrollHeight, 128) + 'px'
}
function updateCharCount() {
  const input = document.getElementById('evo-chat-input')
  const count = document.getElementById('evo-char-count')
  if (input && count) count.textContent = input.value.length
}
function handleInputHistory(input, direction) {
  if (!inputHistory.length) return
  if (direction === 'up') {
    inputHistoryIndex = Math.min(inputHistoryIndex + 1, inputHistory.length - 1)
  } else {
    inputHistoryIndex = Math.max(inputHistoryIndex - 1, -1)
  }
  if (inputHistoryIndex >= 0) {
    input.value = inputHistory[inputHistoryIndex]
  } else {
    input.value = ''
  }
  autoResize(input)
  updateCharCount()
}

// ============================================================
// 功能 15：通知提醒
// ============================================================
let originalTitle = document.title
function notifyTyping(typing) {
  if (typing) document.title = 'Echo 正在输入… · EchoVerse'
  else document.title = originalTitle
}
function notifyReply() {
  if (document.hidden && 'Notification' in window) {
    if (Notification.permission === 'granted') {
      new Notification('Echo 已回复', { body: '你的数字分身有新消息了～', icon: '/favicon.svg' })
    }
  }
}

// ============================================================
// Toast 提示
// ============================================================
function toast(msg) {
  let t = document.getElementById('evo-toast')
  if (!t) {
    t = document.createElement('div')
    t.id = 'evo-toast'
    t.className = 'fixed top-20 left-1/2 -translate-x-1/2 z-[100] px-4 py-2 rounded-lg evo-glass-strong text-sm text-[var(--evo-ink)] border border-[var(--evo-border)] evo-animate-fade-in'
    document.body.appendChild(t)
  }
  t.textContent = msg
  t.style.display = 'block'
  clearTimeout(t._timer)
  t._timer = setTimeout(() => { t.style.display = 'none' }, 2000)
}

// ============================================================
// 左侧栏（历史 + 知识库 + 搜索 + 导出）
// ============================================================
function renderAside(search = '') {
  const aside = document.getElementById('evo-chat-aside')
  if (!aside) return
  const nArticles = LIVE_DATA.articles.length, nProjects = LIVE_DATA.projects.length, nNotes = LIVE_DATA.notes.length
  const on = ownerName(), dn = doppelName()

  const filteredHistory = CHAT_HISTORY.filter((h) => !search || h.title.includes(search))

  const historyHtml = filteredHistory.map((h) => {
    const pinned = pinnedConvs.includes(h.id)
    return `<div class="group flex items-center gap-1">
      <button data-history-id="${h.id}" class="flex-1 text-left p-3 rounded-[var(--evo-radius-md)] text-sm transition-colors ${h.active ? 'bg-[var(--evo-surface-2)] text-[var(--evo-ink)]' : 'text-[var(--evo-ink-2)] hover:bg-[var(--evo-surface-2)] hover:text-[var(--evo-ink)]'}">
        ${pinned ? '📌 ' : ''}${h.title}
      </button>
      <button data-rename="${h.id}" class="opacity-0 group-hover:opacity-100 p-1 text-xs text-[var(--evo-ink-3)] hover:text-[var(--evo-ink)]" title="重命名">✎</button>
      <button data-pin="${h.id}" class="opacity-0 group-hover:opacity-100 p-1 text-xs text-[var(--evo-ink-3)] hover:text-[var(--evo-ink)]" title="${pinned ? '取消置顶' : '置顶'}">${pinned ? '📌' : '📍'}</button>
    </div>`
  }).join('')

  aside.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <h2 class="evo-title text-lg">对话 · ${dn}</h2>
      <button id="evo-new-chat" class="text-xs px-3 py-1.5 rounded-[var(--evo-radius-md)] border border-[var(--evo-border)] hover:bg-[var(--evo-surface-2)] transition-colors">+ 新建</button>
    </div>
    <input id="evo-history-search" type="text" placeholder="搜索对话..." value="${search}" class="w-full mb-2 px-3 py-1.5 rounded-[var(--evo-radius-md)] bg-[var(--evo-surface-2)] border border-[var(--evo-border)] text-xs text-[var(--evo-ink)] placeholder:text-[var(--evo-ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--evo-purple-400)]" />
    <div class="space-y-1 max-h-64 overflow-y-auto">${historyHtml || '<p class="text-xs text-[var(--evo-ink-3)] px-3 py-2">暂无对话</p>'}</div>
    <div class="mt-4 flex gap-2">
      <button id="evo-export-chat" class="flex-1 text-xs px-3 py-1.5 rounded-[var(--evo-radius-md)] border border-[var(--evo-border)] hover:bg-[var(--evo-surface-2)] transition-colors">导出对话</button>
    </div>
    <div class="mt-6 pt-6 border-t border-[var(--evo-border)]">
      <div class="text-xs text-[var(--evo-ink-3)] mb-2">知识库 · ${on}</div>
      <div class="flex flex-wrap gap-2">
        <span class="px-2 py-1 rounded-[var(--evo-radius-sm)] bg-[var(--evo-purple-500)]/20 text-[var(--evo-purple-300)] text-xs">${nArticles} 篇文章</span>
        <span class="px-2 py-1 rounded-[var(--evo-radius-sm)] bg-[var(--evo-cyan)]/20 text-[var(--evo-cyan)] text-xs">${nProjects} 个项目</span>
        ${nNotes ? `<span class="px-2 py-1 rounded-[var(--evo-radius-sm)] bg-[var(--evo-pink)]/20 text-[var(--evo-pink)] text-xs">${nNotes} 条笔记</span>` : ''}
      </div>
    </div>
  `

  aside.querySelector('#evo-new-chat').addEventListener('click', newChat)
  aside.querySelector('#evo-export-chat').addEventListener('click', exportChat)
  const searchInput = aside.querySelector('#evo-history-search')
  if (searchInput) searchInput.addEventListener('input', (e) => renderAside(e.target.value))
  aside.querySelectorAll('[data-history-id]').forEach((btn) => btn.addEventListener('click', () => selectHistory(btn.dataset.historyId)))
  aside.querySelectorAll('[data-rename]').forEach((btn) => btn.addEventListener('click', (e) => { e.stopPropagation(); renameHistory(btn.dataset.rename) }))
  aside.querySelectorAll('[data-pin]').forEach((btn) => btn.addEventListener('click', (e) => { e.stopPropagation(); togglePin(btn.dataset.pin) }))
}

function renameHistory(id) {
  const h = CHAT_HISTORY.find((x) => x.id === id)
  if (!h) return
  const name = prompt('重命名对话：', h.title)
  if (name && name.trim()) { h.title = name.trim(); renderAside() }
}
function togglePin(id) {
  const idx = pinnedConvs.indexOf(id)
  if (idx >= 0) pinnedConvs.splice(idx, 1)
  else pinnedConvs.push(id)
  localStorage.setItem('echoverse:chat:pinned', JSON.stringify(pinnedConvs))
  renderAside()
}
function exportChat() {
  const lines = conversation.map((m) => {
    if (m.role === 'user') return `**你：** ${m.text}`
    return `**Echo：** ${m.html ? m.html.replace(/<[^>]+>/g, '') : ''}`
  })
  const md = `# 对话记录 · ${new Date().toLocaleString()}\n\n${lines.join('\n\n')}\n`
  const blob = new Blob([md], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `echoverse-chat-${Date.now()}.md`
  a.click()
  URL.revokeObjectURL(url)
  toast('对话已导出为 Markdown')
}

function newChat() {
  conversation = [{ role: 'echo', html: `<p>新对话已开启。我是 ${doppelName()}，可以回答关于 ${ownerName()} 的作品、文章、技术栈和创作思考。你想从哪里开始？</p>`, sources: [], followUps: [] }]
  CHAT_HISTORY.forEach((h) => (h.active = false))
  renderAside()
  renderMessages()
  closeMobileAside()
}
function selectHistory(id) {
  CHAT_HISTORY.forEach((h) => (h.active = h.id === id))
  const target = CHAT_HISTORY.find((h) => h.id === id)
  if (!target) return
  if (id === 'c1') conversation = initialConversation()
  else conversation = [{ role: 'echo', html: `<p>已切换到「${target.title}」。你可以继续追问，或者开始新的话题～</p>`, sources: [], followUps: [] }]
  renderAside()
  renderMessages()
  closeMobileAside()
}

// ============================================================
// 移动端侧栏
// ============================================================
function setupMobileAside() {
  const btn = document.getElementById('evo-chat-history-btn')
  const aside = document.getElementById('evo-chat-aside')
  const overlay = document.getElementById('evo-chat-overlay')
  if (!btn || !aside || !overlay) return
  aside.classList.add('lg:!block')
  const open = () => { aside.classList.remove('hidden'); aside.classList.add('fixed', 'top-16', 'left-0', 'z-[65]', 'w-72', 'max-w-[80vw]', 'h-[calc(100vh-4rem)]', 'evo-glass-strong', 'rounded-none', 'evo-animate-slide-in'); overlay.classList.add('is-open'); document.body.style.overflow = 'hidden' }
  const close = () => { aside.classList.remove('fixed', 'top-16', 'left-0', 'z-[65]', 'w-72', 'max-w-[80vw]', 'h-[calc(100vh-4rem)]', 'evo-glass-strong', 'rounded-none', 'evo-animate-slide-in'); aside.classList.add('hidden'); overlay.classList.remove('is-open'); document.body.style.overflow = '' }
  btn.addEventListener('click', open)
  overlay.addEventListener('click', close)
  window.__closeMobileAside = close
}
function closeMobileAside() { if (window.__closeMobileAside && window.matchMedia('(max-width: 1023px)').matches) window.__closeMobileAside() }

// ============================================================
// 快捷提问
// ============================================================
function renderQuickPrompts() {
  const box = document.getElementById('evo-quick-prompts')
  if (!box) return
  box.innerHTML = QUICK_PROMPTS.map((p, i) => `<button data-quick-prompt="${i}" class="px-3 py-1.5 rounded-full text-xs border border-[var(--evo-border)] text-[var(--evo-ink-2)] hover:border-[var(--evo-purple-400)] hover:text-[var(--evo-purple-300)] transition-colors">${p}</button>`).join('')
  box.querySelectorAll('[data-quick-prompt]').forEach((btn) => btn.addEventListener('click', () => sendUserMessage(QUICK_PROMPTS[Number(btn.dataset.quickPrompt)])))
}

// ============================================================
// 功能 9：风格切换
// ============================================================
function setupStyleSwitcher() {
  document.querySelectorAll('.style-btn').forEach((btn) => {
    if (btn.dataset.style === chatStyle) btn.classList.add('bg-[var(--evo-surface-2)]', 'text-[var(--evo-ink)]')
    btn.addEventListener('click', () => {
      chatStyle = btn.dataset.style
      localStorage.setItem('echoverse:chat:style', chatStyle)
      document.querySelectorAll('.style-btn').forEach((b) => b.classList.remove('bg-[var(--evo-surface-2)]', 'text-[var(--evo-ink)]'))
      btn.classList.add('bg-[var(--evo-surface-2)]', 'text-[var(--evo-ink)]')
      toast(`已切换为${chatStyle === 'normal' ? '正式' : chatStyle === 'casual' ? '日常' : '诗意'}风格`)
    })
  })
}

// ============================================================
// 功能 11：主题切换
// ============================================================
const THEMES = {
  dark: { name: '深空', vars: {} },
  warm: { name: '暖光', vars: { '--evo-primary': '#d97757', '--evo-purple-400': '#e8a87c', '--evo-purple-500': '#d97757', '--evo-cyan': '#f4c7a1', '--evo-pink': '#e8a87c' } },
  light: { name: '极简', vars: { '--evo-surface': '#f8f8fc', '--evo-surface-2': '#eef0f5', '--evo-ink': '#1a1a2e', '--evo-ink-2': '#4a4a6a', '--evo-ink-3': '#8a8aaa', '--evo-border': '#e0e2ea', '--evo-glass': 'rgba(255,255,255,0.7)' } }
}
function setupThemeToggle() {
  const btn = document.getElementById('evo-theme-toggle')
  if (!btn) return
  applyTheme(chatTheme)
  btn.addEventListener('click', () => {
    const keys = Object.keys(THEMES)
    const idx = keys.indexOf(chatTheme)
    chatTheme = keys[(idx + 1) % keys.length]
    localStorage.setItem('echoverse:chat:theme', chatTheme)
    applyTheme(chatTheme)
    toast(`已切换为${THEMES[chatTheme].name}主题`)
  })
}
function applyTheme(theme) {
  const root = document.documentElement
  // 先重置所有自定义变量
  Object.values(THEMES).forEach((t) => Object.keys(t.vars).forEach((k) => root.style.removeProperty(k)))
  // 应用当前主题
  const vars = THEMES[theme]?.vars || {}
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v))
}

// ============================================================
// 功能 10：人设面板
// ============================================================
function setupPersonaPanel() {
  const btn = document.getElementById('evo-persona-btn')
  const modal = document.getElementById('evo-persona-modal')
  if (!btn || !modal) return
  btn.addEventListener('click', () => {
    const s = LIVE_DATA.settings, on = ownerName(), dn = doppelName()
    const identity = s && s.identity ? s.identity : `${on} 的数字分身 Echo`
    const bio = s && s.bio ? s.bio : ''
    const skills = s && Array.isArray(s.skills) ? s.skills : []
    const socials = s && Array.isArray(s.socials) ? s.socials : []
    const nP = LIVE_DATA.projects.length, nA = LIVE_DATA.articles.length, nN = LIVE_DATA.notes.length
    document.getElementById('evo-persona-content').innerHTML = `
      <div class="flex items-center gap-4 mb-4">
        ${avatarHtml('w-16 h-16')}
        <div>
          <h3 class="evo-title text-xl">${dn}</h3>
          <p class="text-sm text-[var(--evo-ink-2)]">${on} 的数字分身</p>
        </div>
      </div>
      <p class="text-sm text-[var(--evo-ink)] mb-3">${identity}</p>
      ${bio ? `<p class="text-sm text-[var(--evo-ink-2)] mb-3">${bio}</p>` : ''}
      ${skills.length ? `<div class="mb-3"><div class="text-xs text-[var(--evo-ink-3)] mb-1">能力标签</div><div class="flex flex-wrap gap-2">${skills.map((sk) => `<span class="px-2 py-1 rounded bg-[var(--evo-purple-500)]/20 text-[var(--evo-purple-300)] text-xs">${sk}</span>`).join('')}</div></div>` : ''}
      <div class="mb-3"><div class="text-xs text-[var(--evo-ink-3)] mb-1">知识库</div><div class="flex gap-4 text-sm"><span class="text-[var(--evo-purple-300)]">${nP} 作品</span><span class="text-[var(--evo-cyan)]">${nA} 文章</span>${nN ? `<span class="text-[var(--evo-pink)]">${nN} 笔记</span>` : ''}</div></div>
      ${socials.length ? `<div class="text-xs text-[var(--evo-ink-3)]">联系：${socials.map((x) => typeof x === 'string' ? x : x.label).join(' · ')}</div>` : ''}
    `
    modal.classList.remove('hidden')
  })
  modal.querySelectorAll('[data-close-persona]').forEach((el) => el.addEventListener('click', () => modal.classList.add('hidden')))
}

// ============================================================
// 功能 8：知识图谱
// ============================================================
function setupGraph() {
  const btn = document.getElementById('evo-graph-btn')
  const modal = document.getElementById('evo-graph-modal')
  if (!btn || !modal) return
  btn.addEventListener('click', () => {
    modal.classList.remove('hidden')
    drawGraph()
  })
  modal.querySelectorAll('[data-close-graph]').forEach((el) => el.addEventListener('click', () => modal.classList.add('hidden')))
}

function drawGraph() {
  const canvas = document.getElementById('evo-graph-canvas')
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const W = canvas.width = canvas.offsetWidth * 2
  const H = canvas.height = 1000
  ctx.scale(2, 2)
  const w = W / 2, h = H / 2

  // 构建节点：中心=Echo，周围=作品/文章/笔记
  const nodes = [{ id: 'echo', label: doppelName(), r: 28, color: '#a855f7', x: w / 2, y: h / 2, vx: 0, vy: 0 }]
  const colors = { project: '#a855f7', article: '#06b6d4', note: '#ec4899' }
  LIVE_DATA.projects.slice(0, 8).forEach((p, i) => nodes.push({ id: 'p' + i, label: p.title.slice(0, 6), r: 12, color: colors.project, type: 'project' }))
  LIVE_DATA.articles.slice(0, 8).forEach((a, i) => nodes.push({ id: 'a' + i, label: a.title.slice(0, 6), r: 12, color: colors.article, type: 'article' }))
  LIVE_DATA.notes.slice(0, 6).forEach((n, i) => nodes.push({ id: 'n' + i, label: (n.title || '笔记').slice(0, 6), r: 10, color: colors.note, type: 'note' }))

  // 初始化位置（环形）
  const cx = w / 2, cy = h / 2
  nodes.slice(1).forEach((n, i) => {
    const angle = (i / (nodes.length - 1)) * Math.PI * 2
    const dist = 120 + (i % 3) * 50
    n.x = cx + Math.cos(angle) * dist
    n.y = cy + Math.sin(angle) * dist
    n.vx = 0; n.vy = 0
  })

  // 力导向模拟
  function tick() {
    for (let i = 0; i < 80; i++) {
      // 斥力
      for (let a = 0; a < nodes.length; a++) {
        for (let b = a + 1; b < nodes.length; b++) {
          const dx = nodes[b].x - nodes[a].x
          const dy = nodes[b].y - nodes[a].y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const force = 800 / (dist * dist)
          const fx = (dx / dist) * force
          const fy = (dy / dist) * force
          nodes[a].vx -= fx; nodes[a].vy -= fy
          nodes[b].vx += fx; nodes[b].vy += fy
        }
      }
      // 中心引力（除中心节点外都被中心吸引）
      nodes.slice(1).forEach((n) => {
        const dx = cx - n.x, dy = cy - n.y
        n.vx += dx * 0.01; n.vy += dy * 0.01
      })
      // 更新位置
      nodes.forEach((n) => {
        n.vx *= 0.9; n.vy *= 0.9
        n.x += n.vx; n.y += n.vy
      })
    }
  }
  tick()

  // 绘制
  ctx.clearRect(0, 0, w, h)
  // 连线（中心到所有节点）
  const center = nodes[0]
  nodes.slice(1).forEach((n) => {
    ctx.beginPath()
    ctx.moveTo(center.x, center.y)
    ctx.lineTo(n.x, n.y)
    ctx.strokeStyle = n.color + '40'
    ctx.lineWidth = 1
    ctx.stroke()
  })
  // 节点
  nodes.forEach((n) => {
    ctx.beginPath()
    ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
    ctx.fillStyle = n.color
    ctx.fill()
    ctx.strokeStyle = n.color + '80'
    ctx.lineWidth = 2
    ctx.stroke()
    // 标签
    ctx.fillStyle = '#e2e8f0'
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(n.label, n.x, n.y + n.r + 14)
  })
}

// ============================================================
// 表单 & 输入
// ============================================================
function setupForm() {
  const form = document.getElementById('evo-chat-form')
  const input = document.getElementById('evo-chat-input')
  if (!form || !input) return
  form.addEventListener('submit', (e) => { e.preventDefault(); sendUserMessage(input.value) })
  input.addEventListener('input', () => { autoResize(input); updateCharCount(); handleSlashMenu(input) })
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit() }
    else if (e.key === 'ArrowUp' && input.value === '') { e.preventDefault(); handleInputHistory(input, 'up') }
    else if (e.key === 'ArrowDown' && inputHistoryIndex >= 0) { e.preventDefault(); handleInputHistory(input, 'down') }
    else if (e.key === 'Escape') { document.getElementById('evo-slash-menu')?.classList.add('hidden') }
  })
}

// ============================================================
// 初始化
// ============================================================
async function init() {
  // 本地缓存恢复
  try {
    const cached = localStorage.getItem('echoverse:home:settings')
    if (cached) LIVE_DATA.settings = JSON.parse(cached)
  } catch {}
  if (LIVE_DATA.settings) updateHeaderAvatar()

  renderAside()
  renderQuickPrompts()
  setupForm()
  setupMobileAside()
  setupStyleSwitcher()
  setupThemeToggle()
  setupPersonaPanel()
  setupGraph()
  initVoice()

  // 请求通知权限
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission()

  conversation = [{ role: 'echo', html: `<p class="text-[var(--evo-ink-3)]">正在同步知识库…</p>`, sources: [] }]
  renderMessages()

  await ensureLiveData()
  try { localStorage.setItem('echoverse:home:settings', JSON.stringify(LIVE_DATA.settings)) } catch {}
  updateHeaderAvatar()
  conversation = initialConversation()
  renderAside()
  renderMessages()
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init)
else init()
