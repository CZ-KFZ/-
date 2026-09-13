// ============================================================
// 作品集 portfolio.js（CMS 版）
// 数据源：优先飞书多维表格；为空或未配置时回退到 data.js
// 功能：分类筛选 + 搜索 + 3D 倾斜卡片 + 详情弹窗 + 筛选动画 + 滚动渐入
// 轮播已移至首页
// ============================================================

import { fetchProjects } from '../feishu.js'
import { PROJECTS as MOCK_PROJECTS, PROJECT_FILTERS } from '../data.js'
import { TAG_TONE, ACCENT_GRADIENT, openProjectModal } from '../project-ui.js'
import { bindTiltEffect } from '../effects.js'

let currentFilter = 'all'
let projects = []
let searchQuery = ''

function renderFilters() {
  const bar = document.getElementById('evo-portfolio-filters')
  if (!bar) return
  // 统计每个分类下的作品数（用于角标显示）
  const countFor = (key) => {
    if (key === 'all') return projects.length
    return projects.filter((p) => (p.tags || []).includes(key) || (p.category || '') === key).length
  }
  bar.innerHTML = PROJECT_FILTERS.map((f) => {
    const isActive = f.key === currentFilter
    const count = countFor(f.key)
    const base = 'relative px-4 py-2 rounded-full text-sm font-medium transition-all inline-flex items-center gap-1.5'
    const activeCls =
      'bg-gradient-to-r from-[var(--evo-purple-500)] to-[var(--evo-cyan)] text-white shadow-[0_0_20px_rgba(168,85,247,0.45),0_4px_14px_rgba(6,182,212,0.25)] border border-[var(--evo-purple-300)]/40'
    const idleCls =
      'border border-[var(--evo-border)] text-[var(--evo-ink-2)] hover:text-[var(--evo-ink)] hover:border-[var(--evo-purple-400)]/60 hover:bg-[var(--evo-surface-2)]/50'
    const badgeCls = isActive
      ? 'ml-0.5 px-1.5 py-0.5 rounded-full bg-white/25 text-[10px] leading-none'
      : 'ml-0.5 px-1.5 py-0.5 rounded-full bg-[var(--evo-surface-2)]/60 text-[var(--evo-ink-3)] text-[10px] leading-none'
    return `
      <button data-filter="${f.key}" class="${base} ${isActive ? activeCls : idleCls}">
        <span>${f.label}</span>
        <span class="${badgeCls}">${count}</span>
      </button>`
  }).join('')

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

  const cover = p.coverImage
    ? `<div class="h-40 sm:h-48 overflow-hidden bg-gradient-to-br ${gradient}"><img src="${p.coverImage}" alt="${p.title}" class="w-full h-full object-cover" loading="lazy" /></div>`
    : `<div class="h-40 sm:h-48 bg-gradient-to-br ${gradient} flex items-center justify-center p-4"><span class="evo-title text-xl sm:text-2xl text-white/90 text-center">${p.title}</span></div>`

  const videoBadge = p.video ? `<span class="px-2 py-1 rounded-[var(--evo-radius-sm)] bg-[var(--evo-pink)]/20 text-[var(--evo-pink)] text-xs">▶ 视频</span>` : ''

  return `
    <article class="group evo-glass evo-tilt-card evo-glow-card evo-filter-item rounded-[var(--evo-radius-lg)] overflow-hidden hover:bg-[var(--evo-surface-2)] transition-all hover:-translate-y-1 cursor-pointer evo-reveal" style="animation-delay:${Math.min(index * 60, 360)}ms" data-reveal-delay="${Math.min(index * 80, 400)}" data-project-id="${p.id}">
      <div class="evo-tilt-inner">
      ${cover}
      <div class="p-5 sm:p-6">
        <div class="flex items-center gap-2 mb-3 flex-wrap">
          <span class="px-2 py-1 rounded-[var(--evo-radius-sm)] ${toneCls} text-xs">${p.categoryLabel || p.category}</span>
          ${videoBadge}
          <span class="text-xs text-[var(--evo-ink-3)]">${p.year || ''}</span>
        </div>
        <h3 class="evo-title text-lg sm:text-xl mb-2">${p.title}</h3>
        <p class="text-sm text-[var(--evo-ink-2)] leading-relaxed">${p.desc || ''}</p>
        ${p.demoUrl ? `<div class="inline-flex items-center gap-1 mt-3 text-sm text-[var(--evo-purple-300)] hover:text-[var(--evo-purple-200)] transition-colors">访问链接 →</div>` : ''}
      </div>
      </div>
    </article>`
}

