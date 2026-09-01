// ============================================================
// 作品集 portfolio.js（CMS 版）
// 数据源：优先飞书多维表格；为空或未配置时回退到 data.js
// 同时支持上传封面图（替换原渐变封面）和项目视频
// ============================================================

import { fetchProjects } from '../feishu.js'
import { PROJECTS as MOCK_PROJECTS, PROJECT_FILTERS } from '../data.js'

let currentFilter = 'all'
let projects = []

// 标签配色
const TAG_TONE = {
  purple: 'bg-[var(--evo-purple-500)]/20 text-[var(--evo-purple-300)]',
  cyan: 'bg-[var(--evo-cyan)]/20 text-[var(--evo-cyan)]',
  pink: 'bg-[var(--evo-pink)]/20 text-[var(--evo-pink)]',
  violet: 'bg-[var(--evo-violet)]/30 text-[var(--evo-violet)]'
}

// 封面渐变（accent → 渐变 class），无上传封面时使用
const ACCENT_GRADIENT = {
  purple: 'from-[var(--evo-purple-700)] to-[var(--evo-cyan)]/30',
  cyan: 'from-[var(--evo-cyan)]/40 to-[var(--evo-purple-700)]',
  pink: 'from-[var(--evo-pink)]/40 to-[var(--evo-violet)]/40',
  violet: 'from-[var(--evo-violet)]/50 to-[var(--evo-pink)]/30'
}

function renderFilters() {
  const bar = document.getElementById('evo-portfolio-filters')
  if (!bar) return
  bar.innerHTML = PROJECT_FILTERS.map(
    (f) => `
      <button data-filter="${f.key}" class="px-4 py-2 rounded-full text-sm transition-all ${
        f.key === currentFilter
          ? 'bg-[var(--evo-primary)] text-white'
          : 'border border-[var(--evo-border)] text-[var(--evo-ink-2)] hover:text-[var(--evo-ink)] hover:border-[var(--evo-purple-400)]'
      }">${f.label}</button>`
  ).join('')

  bar.querySelectorAll('[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.filter
      if (key === currentFilter) return
      currentFilter = key
      renderFilters()
      renderGrid()
    })
  })
}

function projectCard(p, index) {
  const toneCls = TAG_TONE[p.accent] || TAG_TONE.purple
  const gradient = ACCENT_GRADIENT[p.accent] || ACCENT_GRADIENT.purple

  // 封面：上传图优先，否则渐变
  const cover = p.coverImage
    ? `<div class="h-40 sm:h-48 overflow-hidden bg-gradient-to-br ${gradient}"><img src="${p.coverImage}" alt="${p.title}" class="w-full h-full object-cover" loading="lazy" /></div>`
    : `<div class="h-40 sm:h-48 bg-gradient-to-br ${gradient} flex items-center justify-center p-4"><span class="evo-title text-xl sm:text-2xl text-white/90 text-center">${p.title}</span></div>`

  // 视频徽标
  const videoBadge = p.video ? `<span class="px-2 py-1 rounded-[var(--evo-radius-sm)] bg-[var(--evo-pink)]/20 text-[var(--evo-pink)] text-xs">▶ 视频</span>` : ''

  return `
    <article class="group evo-glass rounded-[var(--evo-radius-lg)] overflow-hidden hover:bg-[var(--evo-surface-2)] transition-all hover:-translate-y-1 cursor-pointer evo-reveal" data-reveal-delay="${Math.min(index * 80, 400)}" data-project-id="${p.id}">
      ${cover}
      <div class="p-5 sm:p-6">
        <div class="flex items-center gap-2 mb-3 flex-wrap">
          <span class="px-2 py-1 rounded-[var(--evo-radius-sm)] ${toneCls} text-xs">${p.categoryLabel}</span>
          ${videoBadge}
          <span class="text-xs text-[var(--evo-ink-3)]">${p.year}</span>
        </div>
        <h3 class="evo-title text-lg sm:text-xl mb-2">${p.title}</h3>
        <p class="text-sm text-[var(--evo-ink-2)] leading-relaxed">${p.desc}</p>
        ${p.demoUrl ? `<div class="inline-flex items-center gap-1 mt-3 text-sm text-[var(--evo-purple-300)] hover:text-[var(--evo-purple-200)] transition-colors">访问链接 →</div>` : ''}
      </div>
    </article>`
}

