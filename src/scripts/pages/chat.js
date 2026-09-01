// ============================================================
// 对话 chat.js（实时版）
// 功能：
//   1) 打开页面就异步加载飞书：作品集 / 文章 / 笔记 / 站点设置
//   2) 左侧知识库 → 实时显示 文章/项目/笔记 真实数量 + 站点姓名
//   3) 用户提问 → 在飞书数据里做关键词搜索 → 真实组装回复 + 来源
//   4) 保留快捷提问、新建对话、历史切换、侧栏、打字指示器
// ============================================================

import { CHAT_HISTORY, QUICK_PROMPTS, ECHO_REPLIES, ECHO_FALLBACK_REPLY } from '../data.js'
import { fetchProjects, fetchArticles, fetchNotes, fetchSiteSettings } from '../feishu.js'

// ------------------------------------------------------------
// 全局缓存：飞书真实数据（如果加载失败则用 mock）
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
  return `<p class="text-[var(--evo-ink)]">你好！我是 <strong>${dn}</strong>，是 <strong>${on}</strong> 的数字分身。我基于她沉淀的所有数字化资产训练而成，可以回答关于她的${sentence} 你想了解什么呢？</p>`
}

// 初始默认对话（第一条「关于我的职业经历」）
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
// 渲染单条消息
// ------------------------------------------------------------
function messageEl(msg) {
  const wrap = document.createElement('div')
  if (msg.role === 'user') {
    wrap.className = 'flex gap-3 sm:gap-4 flex-row-reverse evo-animate-fade-in'
    wrap.innerHTML = `
      <div class="w-8 h-8 rounded-full bg-[var(--evo-surface-2)] flex items-center justify-center text-[var(--evo-ink-2)] text-xs font-bold shrink-0">你</div>
      <div class="max-w-[80%]">
        <div class="bg-[var(--evo-primary)] rounded-2xl rounded-tr-sm px-4 sm:px-5 py-3">
          <p class="text-white break-words"></p>
        </div>
      </div>`
    wrap.querySelector('p').textContent = msg.text
  } else {
    wrap.className = 'flex gap-3 sm:gap-4 evo-animate-fade-in'
    const sourcesHtml = msg.sources && msg.sources.length
      ? `<div class="flex flex-wrap gap-2 items-center mt-2">
           <span class="text-xs text-[var(--evo-ink-3)]">来源：</span>
           ${msg.sources.map((s) => sourceChip(s)).join('')}
         </div>`
      : ''
    wrap.innerHTML = `
      <div class="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--evo-purple-400)] to-[var(--evo-pink)] flex items-center justify-center text-white text-xs font-bold shrink-0">${avatarChar()}</div>
      <div class="max-w-[80%] min-w-0">
        <div class="evo-glass rounded-2xl rounded-tl-sm px-4 sm:px-5 py-3 text-[var(--evo-ink)] text-sm leading-relaxed break-words"></div>
        ${sourcesHtml}
      </div>`
    wrap.querySelector('.evo-glass').innerHTML = msg.html
  }
  return wrap
}

