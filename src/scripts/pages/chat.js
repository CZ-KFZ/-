// ============================================================
// 对话 chat.js（东方意境组件 · 黑色风格）
// 功能：
//   1) 打开页面就异步加载飞书：作品集 / 文章 / 笔记 / 站点设置
//   2) 知识库横幅 → 实时显示 文章/项目/笔记 真实数量 + 站点姓名
//   3) 用户提问 → 在飞书数据里做关键词搜索 → 真实组装回复 + 来源
//   4) 保留快捷卡片、新建对话、打字指示器
// ============================================================

import { CHAT_HISTORY, QUICK_PROMPTS, ECHO_REPLIES, ECHO_FALLBACK_REPLY } from '../data.js'
import { fetchProjects, fetchArticles, fetchNotes, fetchSiteSettings } from '../feishu.js'

// ------------------------------------------------------------
// 全局缓存：飞书真实数据
// ------------------------------------------------------------
let LIVE_DATA = {
  loaded: false,
  projects: [],
  articles: [],
  notes: [],
  settings: null
}

// ------------------------------------------------------------
// 加载飞书数据
// ------------------------------------------------------------
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
// 得到分身显示名 & 所有者名
// ------------------------------------------------------------
function ownerName() {
  const s = LIVE_DATA.settings
  return (s && s.ownerName) || '阴之体道'
}
function doppelName() {
  const on = ownerName()
  return on === '阴之体道' ? 'Echo' : on
}
function avatarChar() {
  const s = LIVE_DATA.settings
  if (s && s.avatarChar) return s.avatarChar
  const on = ownerName()
  return on ? on.slice(0, 1) : 'E'
}

// ------------------------------------------------------------
// 初始问候（读站点设置后组装）
// ------------------------------------------------------------
function greetingHtml() {
  const on = ownerName()
  const dn = doppelName()
  const bio = (LIVE_DATA.settings && (LIVE_DATA.settings.bio || LIVE_DATA.settings.identity)) || ''
  const sentence = bio
    ? `（${bio}）`
    : '作品、经历、思考等任何问题。'
  return `你好！我是 <strong>${dn}</strong>，是 <strong>${on}</strong> 的数字分身。我基于她沉淀的所有数字化资产训练而成，可以回答关于她的${sentence} 你想了解什么呢？`
}

// 初始默认对话
function initialConversation() {
  return [
    { role: 'echo', html: greetingHtml() },
    { role: 'user', text: '能介绍一下她最有代表性的项目吗？' },
    generateProjectsReply('能介绍一下她最有代表性的项目吗？')
  ]
}

// ------------------------------------------------------------
// 状态
// ------------------------------------------------------------
let conversation = []
let isEchoTyping = false

// ------------------------------------------------------------
// 简易 Markdown 渲染
// ------------------------------------------------------------
function renderMarkdown(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>')
    .replace(/-\s(.+)/g, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/g, '<ul>$1</ul>')
}

// ------------------------------------------------------------
// 渲染单条消息
// ------------------------------------------------------------
function messageEl(msg) {
  const wrap = document.createElement('div')
  wrap.className = 'msg-anim flex gap-3'

  if (msg.role === 'user') {
    wrap.classList.add('flex-row-reverse')
    wrap.innerHTML = `
      <div class="w-8 h-8 rounded-full bg-gradient-to-br from-white/20 to-white/5 flex items-center justify-center text-white text-xs font-bold shrink-0">你</div>
      <div class="max-w-[80%]">
        <div class="msg-bubble-user rounded-2xl px-4 py-2.5 text-sm leading-relaxed"></div>
      </div>`
    wrap.querySelector('.msg-bubble-user').textContent = msg.text
  } else {
    const sourcesHtml = msg.sources && msg.sources.length
      ? `<div class="flex flex-wrap gap-2 items-center mt-2">
           <span class="text-xs text-white/30">来源：</span>
           ${msg.sources.map((s) => `<span class="px-2 py-0.5 rounded-full bg-white/5 text-white/50 text-xs">${s.label}</span>`).join('')}
         </div>`
      : ''
    wrap.innerHTML = `
      <div class="w-8 h-8 rounded-full bg-gradient-to-br from-white/15 to-white/5 flex items-center justify-center text-white text-xs font-bold shrink-0">${avatarChar()}</div>
      <div class="max-w-[80%] min-w-0">
        <div class="msg-bubble-echo rounded-2xl px-4 py-2.5 text-sm leading-relaxed break-words"></div>
        ${sourcesHtml}
      </div>`
    wrap.querySelector('.msg-bubble-echo').innerHTML = msg.html
  }
  return wrap
}

