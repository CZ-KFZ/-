// ============================================================
// EchoVerse · 全局搜索组件 search.js
// 功能：header 搜索图标 → 弹出全屏搜索弹窗 → 实时搜索文章/作品/合集
// 数据来源：飞书 Base（articles + projects + collections）
// 快捷键：Cmd/Ctrl + K 唤起，ESC 关闭
// ============================================================

import { fetchFeishuMulti, fetchProjects } from './feishu.js'

// 搜索索引
let searchIndex = {
  articles: [],
  projects: [],
  collections: []
}
let loaded = false
let debounceTimer = null

// ------------------------------------------------------------
// 加载搜索数据（首次唤起时加载，带缓存）
// ------------------------------------------------------------
async function loadSearchData() {
  if (loaded) return

  try {
    // 拉文章 + 合集（一次请求）
    const multi = await fetchFeishuMulti(['articles', 'collections'])
    if (multi.articles) {
      searchIndex.articles = multi.articles.map((a) => ({
        id: a.id || a.record_id,
        title: a.title || '',
        desc: a.excerpt || a.summary || '',
        category: a.categoryLabel || a.category || '',
        isPaid: a.isPaid || false,
        price: a.price || 0,
        hidden: a.hidden || false,
        type: 'article'
      })).filter((a) => a.title && !a.hidden)
    }
    if (multi.collections) {
      searchIndex.collections = multi.collections.map((c) => ({
        id: c.id || c.record_id,
        title: c.title || '',
        desc: c.desc || c.description || '',
        isPaid: c.isPaid || false,
        price: c.price || 0,
        articleCount: c.articleIds?.length || c.articleCount || 0,
        type: 'collection'
      })).filter((c) => c.title)
    }

    // 拉作品集
    const projects = await fetchProjects()
    if (projects) {
      searchIndex.projects = projects.map((p) => ({
        id: p.id,
        title: p.title || '',
        desc: p.desc || '',
        category: p.categoryLabel || p.category || '',
        year: p.year || '',
        type: 'project'
      })).filter((p) => p.title)
    }

    loaded = true
  } catch (err) {
    console.warn('[EchoVerse] 搜索数据加载失败：', err.message)
  }
}

// ------------------------------------------------------------
// 执行搜索
// ------------------------------------------------------------
function doSearch(query) {
  const q = query.trim().toLowerCase()
  if (!q) return { articles: [], projects: [], collections: [] }

  const match = (text) => (text || '').toLowerCase().includes(q)

  return {
    articles: searchIndex.articles.filter((a) =>
      match(a.title) || match(a.desc) || match(a.category)
    ).slice(0, 5),
    projects: searchIndex.projects.filter((p) =>
      match(p.title) || match(p.desc) || match(p.category) || match(p.year)
    ).slice(0, 5),
    collections: searchIndex.collections.filter((c) =>
      match(c.title) || match(c.desc)
    ).slice(0, 3)
  }
}

// ------------------------------------------------------------
// 结果项 HTML
// ------------------------------------------------------------
function resultIcon(type) {
  if (type === 'article') return '📝'
  if (type === 'project') return '🎨'
  if (type === 'collection') return '📚'
  return '🔍'
}

function paidBadge(item) {
  if (item.type === 'collection') {
    return item.isPaid && item.price
      ? `<span class="text-[10px] px-1.5 py-0.5 rounded bg-[var(--evo-pink)]/20 text-[var(--evo-pink)]">¥${item.price}</span>`
      : '<span class="text-[10px] px-1.5 py-0.5 rounded bg-[var(--evo-cyan)]/15 text-[var(--evo-cyan)]">免费</span>'
  }
  if (item.type === 'article') {
    return item.isPaid
      ? `<span class="text-[10px] px-1.5 py-0.5 rounded bg-[var(--evo-pink)]/20 text-[var(--evo-pink)]">付费</span>`
      : ''
  }
  return ''
}

function resultLink(item) {
  if (item.type === 'article') return `articles.html#article=${item.id}`
  if (item.type === 'project') return `portfolio.html#project=${item.id}`
  if (item.type === 'collection') return `articles.html#collection=${item.id}`
  return '#'
}