function renderGrid() {
  const grid = document.getElementById('evo-portfolio-grid')
  const empty = document.getElementById('evo-portfolio-empty')
  if (!grid) return

  // 1. 分类筛选
  let list = currentFilter === 'all'
    ? projects
    : projects.filter((p) => {
        if (p.category === currentFilter) return true
        const f = PROJECT_FILTERS.find((x) => x.key === currentFilter)
        if (f && (p.categoryLabel === f.label || p.category === f.label)) return true
        return false
      })

  // 2. 关键词搜索（标题、简介、分类、年份）
  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase()
    list = list.filter((p) =>
      (p.title || '').toLowerCase().includes(q) ||
      (p.desc || '').toLowerCase().includes(q) ||
      (p.categoryLabel || '').toLowerCase().includes(q) ||
      (p.category || '').toLowerCase().includes(q) ||
      String(p.year || '').includes(q)
    )
  }

  if (!list.length) {
    grid.innerHTML = ''
    grid.classList.add('hidden')
    empty.classList.remove('hidden')
    empty.querySelector('p:last-child').textContent = searchQuery
      ? `没有找到「${searchQuery}」相关的作品。`
      : '这个分类下还没有作品。'
    return
  }
  grid.classList.remove('hidden')
  empty.classList.add('hidden')
  grid.innerHTML = list.map((p, i) => projectCard(p, i)).join('')

  grid.querySelectorAll('[data-project-id]').forEach((card) => {
    card.addEventListener('click', () => {
      const id = card.dataset.projectId
      const project = projects.find((p) => p.id === id)
      if (project) openProjectModal(project)
    })
    bindTiltEffect(card)
  })

  if (window.EchoVerse && window.EchoVerse.refreshReveal) window.EchoVerse.refreshReveal()
}

// 加载数据：飞书优先 → fallback
async function loadData() {
  const raw = await fetchProjects()
  if (raw && raw.length) {
    projects = raw
    return
  }
  projects = MOCK_PROJECTS.map((p) => ({ ...p, coverImage: null, video: null, demoUrl: null }))
}

async function init() {
  renderFilters()
  // 页面级搜索已统一走 header 全局搜索（evo-search-trigger）
  // searchQuery 状态保留：用于 header 全局搜索跳转后渲染结果
  const grid = document.getElementById('evo-portfolio-grid')
  if (grid) grid.innerHTML = Array.from({ length: 6 }, () => `
    <div class="evo-glass rounded-[var(--evo-radius-lg)] overflow-hidden flex flex-col">
      <div class="evo-skeleton h-40 sm:h-48"></div>
      <div class="p-5 sm:p-5 flex flex-col gap-3">
        <div class="flex gap-2">
          <div class="evo-skeleton evo-skeleton-badge"></div>
          <div class="evo-skeleton evo-skeleton-badge" style="width:36px"></div>
        </div>
        <div class="evo-skeleton evo-skeleton-title"></div>
        <div class="evo-skeleton evo-skeleton-line" style="width:100%"></div>
        <div class="evo-skeleton evo-skeleton-line" style="width:70%"></div>
      </div>
    </div>`).join('')
  await loadData()
  renderFilters() // 数据加载后重新渲染筛选条，刷新分类角标的数量
  renderGrid()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