function renderMessages() {
  const box = document.getElementById('evo-chat-messages')
  if (!box) return
  box.innerHTML = ''
  conversation.forEach((msg) => box.appendChild(messageEl(msg)))
  scrollToBottom()
}
function scrollToBottom() {
  const box = document.getElementById('evo-chat-messages')
  if (box) box.scrollTop = box.scrollHeight
}

// ------------------------------------------------------------
// 打字指示器
// ------------------------------------------------------------
function showTyping() {
  isEchoTyping = true
  const box = document.getElementById('evo-chat-messages')
  const wrap = document.createElement('div')
  wrap.id = 'evo-typing-indicator'
  wrap.className = 'msg-anim flex gap-3'
  wrap.innerHTML = `
    <div class="w-8 h-8 rounded-full bg-gradient-to-br from-white/15 to-white/5 flex items-center justify-center text-white text-xs font-bold shrink-0">${avatarChar()}</div>
    <div class="msg-bubble-echo rounded-2xl px-5 py-4 flex items-center">
      <span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>
    </div>`
  box.appendChild(wrap)
  scrollToBottom()
}
function hideTyping() {
  isEchoTyping = false
  const el = document.getElementById('evo-typing-indicator')
  if (el) el.remove()
}

// ------------------------------------------------------------
// 发送消息
// ------------------------------------------------------------
function sendUserMessage(text) {
  if (!text || !text.trim() || isEchoTyping) return
  conversation.push({ role: 'user', text: text.trim() })
  renderMessages()
  const input = document.getElementById('evo-chat-input')
  input.value = ''
  autoResize(input)

  showTyping()
  const delay = 500 + Math.random() * 600
  setTimeout(async () => {
    hideTyping()
    await ensureLiveData()
    const reply = matchReply(text.trim())
    conversation.push({ role: 'echo', html: reply.html, sources: reply.sources })
    renderMessages()
  }, delay)
}

// ------------------------------------------------------------
// textarea 自动高度
// ------------------------------------------------------------
function autoResize(el) {
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 100) + 'px'
}

// ------------------------------------------------------------
// 搜索辅助
// ------------------------------------------------------------
function norm(s) { return (s || '').toString().toLowerCase() }
function includesAny(text, keywords) {
  const t = norm(text)
  return keywords.some((k) => t.includes(norm(k)))
}
function searchItems(items, text, extraFields = []) {
  const q = norm(text)
  const hit = (it) => {
    const hay = [it.title, it.desc, it.excerpt, it.content, it.category, it.categoryLabel, (it.tags || []).join(' '), ...extraFields.map((f) => it[f])].join(' ')
    return norm(hay).includes(q)
  }
  return items.filter(hit)
}

// ------------------------------------------------------------
// 生成「作品相关」回复
// ------------------------------------------------------------
function generateProjectsReply(text) {
  const all = LIVE_DATA.projects
  const matched = text && !/代表|推荐|最新|项目|作品/.test(text)
    ? searchItems(all, text).slice(0, 5)
    : all.slice(0, 5)
  const list = (matched && matched.length ? matched : all.slice(0, 5))
  const on = ownerName()
  if (!list.length) {
    return { html: `目前作品集里还没有内容，${on} 还在持续产出中，敬请期待。`, sources: [] }
  }
  const items = list.map((p, i) => {
    const year = p.year ? `（${p.year}）` : ''
    const cat = p.categoryLabel || p.category ? ` · ${p.categoryLabel || p.category}` : ''
    const desc = p.desc ? ` — ${p.desc}` : ''
    return `<li><strong>${i + 1}. ${p.title}</strong>${year}${cat}${desc}</li>`
  }).join('')
  return {
    html: `${on} 目前有 <strong>${all.length}</strong> 个作品，这里是${matched.length ? '相关的' : '部分代表性'}项目：<ul class="list-disc list-inside space-y-1 mt-2">${items}</ul>`,
    sources: [{ label: `作品集 - ${list.length} 个项目` }]
  }
}