function renderResults(results) {
  const container = document.getElementById('evo-global-search-results')
  if (!container) return

  const total = results.articles.length + results.projects.length + results.collections.length
  if (!total) {
    container.innerHTML = `
      <div class="text-center py-12 text-[var(--evo-ink-3)] text-sm">
        <div class="text-3xl mb-3 opacity-50">🔍</div>
        <p>没有找到相关内容</p>
      </div>
    `
    return
  }

  let html = ''

  if (results.articles.length) {
    html += `
      <div class="mb-4">
        <div class="text-xs text-[var(--evo-ink-3)] uppercase tracking-wider mb-2 px-1">文章</div>
        ${results.articles.map((a) => `
          <a href="${resultLink(a)}" class="evo-search-item flex items-center gap-3 px-3 py-2.5 rounded-[var(--evo-radius-md)] hover:bg-[var(--evo-surface-2)] transition-colors group">
            <span class="text-base shrink-0">${resultIcon(a.type)}</span>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-sm text-[var(--evo-ink)] group-hover:text-[var(--evo-cyan)] transition-colors truncate">${a.title}</span>
                ${paidBadge(a)}
              </div>
              ${a.desc ? `<div class="text-xs text-[var(--evo-ink-3)] truncate mt-0.5">${a.desc}</div>` : ''}
            </div>
            ${a.category ? `<span class="text-[10px] px-1.5 py-0.5 rounded bg-[var(--evo-surface-2)] text-[var(--evo-ink-3)] shrink-0">${a.category}</span>` : ''}
          </a>
        `).join('')}
      </div>
    `
  }

  if (results.projects.length) {
    html += `
      <div class="mb-4">
        <div class="text-xs text-[var(--evo-ink-3)] uppercase tracking-wider mb-2 px-1">作品</div>
        ${results.projects.map((p) => `
          <a href="${resultLink(p)}" class="evo-search-item flex items-center gap-3 px-3 py-2.5 rounded-[var(--evo-radius-md)] hover:bg-[var(--evo-surface-2)] transition-colors group">
            <span class="text-base shrink-0">${resultIcon(p.type)}</span>
            <div class="flex-1 min-w-0">
              <span class="text-sm text-[var(--evo-ink)] group-hover:text-[var(--evo-cyan)] transition-colors truncate block">${p.title}</span>
              ${p.desc ? `<div class="text-xs text-[var(--evo-ink-3)] truncate mt-0.5">${p.desc}</div>` : ''}
            </div>
            ${p.category ? `<span class="text-[10px] px-1.5 py-0.5 rounded bg-[var(--evo-surface-2)] text-[var(--evo-ink-3)] shrink-0">${p.category}</span>` : ''}
          </a>
        `).join('')}
      </div>
    `
  }

  if (results.collections.length) {
    html += `
      <div>
        <div class="text-xs text-[var(--evo-ink-3)] uppercase tracking-wider mb-2 px-1">合集</div>
        ${results.collections.map((c) => `
          <a href="${resultLink(c)}" class="evo-search-item flex items-center gap-3 px-3 py-2.5 rounded-[var(--evo-radius-md)] hover:bg-[var(--evo-surface-2)] transition-colors group">
            <span class="text-base shrink-0">${resultIcon(c.type)}</span>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-sm text-[var(--evo-ink)] group-hover:text-[var(--evo-cyan)] transition-colors truncate">${c.title}</span>
                ${paidBadge(c)}
              </div>
              ${c.desc ? `<div class="text-xs text-[var(--evo-ink-3)] truncate mt-0.5">${c.desc}</div>` : ''}
            </div>
            ${c.articleCount ? `<span class="text-[10px] text-[var(--evo-ink-3)] shrink-0">${c.articleCount} 篇</span>` : ''}
          </a>
        `).join('')}
      </div>
    `
  }

  container.innerHTML = html
}

// ------------------------------------------------------------
// 打开 / 关闭搜索弹窗
// ------------------------------------------------------------
async function openSearch() {
  const modal = document.getElementById('evo-global-search-modal')
  if (!modal) return

  modal.classList.remove('hidden')
  modal.classList.add('flex')
  document.body.style.overflow = 'hidden'

  const input = document.getElementById('evo-global-search-input')
  if (input) {
    input.value = ''
    setTimeout(() => input.focus(), 50)
  }

  // 首次打开时加载数据
  if (!loaded) {
    const loading = document.getElementById('evo-global-search-loading')
    if (loading) loading.classList.remove('hidden')
    await loadSearchData()
    if (loading) loading.classList.add('hidden')
  }

  // 清空结果
  const results = document.getElementById('evo-global-search-results')
  const empty = document.getElementById('evo-global-search-empty')
  if (results) results.innerHTML = ''
  if (empty) empty.classList.remove('hidden')
}

