// ============================================================
// 精选合集 garden.js
// 数据来源：飞书多维表格「合集」表
// 展示所有合集卡片，点击跳转到文章页合集详情
// ============================================================

import { fetchCollections } from '../feishu.js'
import { bindTiltEffect } from '../effects.js'

let collections = []

// 合集角标
function collectionBadgeHtml(c) {
  if (!c.isPaid || !c.price) {
    return '<span class="px-2 py-1 rounded-[var(--evo-radius-sm)] bg-[var(--evo-cyan)]/15 text-[var(--evo-cyan)] text-[11px]">免费合集</span>'
  }
  const priceText = (Number(c.price) % 1 === 0) ? String(c.price) : Number(c.price).toFixed(2)
  return `<span class="px-2 py-1 rounded-[var(--evo-radius-sm)] bg-gradient-to-r from-[var(--evo-pink)]/20 to-[var(--evo-purple-500)]/20 text-white text-[11px] font-semibold border border-[var(--evo-pink)]/40 tracking-wide">付费合集 ¥${priceText}</span>`
}

// 渲染单个合集卡片
function collectionCard(c, index) {
  const coverHtml = c.coverImage
    ? `<div class="aspect-[16/9] overflow-hidden rounded-t-[var(--evo-radius-lg)]"><img src="${c.coverImage}" alt="${c.title}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" /></div>`
    : `<div class="aspect-[16/9] rounded-t-[var(--evo-radius-lg)] bg-gradient-to-br from-[var(--evo-purple-700)]/40 to-[var(--evo-cyan)]/20 flex items-center justify-center"><span class="text-3xl opacity-50">📚</span></div>`
  const articleCount = c.articleIds?.length || c.articleCount || 0
  return `
    <article class="evo-glass evo-tilt-card evo-glow-card evo-filter-item rounded-[var(--evo-radius-lg)] overflow-hidden hover:bg-[var(--evo-surface-2)] hover:border-[var(--evo-purple-400)]/40 transition-all cursor-pointer evo-reveal group relative flex flex-col" data-reveal-delay="${Math.min(index * 80, 400)}" style="animation-delay:${Math.min(index * 60, 360)}ms" data-collection-id="${c.id || ''}">
      <div class="evo-tilt-inner flex flex-col flex-1">
      ${coverHtml}
      <div class="p-4 md:p-5 flex-1 flex flex-col">
        <div class="flex flex-wrap items-center gap-2 mb-3">
          ${collectionBadgeHtml(c)}
          ${articleCount ? `<span class="text-xs text-[var(--evo-ink-3)]">${articleCount} 篇文章</span>` : ''}
        </div>
        <h2 class="evo-title text-base sm:text-lg mb-2 line-clamp-2">${c.title || '未命名合集'}</h2>
        <p class="text-sm text-[var(--evo-ink-2)] leading-relaxed line-clamp-3 flex-1">${c.desc || '（暂无简介）'}</p>
        <div class="mt-3 pt-3 border-t border-[var(--evo-border)] flex items-center justify-between text-xs text-[var(--evo-ink-3)]">
          <span>${c.isPaid && c.price ? '需付费' : '免费'}</span>
          <span class="text-[var(--evo-purple-300)] opacity-60 group-hover:opacity-100 transition-opacity">查看 →</span>
        </div>
      </div>
      </div>
    </article>`
}

