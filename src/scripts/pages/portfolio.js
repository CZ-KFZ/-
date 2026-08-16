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
    <article class="group evo-glass rounded-[var(--evo-radius-lg)] overflow-hidden hover:bg-[var(--evo-surface-2)] transition-all hover:-translate-y-1 cursor-pointer evo-reveal" data-reveal-delay="${Math.min(index * 80, 400)}">
      ${cover}
      <div class="p-5 sm:p-6">
        <div class="flex items-center gap-2 mb-3 flex-wrap">
          <span class="px-2 py-1 rounded-[var(--evo-radius-sm)] ${toneCls} text-xs">${p.categoryLabel}</span>
          ${videoBadge}
          <span class="text-xs text-[var(--evo-ink-3)]">${p.year}</span>
        </div>
        <h3 class="evo-title text-lg sm:text-xl mb-2">${p.title}</h3>
        <p class="text-sm text-[var(--evo-ink-2)] leading-relaxed">${p.desc}</p>
        ${p.demoUrl ? `<a href="${p.demoUrl}" target="_blank" rel="noopener" class="inline-flex items-center gap-1 mt-3 text-sm text-[var(--evo-purple-300)] hover:text-[var(--evo-purple-200)] transition-colors">访问 Demo →</a>` : ''}
      </div>
    </article>`
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
