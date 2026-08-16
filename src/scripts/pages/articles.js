// ============================================================
// 文章 articles.js（CMS 版）
// 数据源：优先飞书多维表格；为空或未配置时回退到 data.js
// 支持上传封面图
// ============================================================

import { fetchArticles } from '../feishu.js'
import { ARTICLES as MOCK_ARTICLES, ARTICLE_FILTERS } from '../data.js'

let currentFilter = 'all'
let articles = []

const CAT_TONE = {
  design: 'bg-[var(--evo-purple-500)]/20 text-[var(--evo-purple-300)]',
  tech: 'bg-[var(--evo-cyan)]/20 text-[var(--evo-cyan)]',
  life: 'bg-[var(--evo-pink)]/20 text-[var(--evo-pink)]',
  thought: 'bg-[var(--evo-violet)]/30 text-[var(--evo-violet)]'
}

function renderFilters() {
  const bar = document.getElementById('evo-articles-filters')
  if (!bar) return
  bar.innerHTML = ARTICLE_FILTERS.map(
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
      renderList()
    })
  })
}

function articleCard(a, index) {
  const toneCls = CAT_TONE[a.category] || CAT_TONE.design
  const coverHtml = a.coverImage
    ? `<div class="mb-4 rounded-[var(--evo-radius-md)] overflow-hidden aspect-[16/9]"><img src="${a.coverImage}" alt="${a.title}" class="w-full h-full object-cover" loading="lazy" /></div>`
    : ''
  return `
    <article class="evo-glass rounded-[var(--evo-radius-lg)] p-6 md:p-8 hover:bg-[var(--evo-surface-2)] transition-colors cursor-pointer evo-reveal group" data-reveal-delay="${Math.min(index * 80, 400)}">
      ${coverHtml}
      <div class="flex flex-wrap items-center gap-3 mb-4">
        <span class="px-2 py-1 rounded-[var(--evo-radius-sm)] ${toneCls} text-xs">${a.categoryLabel}</span>
        <span class="text-xs text-[var(--evo-ink-3)]">${a.date}</span>
        <span class="text-xs text-[var(--evo-ink-3)]">${a.readTime}</span>
      </div>
      <h2 class="evo-title text-xl sm:text-2xl mb-3">${a.title}</h2>
      <p class="text-[var(--evo-ink-2)] leading-relaxed">${a.excerpt}</p>
      <div class="mt-4 flex items-center gap-1 text-sm text-[var(--evo-purple-300)] opacity-0 group-hover:opacity-100 transition-opacity">阅读全文 →</div>
    </article>`
}

function renderList() {
  const list = document.getElementById('evo-articles-list')
  const empty = document.getElementById('evo-articles-empty')
  if (!list) return

  const items = currentFilter === 'all' ? articles : articles.filter((a) => a.category === currentFilter)
  if (!items.length) {
    list.innerHTML = ''
    list.classList.add('hidden')
    empty.classList.remove('hidden')
    return
  }
  list.classList.remove('hidden')
  empty.classList.add('hidden')
  list.innerHTML = items.map((a, i) => articleCard(a, i)).join('')
  if (window.EchoVerse && window.EchoVerse.refreshReveal) window.EchoVerse.refreshReveal()
}

async function loadData() {
  const raw = await fetchArticles()
  if (raw && raw.length) {
    articles = raw
    return
  }
  articles = MOCK_ARTICLES.map((a) => ({ ...a, coverImage: null }))
}

async function init() {
  renderFilters()
  const list = document.getElementById('evo-articles-list')
  if (list) list.innerHTML = '<div class="text-center py-16 text-[var(--evo-ink-3)]">加载中…</div>'
  await loadData()
  renderList()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