function closeSearch() {
  const modal = document.getElementById('evo-global-search-modal')
  if (!modal) return

  modal.classList.add('hidden')
  modal.classList.remove('flex')
  document.body.style.overflow = ''
}

// ------------------------------------------------------------
// 初始化全局搜索
// ------------------------------------------------------------
export function initGlobalSearch() {
  // 防止重复初始化
  if (document.getElementById('evo-global-search-modal')) {
    // 绑定 header 按钮点击
    const btn = document.getElementById('evo-search-trigger')
    if (btn && !btn.dataset.bound) {
      btn.addEventListener('click', openSearch)
      btn.dataset.bound = '1'
    }
    return
  }

  // 注入弹窗 DOM
  const modal = document.createElement('div')
  modal.id = 'evo-global-search-modal'
  modal.className = 'hidden fixed inset-0 z-[120] items-start justify-center pt-[10vh] px-4 bg-black/70 backdrop-blur-sm'
  modal.innerHTML = `
    <div class="evo-glass-strong w-full max-w-2xl rounded-[var(--evo-radius-lg)] border border-[var(--evo-border-glow)] overflow-hidden shadow-2xl" onclick="event.stopPropagation()">
      <!-- 搜索栏 -->
      <div class="flex items-center gap-3 px-4 py-3 border-b border-[var(--evo-border)]">
        <svg class="text-[var(--evo-ink-3)] shrink-0" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input id="evo-global-search-input" type="text" placeholder="搜索文章、作品、合集…" class="flex-1 bg-transparent border-0 outline-none text-[var(--evo-ink)] placeholder:text-[var(--evo-ink-3)] text-base" autocomplete="off" />
        <button id="evo-global-search-close" class="text-xs text-[var(--evo-ink-3)] hover:text-[var(--evo-ink)] px-2 py-1 rounded border border-[var(--evo-border)] hover:border-[var(--evo-purple-400)]/40 transition-colors shrink-0">ESC</button>
      </div>
      <!-- 结果区 -->
      <div class="max-h-[55vh] overflow-y-auto p-2">
        <div id="evo-global-search-empty" class="text-center py-12 text-[var(--evo-ink-3)] text-sm">
          <div class="text-3xl mb-3 opacity-50">⌨️</div>
          <p>输入关键词开始搜索</p>
          <p class="text-xs mt-1 opacity-60">文章 · 作品 · 合集</p>
        </div>
        <div id="evo-global-search-loading" class="hidden text-center py-12 text-[var(--evo-ink-3)] text-sm">
          <div class="evo-skeleton evo-skeleton-line mx-auto" style="width:120px"></div>
          <p class="mt-3">正在加载搜索数据…</p>
        </div>
        <div id="evo-global-search-results"></div>
      </div>
    </div>
  `
  document.body.appendChild(modal)

  // 点击遮罩关闭
  modal.addEventListener('click', closeSearch)

  // 关闭按钮
  const closeBtn = document.getElementById('evo-global-search-close')
  if (closeBtn) closeBtn.addEventListener('click', closeSearch)

  // 输入搜索
  const input = document.getElementById('evo-global-search-input')
  if (input) {
    input.addEventListener('input', (e) => {
      const val = e.target.value
      const empty = document.getElementById('evo-global-search-empty')
      const results = document.getElementById('evo-global-search-results')

      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        if (!val.trim()) {
          if (results) results.innerHTML = ''
          if (empty) empty.classList.remove('hidden')
          return
        }
        if (empty) empty.classList.add('hidden')
        renderResults(doSearch(val))
      }, 200)
    })
  }

  // ESC 关闭
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSearch()
    // Cmd/Ctrl + K 唤起
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      openSearch()
    }
  })

  // 绑定 header 按钮
  const btn = document.getElementById('evo-search-trigger')
  if (btn) btn.addEventListener('click', openSearch)
}