// ------------------------------------------------------------
// 生成「文章相关」回复
// ------------------------------------------------------------
function generateArticlesReply(text) {
  const all = LIVE_DATA.articles
  const matched = text && !/推荐|最新|文章|写/.test(text)
    ? searchItems(all, text).slice(0, 6)
    : all.slice(0, 6)
  const list = (matched && matched.length ? matched : all.slice(0, 6))
  const on = ownerName()
  if (!list.length) {
    return { html: `目前文章库里还没有内容，${on} 还在持续写作中。`, sources: [] }
  }
  const items = list.map((a) => {
    const date = a.date ? ` · ${a.date}` : ''
    const exc = a.excerpt ? ` — ${a.excerpt}` : ''
    return `<li><strong>${a.title}</strong>${date}${exc}</li>`
  }).join('')
  return {
    html: `${on} 目前写了 <strong>${all.length}</strong> 篇文章，${matched.length ? '根据你的问题，推荐这些：' : '近期值得一读：'}<ul class="list-disc list-inside space-y-1 mt-2">${items}</ul>`,
    sources: [{ label: `文章 - ${list.length} 篇` }]
  }
}

// ------------------------------------------------------------
// 生成「笔记 / 数字花园」回复
// ------------------------------------------------------------
function generateNotesReply(text) {
  const all = LIVE_DATA.notes
  const matched = text && !/笔记|花园|想法|思考/.test(text)
    ? searchItems(all, text).slice(0, 6)
    : all.slice(0, 6)
  const list = (matched && matched.length ? matched : all.slice(0, 6))
  const on = ownerName()
  if (!list.length) {
    return { html: `数字花园目前还没有种下种子，${on} 会陆续把碎片化思考、阅读笔记上传进来。`, sources: [] }
  }
  const items = list.map((n) => {
    const content = n.excerpt || n.content || n.title || ''
    return `<li><strong>${n.title || '一则笔记'}</strong> — ${content}</li>`
  }).join('')
  return {
    html: `她的数字花园里有 <strong>${all.length}</strong> 条笔记节点，${matched.length ? '和你问题相关的有这些：' : '最新几条：'}<ul class="list-disc list-inside space-y-1 mt-2">${items}</ul>`,
    sources: [{ label: `数字花园 - ${list.length} 条笔记` }]
  }
}

// ------------------------------------------------------------
// 生成「关于人 / 身份 / 简介」回复
// ------------------------------------------------------------
function generateAboutReply(text) {
  const s = LIVE_DATA.settings
  const on = ownerName()
  const identity = s && s.identity ? s.identity : `${on} 的数字分身 Echo — 沉淀作品、文章、思考的数字化空间站。`
  const bio = s && s.bio ? s.bio : ''
  const skills = s && Array.isArray(s.skills) && s.skills.length ? s.skills : []
  const skillsHtml = skills.length
    ? `<p class="mt-3 mb-2"><strong>擅长方向：</strong></p>
       <div class="flex flex-wrap gap-2">
         ${skills.map((sk) => `<span class="px-2 py-0.5 rounded-full bg-white/5 text-white/60 text-xs">${sk}</span>`).join('')}
       </div>`
    : ''
  const socials = s && Array.isArray(s.socials) && s.socials.length ? s.socials : []
  const socialsHtml = socials.length
    ? `<p class="mt-3 text-sm"><strong>联系方式 / 社交：</strong> ${socials.map((x) => typeof x === 'string' ? x : (x.label || '') + (x.url ? `（${x.url}）` : '')).join(' · ')}</p>`
    : ''
  return {
    html: `<strong>${on}</strong> — ${identity}${bio ? `<p class="mt-2 text-white/70">${bio}</p>` : ''}${skillsHtml}${socialsHtml}`,
    sources: [{ label: '站点设置 - 关于我' }]
  }
}