function sourceChip(s) {
  const colorMap = {
    purple: 'bg-[var(--evo-purple-500)]/20 text-[var(--evo-purple-300)]',
    cyan: 'bg-[var(--evo-cyan)]/20 text-[var(--evo-cyan)]',
    pink: 'bg-[var(--evo-pink)]/20 text-[var(--evo-pink)]'
  }
  const cls = colorMap[s.tone] || colorMap.purple
  return `<span class="px-2 py-1 rounded-[var(--evo-radius-sm)] ${cls} text-xs cursor-pointer hover:opacity-80 transition-opacity">${s.label}</span>`
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
  wrap.className = 'flex gap-3 sm:gap-4 evo-animate-fade-in'
  wrap.innerHTML = `
    <div class="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--evo-purple-400)] to-[var(--evo-pink)] flex items-center justify-center text-white text-xs font-bold shrink-0">${avatarChar()}</div>
    <div class="evo-glass rounded-2xl rounded-tl-sm px-5 py-4 flex items-center">
      <span class="evo-typing-dot"></span><span class="evo-typing-dot"></span><span class="evo-typing-dot"></span>
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
  input.focus()

  showTyping()
  const delay = 500 + Math.random() * 600
  setTimeout(async () => {
    hideTyping()
    // 确保飞书数据加载完毕
    await ensureLiveData()
    const reply = matchReply(text.trim())
    conversation.push({ role: 'echo', html: reply.html, sources: reply.sources })
    renderMessages()
  }, delay)
}

// ------------------------------------------------------------
// 搜索辅助
// ------------------------------------------------------------
function norm(s) {
  return (s || '').toString().toLowerCase()
}
function includesAny(text, keywords) {
  const t = norm(text)
  return keywords.some((k) => t.includes(norm(k)))
}

// 在一组对象里搜索：title / desc / excerpt / content / category / tags
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
    return {
      html: `<p class="text-[var(--evo-ink)]">目前作品集里还没有内容，${on} 还在持续产出中，敬请期待。</p>`,
      sources: []
    }
  }
  const items = list.map((p, i) => {
    const year = p.year ? `（${p.year}）` : ''
    const cat = p.categoryLabel || p.category ? ` · ${p.categoryLabel || p.category}` : ''
    const desc = p.desc ? ` — ${p.desc}` : ''
    return `<li><strong class="text-[var(--evo-ink)]">${i + 1}. ${p.title}</strong>${year}${cat}${desc}</li>`
  }).join('')
  return {
    html: `<p class="text-[var(--evo-ink)] mb-3">${on} 目前有 <strong>${all.length}</strong> 个作品，这里是${matched.length ? '相关的' : '部分代表性'}项目：</p>
      <ol class="list-decimal list-inside space-y-2 text-[var(--evo-ink-2)] text-sm">${items}</ol>`,
    sources: [
      { label: `作品集 - ${list.length} 个项目`, tone: 'purple' }
    ]
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
    return {
      html: `<p class="text-[var(--evo-ink)]">目前文章库里还没有内容，${on} 还在持续写作中。</p>`,
      sources: []
    }
  }
  const items = list.map((a) => {
    const cat = a.categoryLabel || a.category ? `<span class="text-[var(--evo-purple-300)]">【${a.categoryLabel || a.category}】</span>` : ''
    const date = a.date ? ` · ${a.date}` : ''
    const exc = a.excerpt ? ` — ${a.excerpt}` : ''
    return `<li><strong class="text-[var(--evo-ink)]">${a.title}</strong>${date}${cat}${exc}</li>`
  }).join('')
  return {
    html: `<p class="text-[var(--evo-ink)] mb-3">${on} 目前写了 <strong>${all.length}</strong> 篇文章，${matched.length ? '根据你的问题，推荐这些：' : '近期值得一读：'}</p>
      <ul class="list-disc list-inside space-y-2 text-[var(--evo-ink-2)] text-sm">${items}</ul>`,
    sources: [
      { label: `文章 - ${list.length} 篇`, tone: 'cyan' }
    ]
  }
}

// ------------------------------------------------------------
// 生成「笔记 / 数字花园」回复
// ------------------------------------------------------------
function generateNotesReply(text) {
  const all = LIVE_DATA.notes
  const matched = text && !/笔记|花园|想法|想法|思考/.test(text)
    ? searchItems(all, text).slice(0, 6)
    : all.slice(0, 6)
  const list = (matched && matched.length ? matched : all.slice(0, 6))
  const on = ownerName()
  if (!list.length) {
    return {
      html: `<p class="text-[var(--evo-ink)]">数字花园目前还没有种下种子，${on} 会陆续把碎片化思考、阅读笔记上传进来。</p>`,
      sources: []
    }
  }
  const items = list.map((n) => {
    const cat = n.category || n.categoryLabel ? `<span class="text-[var(--evo-pink)]">【${n.category || n.categoryLabel}】</span>` : ''
    const content = n.excerpt || n.content || n.title || ''
    return `<li><strong class="text-[var(--evo-ink)]">${n.title || '一则笔记'}</strong>${cat} — ${content}</li>`
  }).join('')
  return {
    html: `<p class="text-[var(--evo-ink)] mb-3">她的数字花园里有 <strong>${all.length}</strong> 条笔记节点，${matched.length ? '和你问题相关的有这些：' : '最新几条：'}</p>
      <ul class="list-disc list-inside space-y-2 text-[var(--evo-ink-2)] text-sm">${items}</ul>`,
    sources: [
      { label: `数字花园 - ${list.length} 条笔记`, tone: 'pink' }
    ]
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
    ? `<p class="mt-3 mb-2 text-[var(--evo-ink)]"><strong>擅长方向：</strong></p>
       <div class="flex flex-wrap gap-2">
         ${skills.map((sk) => `<span class="px-2 py-1 rounded-[var(--evo-radius-sm)] bg-[var(--evo-purple-500)]/20 text-[var(--evo-purple-300)] text-xs">${sk}</span>`).join('')}
       </div>`
    : ''
  const socials = s && Array.isArray(s.socials) && s.socials.length ? s.socials : []
  const socialsHtml = socials.length
    ? `<p class="mt-3 text-[var(--evo-ink-2)] text-sm"><strong>联系方式 / 社交：</strong> ${socials.map((x) => typeof x === 'string' ? x : (x.label || '') + (x.url ? `（${x.url}）` : '')).join(' · ')}</p>`
    : ''
  return {
    html: `<p class="text-[var(--evo-ink)]"><strong>${on}</strong> — ${identity}</p>
           ${bio ? `<p class="mt-2 text-[var(--evo-ink-2)]">${bio}</p>` : ''}
           ${skillsHtml}
           ${socialsHtml}`,
    sources: [
      { label: '站点设置 - 关于我', tone: 'purple' }
    ]
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
  if (lastProj) lines.push(`最近完成作品：<strong class="text-[var(--evo-ink)]">${lastProj.title}</strong>${lastProj.year ? `（${lastProj.year}）` : ''}`)
  if (lastArt) lines.push(`最近发表文章：<strong class="text-[var(--evo-ink)]">${lastArt.title}</strong>${lastArt.date ? ` · ${lastArt.date}` : ''}`)
  lines.push(`整体产出：<strong>${nProjects}</strong> 个作品 · <strong>${nArticles}</strong> 篇文章 · <strong>${nNotes}</strong> 条笔记`)
  return {
    html: `<p class="text-[var(--evo-ink)] mb-2">${on} 最近一直在产出内容，当前状态：</p>
      <ul class="list-disc list-inside space-y-1 text-[var(--evo-ink-2)] text-sm">${lines.map((l) => `<li>${l}</li>`).join('')}</ul>`,
    sources: [
      { label: `作品集 · ${nProjects}`, tone: 'purple' },
      { label: `文章 · ${nArticles}`, tone: 'cyan' },
      nNotes ? { label: `笔记 · ${nNotes}`, tone: 'pink' } : null
    ].filter(Boolean)
  }
}

// ------------------------------------------------------------
// 组装最终回复（路由 → 搜索 → 关键词回退）
// ------------------------------------------------------------
function matchReply(text) {
  const t = text || ''
  const lower = t.toLowerCase()

  // 路由：关于人
  if (includesAny(t, ['你是谁', '我是谁', '介绍一下', '自我介绍', '她是谁', '关于她', '简介', '身份'])) {
    return generateAboutReply(t)
  }
  // 路由：最近在做 / 经历 / 时间线
  if (includesAny(t, ['最近在做', '最近做什么', '近况', '最近忙', '现在在做', '经历', '时间线', '职业'])) {
    return generateTimelineReply()
  }
  // 路由：作品 / 项目
  if (includesAny(t, ['作品', '项目', 'portfolio', '作品集', '设计', '代表作', '代表性']) ||
      searchItems(LIVE_DATA.projects, t).length > 0) {
    return generateProjectsReply(t)
  }
  // 路由：文章
  if (includesAny(t, ['文章', '写', '博客', 'articles', '推荐文章', '最近文章']) ||
      searchItems(LIVE_DATA.articles, t).length > 0) {
    return generateArticlesReply(t)
  }
  // 路由：笔记 / 花园
  if (includesAny(t, ['笔记', '花园', '数字花园', '想法', '碎片化', '思考', 'garden', 'notes']) ||
      searchItems(LIVE_DATA.notes, t).length > 0) {
    return generateNotesReply(t)
  }
  // 路由：技能 / 技术栈
  if (includesAny(t, ['技术栈', '技术', '会什么', '擅长', '技能', '能力', '会用', '什么技术'])) {
    const s = LIVE_DATA.settings
    const arr = s && Array.isArray(s.skills) && s.skills.length ? s.skills : []
    if (arr.length) {
      return {
        html: `<p class="text-[var(--evo-ink)] mb-2">她主要的技术栈 / 技能包括：</p>
          <div class="flex flex-wrap gap-2">
            ${arr.map((sk) => `<span class="px-2 py-1 rounded-[var(--evo-radius-sm)] bg-[var(--evo-cyan)]/20 text-[var(--evo-cyan)] text-xs">${sk}</span>`).join('')}
          </div>`,
        sources: [{ label: '站点设置 - 技能项', tone: 'cyan' }]
      }
    }
  }

  // 回退 1：对三张表做模糊搜索，如果能搜到就拼起来
  const p = searchItems(LIVE_DATA.projects, t).slice(0, 3)
  const a = searchItems(LIVE_DATA.articles, t).slice(0, 3)
  const n = searchItems(LIVE_DATA.notes, t).slice(0, 3)
  if (p.length || a.length || n.length) {
    const parts = []
    const sources = []
    if (p.length) {
      parts.push(`<p class="text-[var(--evo-ink)] mb-2"><strong>作品中相关内容：</strong></p>
        <ul class="list-disc list-inside space-y-1 text-[var(--evo-ink-2)] text-sm mb-3">
          ${p.map((x) => `<li>${x.title}${x.desc ? ` — ${x.desc}` : ''}</li>`).join('')}
        </ul>`)
      sources.push({ label: `作品 - ${p.length}`, tone: 'purple' })
    }
    if (a.length) {
      parts.push(`<p class="text-[var(--evo-ink)] mb-2"><strong>文章中相关内容：</strong></p>
        <ul class="list-disc list-inside space-y-1 text-[var(--evo-ink-2)] text-sm mb-3">
          ${a.map((x) => `<li>${x.title}${x.excerpt ? ` — ${x.excerpt}` : ''}</li>`).join('')}
        </ul>`)
      sources.push({ label: `文章 - ${a.length}`, tone: 'cyan' })
    }
    if (n.length) {
      parts.push(`<p class="text-[var(--evo-ink)] mb-2"><strong>笔记中相关内容：</strong></p>
        <ul class="list-disc list-inside space-y-1 text-[var(--evo-ink-2)] text-sm">
          ${n.map((x) => `<li>${x.title || '一则笔记'}${x.excerpt || x.content ? ` — ${x.excerpt || x.content}` : ''}</li>`).join('')}
        </ul>`)
      sources.push({ label: `笔记 - ${n.length}`, tone: 'pink' })
    }
    return {
      html: `<p class="text-[var(--evo-ink)] mb-3">我在她的知识库里搜索了「${t}」，找到这些相关内容：</p>${parts.join('')}`,
      sources
    }
  }

  // 回退 2：走老的 data.js ECHO_REPLIES（关键词写死）
  for (const item of ECHO_REPLIES) {
    if (item.matches.some((kw) => lower.includes(kw.toLowerCase()))) {
      return { html: item.reply, sources: item.sources || [] }
    }
  }

  // 回退 3：默认兜底
  const on = ownerName()
  const fallback = `<p class="text-[var(--evo-ink)]">这个问题我暂时在 ${on} 的知识库里没有找到相关内容，你可以换一种说法试试，或者问我关于她的作品、文章、思考和经历～</p>`
  return { html: fallback, sources: [] }
}

// ------------------------------------------------------------
// 左侧栏（对话历史 + 真实知识库计数）
// ------------------------------------------------------------
function renderAside() {
  const aside = document.getElementById('evo-chat-aside')
  if (!aside) return
  const historyHtml = CHAT_HISTORY.map(
    (h) => `
      <button data-history-id="${h.id}" class="w-full text-left p-3 rounded-[var(--evo-radius-md)] text-sm transition-colors ${
        h.active
          ? 'bg-[var(--evo-surface-2)] text-[var(--evo-ink)]'
          : 'text-[var(--evo-ink-2)] hover:bg-[var(--evo-surface-2)] hover:text-[var(--evo-ink)]'
      }">${h.title}</button>`
  ).join('')

  const nArticles = LIVE_DATA.articles.length
  const nProjects = LIVE_DATA.projects.length
  const nNotes = LIVE_DATA.notes.length
  const on = ownerName()
  const dn = doppelName()

  aside.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <h2 class="evo-title text-lg">对话 · ${dn}</h2>
      <button id="evo-new-chat" class="text-xs px-3 py-1.5 rounded-[var(--evo-radius-md)] border border-[var(--evo-border)] hover:bg-[var(--evo-surface-2)] transition-colors">+ 新建对话</button>
    </div>
    <div class="space-y-2">${historyHtml}</div>
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
  aside.querySelectorAll('[data-history-id]').forEach((btn) => {
    btn.addEventListener('click', () => selectHistory(btn.dataset.historyId))
  })
}