// 作品集详情弹窗
function openProjectModal(project) {
  const existing = document.getElementById('evo-project-modal')
  if (existing) existing.remove()

  const gradient = ACCENT_GRADIENT[project.accent] || ACCENT_GRADIENT.purple
  const coverHtml = project.coverImage
    ? `<div class="mb-6 rounded-[var(--evo-radius-md)] overflow-hidden aspect-[16/9]"><img src="${project.coverImage}" alt="${project.title}" class="w-full h-full object-cover" /></div>`
    : `<div class="mb-6 rounded-[var(--evo-radius-md)] h-48 sm:h-64 bg-gradient-to-br ${gradient} flex items-center justify-center p-4"><span class="evo-title text-2xl sm:text-3xl text-white/90 text-center">${project.title}</span></div>`
  const toneCls = TAG_TONE[project.accent] || TAG_TONE.purple
  const videoHtml = project.video
    ? `<div class="mb-6 rounded-[var(--evo-radius-md)] overflow-hidden"><video src="${project.video}" controls class="w-full"></video></div>`
    : ''
  const linkHtml = project.demoUrl
    ? `<a href="${project.demoUrl}" target="_blank" rel="noopener" class="inline-flex items-center gap-2 px-6 py-3 rounded-[var(--evo-radius-md)] bg-gradient-to-r from-[var(--evo-purple-600)] to-[var(--evo-violet)] text-white hover:brightness-110 transition-all shadow-lg shadow-[var(--evo-purple-600)]/20">
         <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
         访问项目
       </a>`
    : `<p class="text-[var(--evo-ink-3)] italic text-sm">（还没填访问链接，去飞书作品集表的「访问链接」字段里填）</p>`

  const modal = document.createElement('div')
  modal.id = 'evo-project-modal'
  modal.className = 'fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm'
  modal.innerHTML = `
    <div class="evo-glass max-w-2xl w-full max-h-[85vh] overflow-y-auto rounded-[var(--evo-radius-lg)] p-6 md:p-10 relative" onclick="event.stopPropagation()">
      <button class="absolute top-4 right-4 w-9 h-9 rounded-full bg-[var(--evo-surface-2)] hover:bg-[var(--evo-purple-500)]/30 text-[var(--evo-ink-2)] hover:text-white transition-all flex items-center justify-center" id="evo-project-close" aria-label="关闭">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      ${coverHtml}
      <div class="flex flex-wrap items-center gap-2 mb-4">
        <span class="px-2 py-1 rounded-[var(--evo-radius-sm)] ${toneCls} text-xs">${project.categoryLabel}</span>
        <span class="text-xs text-[var(--evo-ink-3)]">${project.year}</span>
      </div>
      <h1 class="evo-title text-2xl sm:text-3xl mb-6">${project.title}</h1>
      <div class="text-[var(--evo-ink-2)] leading-loose mb-6 whitespace-pre-line">${project.desc || '暂无介绍'}</div>
      ${videoHtml}
      <div class="mt-6">
        ${linkHtml}
      </div>
    </div>
  `
  modal.addEventListener('click', () => modal.remove())
  modal.querySelector('#evo-project-close').addEventListener('click', () => modal.remove())
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      modal.remove()
      document.removeEventListener('keydown', escHandler)
    }
  }
  document.addEventListener('keydown', escHandler)
  document.body.appendChild(modal)
}

function renderGrid() {
  const grid = document.getElementById('evo-portfolio-grid')
  const empty = document.getElementById('evo-portfolio-empty')
  if (!grid) return

  const list = currentFilter === 'all' ? projects : projects.filter((p) => p.category === currentFilter)

  if (!list.length) {
    grid.innerHTML = ''
    grid.classList.add('hidden')
    empty.classList.remove('hidden')
    return
  }
  grid.classList.remove('hidden')
  empty.classList.add('hidden')
  grid.innerHTML = list.map((p, i) => projectCard(p, i)).join('')
  // 绑定点击事件：打开项目详情弹窗
  grid.querySelectorAll('[data-project-id]').forEach((card) => {
    card.addEventListener('click', () => {
      const id = card.dataset.projectId
      const project = projects.find((p) => p.id === id)
      if (project) openProjectModal(project)
    })
  })

  if (window.EchoVerse && window.EchoVerse.refreshReveal) window.EchoVerse.refreshReveal()
}

// ------------------------------------------------------------
// 加载数据：飞书优先 → fallback
// ------------------------------------------------------------
async function loadData() {
  const raw = await fetchProjects()
  if (raw && raw.length) {
    projects = raw
    return
  }
  // fallback：直接用 mock 数据
  projects = MOCK_PROJECTS.map((p) => ({ ...p, coverImage: null, video: null, demoUrl: null }))
}

async function init() {
  renderFilters()
  // 加载中占位
  const grid = document.getElementById('evo-portfolio-grid')
  if (grid) grid.innerHTML = '<div class="col-span-full text-center py-16 text-[var(--evo-ink-3)]">加载中…</div>'
  await loadData()
  renderGrid()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