// ------------------------------------------------------------
// 生成「时间线 / 最近在做」回复
// ------------------------------------------------------------
function generateTimelineReply() {
  const on = ownerName()
  const nProjects = LIVE_DATA.projects.length
  const nArticles = LIVE_DATA.articles.length
  const nNotes = LIVE_DATA.notes.length
  const lastProj = LIVE_DATA.projects[0]
  const lastArt = LIVE_DATA.articles[0]
  const lines = []
  if (lastProj) lines.push(`最近完成作品：<strong>${lastProj.title}</strong>${lastProj.year ? `（${lastProj.year}）` : ''}`)
  if (lastArt) lines.push(`最近发表文章：<strong>${lastArt.title}</strong>${lastArt.date ? ` · ${lastArt.date}` : ''}`)
  lines.push(`整体产出：<strong>${nProjects}</strong> 个作品 · <strong>${nArticles}</strong> 篇文章 · <strong>${nNotes}</strong> 条笔记`)
  return {
    html: `${on} 最近一直在产出内容，当前状态：<ul class="list-disc list-inside space-y-1 mt-2 text-sm">${lines.map((l) => `<li>${l}</li>`).join('')}</ul>`,
    sources: [
      { label: `作品集 · ${nProjects}` },
      { label: `文章 · ${nArticles}` },
      nNotes ? { label: `笔记 · ${nNotes}` } : null
    ].filter(Boolean)
  }
}

// ------------------------------------------------------------
// 组装最终回复（路由 → 搜索 → 关键词回退）
// ------------------------------------------------------------
function matchReply(text) {
  const t = text || ''
  const lower = t.toLowerCase()

  if (includesAny(t, ['你是谁', '我是谁', '介绍一下', '自我介绍', '她是谁', '关于她', '简介', '身份'])) {
    return generateAboutReply(t)
  }
  if (includesAny(t, ['最近在做', '最近做什么', '近况', '最近忙', '现在在做', '经历', '时间线', '职业'])) {
    return generateTimelineReply()
  }
  if (includesAny(t, ['作品', '项目', 'portfolio', '作品集', '设计', '代表作', '代表性']) ||
      searchItems(LIVE_DATA.projects, t).length > 0) {
    return generateProjectsReply(t)
  }
  if (includesAny(t, ['文章', '写', '博客', 'articles', '推荐文章', '最近文章']) ||
      searchItems(LIVE_DATA.articles, t).length > 0) {
    return generateArticlesReply(t)
  }
  if (includesAny(t, ['笔记', '花园', '数字花园', '想法', '碎片化', '思考', 'garden', 'notes']) ||
      searchItems(LIVE_DATA.notes, t).length > 0) {
    return generateNotesReply(t)
  }
  if (includesAny(t, ['技术栈', '技术', '会什么', '擅长', '技能', '能力', '会用', '什么技术'])) {
    const s = LIVE_DATA.settings
    const arr = s && Array.isArray(s.skills) && s.skills.length ? s.skills : []
    if (arr.length) {
      return {
        html: `她主要的技术栈 / 技能包括：<div class="flex flex-wrap gap-2 mt-2">${arr.map((sk) => `<span class="px-2 py-0.5 rounded-full bg-white/5 text-white/60 text-xs">${sk}</span>`).join('')}</div>`,
        sources: [{ label: '站点设置 - 技能项' }]
      }
    }
  }

  // 回退 1：模糊搜索
  const p = searchItems(LIVE_DATA.projects, t).slice(0, 3)
  const a = searchItems(LIVE_DATA.articles, t).slice(0, 3)
  const n = searchItems(LIVE_DATA.notes, t).slice(0, 3)
  if (p.length || a.length || n.length) {
    const parts = []
    const sources = []
    if (p.length) {
      parts.push(`<p class="mb-2"><strong>作品中相关内容：</strong></p><ul class="list-disc list-inside space-y-1 text-sm mb-3">${p.map((x) => `<li>${x.title}${x.desc ? ` — ${x.desc}` : ''}</li>`).join('')}</ul>`)
      sources.push({ label: `作品 - ${p.length}` })
    }
    if (a.length) {
      parts.push(`<p class="mb-2"><strong>文章中相关内容：</strong></p><ul class="list-disc list-inside space-y-1 text-sm mb-3">${a.map((x) => `<li>${x.title}${x.excerpt ? ` — ${x.excerpt}` : ''}</li>`).join('')}</ul>`)
      sources.push({ label: `文章 - ${a.length}` })
    }
    if (n.length) {
      parts.push(`<p class="mb-2"><strong>笔记中相关内容：</strong></p><ul class="list-disc list-inside space-y-1 text-sm">${n.map((x) => `<li>${x.title || '一则笔记'}${x.excerpt || x.content ? ` — ${x.excerpt || x.content}` : ''}</li>`).join('')}</ul>`)
      sources.push({ label: `笔记 - ${n.length}` })
    }
    return { html: `我在她的知识库里搜索了「${t}」，找到这些相关内容：${parts.join('')}`, sources }
  }

  // 回退 2：data.js ECHO_REPLIES
  for (const item of ECHO_REPLIES) {
    if (item.matches.some((kw) => lower.includes(kw.toLowerCase()))) {
      return { html: item.reply, sources: item.sources || [] }
    }
  }

  // 回退 3：默认兜底
  const on = ownerName()
  return { html: `这个问题我暂时在 ${on} 的知识库里没有找到相关内容，你可以换一种说法试试，或者问我关于她的作品、文章、思考和经历～`, sources: [] }
}