// ------------------------------------------------------------
// 新建 / 切换历史
// ------------------------------------------------------------
function newChat() {
  conversation = [{ role: 'echo', html: `<p class="text-[var(--evo-ink)]">新对话已开启。我是 ${doppelName()}，可以回答关于 ${ownerName()} 的作品、文章、技术栈和创作思考。你想从哪里开始？</p>` }]
  CHAT_HISTORY.forEach((h) => (h.active = false))
  renderAside()
  renderMessages()
  closeMobileAside()
}
function selectHistory(id) {
  CHAT_HISTORY.forEach((h) => (h.active = h.id === id))
  const target = CHAT_HISTORY.find((h) => h.id === id)
  if (!target) return
  if (id === 'c1') {
    conversation = initialConversation()
  } else {
    conversation = [{ role: 'echo', html: `<p class="text-[var(--evo-ink)]">已切换到「${target.title}」。你可以继续追问，或者开始新的话题～</p>` }]
  }
  renderAside()
  renderMessages()
  closeMobileAside()
}

// ------------------------------------------------------------
// 移动端侧栏
// ------------------------------------------------------------
function setupMobileAside() {
  const btn = document.getElementById('evo-chat-history-btn')
  const aside = document.getElementById('evo-chat-aside')
  const overlay = document.getElementById('evo-chat-overlay')
  if (!btn || !aside || !overlay) return
  aside.classList.add('lg:!block')
  const open = () => {
    aside.classList.remove('hidden')
    aside.classList.add('fixed', 'top-16', 'left-0', 'z-[65]', 'w-72', 'max-w-[80vw]', 'h-[calc(100vh-4rem)]', 'evo-glass-strong', 'rounded-none', 'evo-animate-slide-in')
    overlay.classList.add('is-open')
    document.body.style.overflow = 'hidden'
  }
  const close = () => {
    aside.classList.remove('fixed', 'top-16', 'left-0', 'z-[65]', 'w-72', 'max-w-[80vw]', 'h-[calc(100vh-4rem)]', 'evo-glass-strong', 'rounded-none', 'evo-animate-slide-in')
    aside.classList.add('hidden')
    overlay.classList.remove('is-open')
    document.body.style.overflow = ''
  }
  btn.addEventListener('click', open)
  overlay.addEventListener('click', close)
  window.__closeMobileAside = close
}
function closeMobileAside() {
  if (window.__closeMobileAside && window.matchMedia('(max-width: 1023px)').matches) {
    window.__closeMobileAside()
  }
}

