// ============================================================
// 对话 chat.js
// 功能：消息渲染、发送、Echo 关键词匹配回复、打字指示器、
//      快捷提问、新建对话、历史切换、移动端侧栏
// ============================================================

import { CHAT_HISTORY, QUICK_PROMPTS, ECHO_REPLIES, ECHO_FALLBACK_REPLY } from '../data.js'

// 初始对话（对应历史第一条「关于我的职业经历」）
const INITIAL_CONVERSATION = [
  {
    role: 'echo',
    html: `<p class="text-[var(--evo-ink)]">你好！我是 Echo，是她的数字分身。我基于她沉淀的所有数字化资产训练而成，可以回答关于她的作品、经历、思考等任何问题。你想了解什么呢？</p>`
  },
  {
    role: 'user',
    text: '能介绍一下她最有代表性的项目吗？'
  },
  {
    role: 'echo',
    html: `<p class="text-[var(--evo-ink)] mb-3">她有几个比较有代表性的项目：</p>
      <ol class="list-decimal list-inside space-y-2 text-[var(--evo-ink-2)] text-sm">
        <li><strong class="text-[var(--evo-ink)]">城市记忆档案馆</strong> — 用 3D 扫描还原老城区风貌，获 2024 数字艺术创新奖。</li>
        <li><strong class="text-[var(--evo-ink)]">思维花园</strong> — 500+ 笔记节点、2000+ 关联的个人知识网络。</li>
        <li><strong class="text-[var(--evo-ink)]">Echo 数字分身</strong> — 就是我啦，用她所有公开内容训练而成。</li>
      </ol>`,
    sources: [
      { label: '作品集 - 3 个项目', tone: 'purple' },
      { label: '文章：关于数字分身的思考', tone: 'cyan' }
    ]
  }
]

// 状态
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
      <div class="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--evo-purple-400)] to-[var(--evo-pink)] flex items-center justify-center text-white text-xs font-bold shrink-0">E</div>
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

// ------------------------------------------------------------
// 渲染整个消息列表
// ------------------------------------------------------------
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
    <div class="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--evo-purple-400)] to-[var(--evo-pink)] flex items-center justify-center text-white text-xs font-bold shrink-0">E</div>
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
// 发送用户消息 → 触发 Echo 回复
// ------------------------------------------------------------
function sendUserMessage(text) {
  if (!text || !text.trim() || isEchoTyping) return
  conversation.push({ role: 'user', text: text.trim() })
  renderMessages()

  // 输入框清空 & 禁用
  const input = document.getElementById('evo-chat-input')
  input.value = ''
  input.focus()

  // Echo 思考中
  showTyping()
  const delay = 600 + Math.random() * 700
  setTimeout(() => {
    hideTyping()
    const reply = matchReply(text)
    conversation.push({ role: 'echo', html: reply.html, sources: reply.sources })
    renderMessages()
  }, delay)
}

// ------------------------------------------------------------
// 关键词匹配回复
// ------------------------------------------------------------
function matchReply(text) {
  const lower = text.toLowerCase()
  for (const item of ECHO_REPLIES) {
    if (item.matches.some((kw) => lower.includes(kw.toLowerCase()))) {
      return { html: item.reply, sources: item.sources || [] }
    }
  }
  return { html: ECHO_FALLBACK_REPLY, sources: [] }
}

// ------------------------------------------------------------
// 渲染左侧栏（对话历史 + 知识库）
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

  aside.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <h2 class="evo-title text-lg">对话</h2>
      <button id="evo-new-chat" class="text-xs px-3 py-1.5 rounded-[var(--evo-radius-md)] border border-[var(--evo-border)] hover:bg-[var(--evo-surface-2)] transition-colors">+ 新建对话</button>
    </div>
    <div class="space-y-2">${historyHtml}</div>
    <div class="mt-6 pt-6 border-t border-[var(--evo-border)]">
      <div class="text-xs text-[var(--evo-ink-3)] mb-2">知识库</div>
      <div class="flex flex-wrap gap-2">
        <span class="px-2 py-1 rounded-[var(--evo-radius-sm)] bg-[var(--evo-purple-500)]/20 text-[var(--evo-purple-300)] text-xs">128 篇文章</span>
        <span class="px-2 py-1 rounded-[var(--evo-radius-sm)] bg-[var(--evo-cyan)]/20 text-[var(--evo-cyan)] text-xs">36 个项目</span>
      </div>
    </div>
  `

  // 新建对话
  aside.querySelector('#evo-new-chat').addEventListener('click', newChat)
  // 历史切换
  aside.querySelectorAll('[data-history-id]').forEach((btn) => {
    btn.addEventListener('click', () => selectHistory(btn.dataset.historyId))
  })
}

// ------------------------------------------------------------
// 新建对话：重置为只含问候
// ------------------------------------------------------------
function newChat() {
  conversation = [
    {
      role: 'echo',
      html: `<p class="text-[var(--evo-ink)]">新对话已开启。我是 Echo，可以回答关于她的作品、文章、技术栈和创作思考。你想从哪里开始？</p>`
    }
  ]
  CHAT_HISTORY.forEach((h) => (h.active = false))
  renderAside()
  renderMessages()
  closeMobileAside()
}

// ------------------------------------------------------------
// 历史切换（模拟：载入对应上下文）
// ------------------------------------------------------------
function selectHistory(id) {
  CHAT_HISTORY.forEach((h) => (h.active = h.id === id))
  const target = CHAT_HISTORY.find((h) => h.id === id)
  if (!target) return

  // 第一条保留初始丰富对话；其它历史载入问候 + 一条上下文消息
  if (id === 'c1') {
    conversation = INITIAL_CONVERSATION.map((m) => ({ ...m }))
  } else {
    conversation = [
      {
        role: 'echo',
        html: `<p class="text-[var(--evo-ink)]">已切换到「${target.title}」。这条历史里我们聊到了相关内容，你可以继续追问，或者开始新的话题。</p>`
      }
    ]
  }
  renderAside()
  renderMessages()
  closeMobileAside()
}

// ------------------------------------------------------------
// 移动端侧栏切换
// ------------------------------------------------------------
function setupMobileAside() {
  const btn = document.getElementById('evo-chat-history-btn')
  const aside = document.getElementById('evo-chat-aside')
  const overlay = document.getElementById('evo-chat-overlay')
  if (!btn || !aside || !overlay) return

  // 把 aside 改造为移动端浮层（仅 lg 以下生效）
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
  // 暴露给历史切换使用
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
// 初始化
// ------------------------------------------------------------
function init() {
  conversation = INITIAL_CONVERSATION.map((m) => ({ ...m }))
  renderAside()
  renderQuickPrompts()
  renderMessages()
  setupForm()
  setupMobileAside()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