// ------------------------------------------------------------
// 快捷卡片
// ------------------------------------------------------------
const QUICK_CARDS = [
  { icon: '💼', label: '关于我的职业经历', text: '她的职业经历是什么？' },
  { icon: '📖', label: '推荐阅读的文章', text: '推荐几篇她的文章' },
  { icon: '🎨', label: '设计项目详情', text: '能介绍一下她的设计项目吗？' },
  { icon: '⚙️', label: '技术栈介绍', text: '她的技术栈是什么？' }
]

function renderQuickCards() {
  const box = document.getElementById('evo-quick-cards')
  if (!box) return
  box.innerHTML = QUICK_CARDS.map((c) => `
    <button data-quick-text="${c.text}" class="liquid-glass rounded-xl p-3 text-center hover:bg-white/5 transition-all">
      <span class="block text-xl mb-1">${c.icon}</span>
      <span class="text-xs text-white/60">${c.label}</span>
    </button>
  `).join('')
  box.querySelectorAll('[data-quick-text]').forEach((btn) => {
    btn.addEventListener('click', () => sendUserMessage(btn.dataset.quickText))
  })
}

// ------------------------------------------------------------
// 知识库横幅
// ------------------------------------------------------------
function renderKbBanner() {
  const ownerEl = document.getElementById('evo-kb-owner')
  const tagsEl = document.getElementById('evo-kb-tags')
  if (ownerEl) ownerEl.textContent = ownerName()
  if (!tagsEl) return
  const nArticles = LIVE_DATA.articles.length
  const nProjects = LIVE_DATA.projects.length
  const nNotes = LIVE_DATA.notes.length
  tagsEl.innerHTML = `
    <span class="px-2 py-0.5 rounded-full bg-white/5 text-white/50 text-xs">📄 ${nArticles} 篇文章</span>
    <span class="px-2 py-0.5 rounded-full bg-white/5 text-white/50 text-xs">🎨 ${nProjects} 个项目</span>
    ${nNotes ? `<span class="px-2 py-0.5 rounded-full bg-white/5 text-white/50 text-xs">📝 ${nNotes} 条笔记</span>` : ''}
  `
}

// ------------------------------------------------------------
// 新建对话
// ------------------------------------------------------------
function newChat() {
  conversation = [{ role: 'echo', html: `新对话已开启。我是 ${doppelName()}，可以回答关于 ${ownerName()} 的作品、文章、技术栈和创作思考。你想从哪里开始？` }]
  renderMessages()
}

// ------------------------------------------------------------
// 输入区交互
// ------------------------------------------------------------
function setupInput() {
  const input = document.getElementById('evo-chat-input')
  const sendBtn = document.getElementById('evo-chat-send')
  const newChatBtn = document.getElementById('evo-new-chat')
  if (!input || !sendBtn) return

  input.addEventListener('input', () => autoResize(input))
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendUserMessage(input.value)
    }
  })
  sendBtn.addEventListener('click', () => sendUserMessage(input.value))
  if (newChatBtn) newChatBtn.addEventListener('click', newChat)
}

// ------------------------------------------------------------
// 初始化
// ------------------------------------------------------------
async function init() {
  renderQuickCards()
  setupInput()

  // 先渲染加载状态
  conversation = [{ role: 'echo', html: '正在同步知识库…' }]
  renderMessages()
  renderKbBanner()

  // 加载飞书数据
  await ensureLiveData()

  // 用真实数据渲染
  conversation = initialConversation()
  renderKbBanner()
  renderMessages()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