// ------------------------------------------------------------
// 快捷提问
// ------------------------------------------------------------
function renderQuickPrompts() {
  const box = document.getElementById('evo-quick-prompts')
  if (!box) return
  box.innerHTML = QUICK_PROMPTS.map(
    (p, i) => `
      <button data-quick-prompt="${i}" class="px-3 py-1.5 rounded-full text-xs border border-[var(--evo-border)] text-[var(--evo-ink-2)] hover:border-[var(--evo-purple-400)] hover:text-[var(--evo-purple-300)] transition-colors">${p}</button>`
  ).join('')
  box.querySelectorAll('[data-quick-prompt]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const text = QUICK_PROMPTS[Number(btn.dataset.quickPrompt)]
      sendUserMessage(text)
    })
  })
}

// ------------------------------------------------------------
// 表单提交
// ------------------------------------------------------------
function setupForm() {
  const form = document.getElementById('evo-chat-form')
  const input = document.getElementById('evo-chat-input')
  if (!form || !input) return
  form.addEventListener('submit', (e) => {
    e.preventDefault()
    sendUserMessage(input.value)
  })
}

// ------------------------------------------------------------
// 初始化（先加载飞书，再渲染）
// ------------------------------------------------------------
async function init() {
  // 飞书异步加载，期间先渲染初始 UI，加载完后刷新
  renderAside()
  renderQuickPrompts()
  setupForm()
  setupMobileAside()

  // 先给一个「加载数据」提示，等飞书数据回来后替换为真实初始对话
  conversation = [{ role: 'echo', html: `<p class="text-[var(--evo-ink-3)]">正在同步知识库…</p>` }]
  renderMessages()

  await ensureLiveData()
  conversation = initialConversation()
  renderAside()
  renderMessages()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