// 渲染统计栏
function renderStats() {
  const box = document.getElementById('evo-collections-stats')
  if (!box) return
  const total = collections.length
  const paid = collections.filter((c) => c.isPaid && c.price).length
  const free = total - paid
  const totalArticles = collections.reduce((sum, c) => sum + (c.articleIds?.length || c.articleCount || 0), 0)

  if (!total) {
    box.innerHTML = ''
    return
  }
  box.innerHTML = `
    <div class="evo-glass rounded-[var(--evo-radius-md)] px-4 py-2 text-sm">
      <span class="text-[var(--evo-ink-3)]">合集</span>
      <span class="ml-1.5 text-[var(--evo-ink)] font-semibold">${total}</span>
    </div>
    <div class="evo-glass rounded-[var(--evo-radius-md)] px-4 py-2 text-sm">
      <span class="text-[var(--evo-ink-3)]">文章</span>
      <span class="ml-1.5 text-[var(--evo-ink)] font-semibold">${totalArticles}</span>
    </div>
    <div class="evo-glass rounded-[var(--evo-radius-md)] px-4 py-2 text-sm">
      <span class="text-[var(--evo-cyan)]">免费</span>
      <span class="ml-1.5 text-[var(--evo-ink)] font-semibold">${free}</span>
    </div>
    <div class="evo-glass rounded-[var(--evo-radius-md)] px-4 py-2 text-sm">
      <span class="text-[var(--evo-pink)]">付费</span>
      <span class="ml-1.5 text-[var(--evo-ink)] font-semibold">${paid}</span>
    </div>
  `
}

// 渲染合集列表
function renderCollections() {
  const box = document.getElementById('evo-collections-list')
  const subtitle = document.getElementById('evo-collections-subtitle')
  if (!box) return

  if (!collections.length) {
    box.innerHTML = `
      <div class="col-span-full evo-glass rounded-[var(--evo-radius-lg)] p-8 md:p-12 text-center evo-reveal">
        <div class="text-5xl mb-4">📚</div>
        <h3 class="evo-title text-xl mb-3">还没有合集</h3>
        <p class="text-[var(--evo-ink-2)] text-sm leading-relaxed max-w-md mx-auto">
          在飞书多维表格的「合集」表里添加合集行，并关联文章，这里就会自动显示。
        </p>
      </div>
    `
    if (subtitle) subtitle.textContent = '暂无合集内容'
    if (window.EchoVerse?.refreshReveal) window.EchoVerse.refreshReveal()
    return
  }

  if (subtitle) subtitle.textContent = `${collections.length} 个合集，每个合集独立定价`

  box.innerHTML = collections.map((c, i) => collectionCard(c, i)).join('')

  // 点击合集卡片 → 跳转文章页合集详情
  box.querySelectorAll('[data-collection-id]').forEach((card) => {
    card.addEventListener('click', () => {
      const id = card.dataset.collectionId
      if (id) {
        window.location.href = `articles.html#collection=${id}`
      }
    })
  })

  // 绑定 3D 倾斜效果
  box.querySelectorAll('.evo-tilt-card').forEach((card) => bindTiltEffect(card))

  if (window.EchoVerse?.refreshReveal) window.EchoVerse.refreshReveal()
}

// 数据加载
async function loadData() {
  const data = await fetchCollections().catch(() => null)
  if (data && data.length) {
    collections = data
  } else {
    collections = []
  }
}

async function init() {
  const box = document.getElementById('evo-collections-list')
  if (box) box.innerHTML = Array.from({ length: 6 }, () => `
    <div class="evo-glass rounded-[var(--evo-radius-lg)] overflow-hidden flex flex-col">
      <div class="evo-skeleton evo-skeleton-cover"></div>
      <div class="p-4 md:p-5 flex flex-col gap-3">
        <div class="flex gap-2">
          <div class="evo-skeleton evo-skeleton-badge"></div>
          <div class="evo-skeleton evo-skeleton-badge" style="width:40px"></div>
        </div>
        <div class="evo-skeleton evo-skeleton-title"></div>
        <div class="evo-skeleton evo-skeleton-line" style="width:100%"></div>
        <div class="evo-skeleton evo-skeleton-line" style="width:80%"></div>
        <div class="evo-skeleton evo-skeleton-line" style="width:60%"></div>
      </div>
    </div>`).join('')

  await loadData()
  renderStats()
  renderCollections()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
