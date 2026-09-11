// ============================================================
// 文章 articles.js（CMS + 付费版 · 三级层级）
// 数据源：优先飞书多维表格；为空或未配置时回退到 data.js
// 层级结构：
//   一级：文章页（展示 子栏目入口：免费/付费/合集）
//   二级：点子栏目 → 看文章列表（或合集列表）
//   三级：点文章 → 弹详情（付费文章含支付解锁流程）
// ============================================================

import { fetchArticles, fetchCollections, redeemCode } from '../feishu.js'
import { ARTICLES as MOCK_ARTICLES } from '../data.js'
import { parseMarkdown } from '../markdown.js'

// 当前视图：home 文章首页 / free 免费列表 / paid 付费列表 / collections 合集列表 / collection 单个合集详情 / search 搜索结果
let currentView = 'home'
let currentCollectionId = null
let collections = []
let articles = []
let searchQuery = ''
let searchDebounceTimer = null

const CAT_TONE = {
  '道': 'bg-[var(--evo-purple-500)]/20 text-[var(--evo-purple-300)]',
  '法': 'bg-[var(--evo-cyan)]/20 text-[var(--evo-cyan)]',
  '术': 'bg-[var(--evo-pink)]/20 text-[var(--evo-pink)]',
  '器': 'bg-[var(--evo-violet)]/30 text-[var(--evo-violet)]',
  '势': 'bg-[var(--evo-purple-700)]/20 text-[var(--evo-purple-400)]'
}

// 解锁记录 key：ev_unlocked_articles → Set<articleId>
const STORAGE_KEY = 'ev_unlocked_articles_v1'

function getUnlockedSet() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    return new Set(JSON.parse(raw))
  } catch (e) { return new Set() }
}
function markUnlocked(articleId) {
  if (!articleId) return
  const s = getUnlockedSet()
  s.add(String(articleId))
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...s])) } catch (e) {}
}
function isUnlocked(articleId) {
  if (!articleId) return false
  return getUnlockedSet().has(String(articleId))
}

// 付费角标
function paidBadgeHtml(a) {
  if (!a.isPaid || !a.price) {
    return '<span class="px-2 py-1 rounded-[var(--evo-radius-sm)] bg-[var(--evo-cyan)]/15 text-[var(--evo-cyan)] text-[11px]">免费</span>'
  }
  const priceText = (Number(a.price) % 1 === 0) ? String(a.price) : Number(a.price).toFixed(2)
  return `<span class="px-2 py-1 rounded-[var(--evo-radius-sm)] bg-gradient-to-r from-[var(--evo-pink)]/20 to-[var(--evo-purple-500)]/20 text-white text-[11px] font-semibold border border-[var(--evo-pink)]/40 tracking-wide">🔒 付费 ¥${priceText}</span>`
}

function articleCard(a, index) {
  const toneCls = CAT_TONE[a.category] || CAT_TONE['道']
  const coverHtml = a.coverImage
    ? `<div class="aspect-[16/9] overflow-hidden rounded-t-[var(--evo-radius-lg)]"><img src="${a.coverImage}" alt="${a.title}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" /></div>`
    : ''
  const unlocked = isUnlocked(a.id)
  const lockIcon = (a.isPaid && a.price && !unlocked) ? '<span class="ml-1">🔒</span>' : ''
  return `
    <article class="evo-glass rounded-[var(--evo-radius-lg)] overflow-hidden hover:bg-[var(--evo-surface-2)] hover:border-[var(--evo-purple-400)]/40 transition-all cursor-pointer evo-reveal group relative flex flex-col" data-reveal-delay="${Math.min(index * 80, 400)}" data-article-id="${a.id}">
      ${coverHtml}
      <div class="p-4 md:p-5 flex-1 flex flex-col">
        <div class="flex flex-wrap items-center gap-2 mb-3">
          <span class="px-1.5 py-0.5 rounded-[var(--evo-radius-sm)] ${toneCls} text-[11px]">${a.categoryLabel || a.category}</span>
          ${paidBadgeHtml(a)}
        </div>
        <h2 class="evo-title text-base sm:text-lg mb-2 line-clamp-2 flex items-start">${a.title}${lockIcon}</h2>
        <p class="text-sm text-[var(--evo-ink-2)] leading-relaxed line-clamp-3 flex-1">${a.excerpt || a.freeExcerpt || '（暂无摘要）'}</p>
        <div class="mt-3 pt-3 border-t border-[var(--evo-border)] flex items-center justify-between text-xs text-[var(--evo-ink-3)]">
          <span>${a.date}</span>
          ${unlocked
            ? '<span class="text-[var(--evo-cyan)]">✓ 已解锁</span>'
            : '<span class="text-[var(--evo-purple-300)] opacity-60 group-hover:opacity-100 transition-opacity">阅读 →</span>'
          }
        </div>
      </div>
    </article>`
}

// 把正文转成段落 HTML
// format=plain（默认）：按空行分段，段内换行 <br>，向后兼容
// format=markdown：调 parseMarkdown 渲染配图、加粗、引用、列表、代码块等
function textToParagraphs(text, format) {
  if (!text) return ''
  if (format === 'markdown') {
    return `<div class="prose-content evo-md text-[var(--evo-ink-2)] leading-loose space-y-4">${parseMarkdown(text)}</div>`
  }
  return `<div class="prose-content text-[var(--evo-ink-2)] leading-loose space-y-4">${
    text
      .split(/\n\n+/)
      .filter((p) => p.trim())
      .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
      .join('')
  }</div>`
}

// 拿「免费可见的部分」
function getFreePreview(article) {
  const fmt = article.contentFormat
  if (article.freeExcerpt) return textToParagraphs(article.freeExcerpt, fmt)
  const fullText = article.fullContent || article.content || ''
  if (!fullText) return `<p class="text-[var(--evo-ink-3)] italic">（付费文章的试读部分请在飞书「免费部分/试读」字段填写，或在正文里写前 3 段。）</p>`
  const paras = fullText.split(/\n\n+/).filter((p) => p.trim()).slice(0, 3)
  return textToParagraphs(paras.join('\n\n'), fmt)
}

// 拿「全文内容」
function getFullContentHtml(article) {
  const text = article.fullContent || article.content || ''
  if (!text) return `<p class="text-[var(--evo-ink-3)] italic">这篇文章暂无正文内容。</p>`
  return textToParagraphs(text, article.contentFormat)
}

// 提取「价格文本」
function priceText(a) {
  if (!a || !a.price) return ''
  return (Number(a.price) % 1 === 0) ? String(a.price) : Number(a.price).toFixed(2)
}

// ============================================================
// 一级：文章首页（子栏目入口卡片）
// ============================================================
function renderHome() {
  const list = document.getElementById('evo-articles-list')
  const empty = document.getElementById('evo-articles-empty')
  if (!list) return

  const freeCount = articles.filter((a) => !a.isPaid || !a.price).length
  const paidCount = articles.filter((a) => a.isPaid && a.price).length
  // 散文：飞书「分类」字段为「散文」的文章
  const proseCount = articles.filter((a) => {
    const cat = String(a.category || a.categoryLabel || '').toLowerCase()
    return cat === '散文' || cat.includes('散文')
  }).length

  list.classList.remove('hidden')
  empty.classList.add('hidden')

  const cards = [
    {
      view: 'free',
      icon: '🌿',
      title: '免费文章',
      desc: '无需付费，直接阅读全部免费内容',
      count: freeCount,
      tone: 'from-[var(--evo-cyan)]/20 to-[var(--evo-purple-500)]/10 border-[var(--evo-cyan)]/30',
      badgeCls: 'bg-[var(--evo-cyan)]/15 text-[var(--evo-cyan)]'
    },
    {
      view: 'paid',
      icon: '🔒',
      title: '付费文章',
      desc: '单篇付费解锁，支持兑换码永久解锁',
      count: paidCount,
      tone: 'from-[var(--evo-pink)]/20 to-[var(--evo-purple-500)]/15 border-[var(--evo-pink)]/40',
      badgeCls: 'bg-gradient-to-r from-[var(--evo-pink)]/20 to-[var(--evo-purple-500)]/20 text-white border border-[var(--evo-pink)]/40'
    },
    {
      view: 'collections',
      icon: '📚',
      title: '合集',
      desc: '多篇文章打包，合集价更优惠，一次解锁整组',
      count: collections.length,
      tone: 'from-[var(--evo-violet)]/20 to-[var(--evo-purple-700)]/15 border-[var(--evo-violet)]/30',
      badgeCls: 'bg-[var(--evo-violet)]/20 text-[var(--evo-violet)]'
    },
    {
      view: 'prose',
      icon: '✒️',
      title: '散文',
      desc: '随笔、札记、生活感悟与文学性记录',
      count: proseCount,
      tone: 'from-[var(--evo-amber)]/20 to-[var(--evo-orange)]/10 border-[var(--evo-amber)]/30',
      badgeCls: 'bg-[var(--evo-amber)]/15 text-[var(--evo-amber)]'
    }
  ]

  list.innerHTML = `
    <div class="grid gap-4 sm:gap-5 md:grid-cols-2 mt-2">
      ${cards.map((c, i) => `
        <div class="evo-glass evo-reveal rounded-[var(--evo-radius-lg)] p-5 md:p-6 cursor-pointer hover:bg-[var(--evo-surface-2)] transition-all group relative overflow-hidden border ${c.tone}" data-reveal-delay="${i * 100}" data-nav="${c.view}">
          <div class="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br ${c.tone} opacity-10 blur-2xl pointer-events-none"></div>
          <div class="relative">
            <div class="flex items-start justify-between mb-4">
              <div class="text-2xl">${c.icon}</div>
              ${c.count !== null ? `<span class="text-xs font-mono text-[var(--evo-ink-3)]">${c.count} 篇</span>` : `<span class="text-xs ${c.badgeCls} px-2 py-0.5 rounded-full">即将上线</span>`}
            </div>
            <h3 class="evo-title text-lg font-semibold mb-1.5">${c.title}</h3>
            <p class="text-xs text-[var(--evo-ink-3)] leading-relaxed mb-4">${c.desc}</p>
            <div class="flex items-center gap-1 text-xs text-[var(--evo-purple-300)] opacity-60 group-hover:opacity-100 transition-opacity">进入 <span>→</span></div>
          </div>
        </div>
      `).join('')}
    </div>
  `

  list.querySelectorAll('[data-nav]').forEach((card) => {
    card.addEventListener('click', () => {
      const view = card.dataset.nav
      navigate(view)
    })
  })

  if (window.EchoVerse && window.EchoVerse.refreshReveal) window.EchoVerse.refreshReveal()
}

// ============================================================
// 搜索结果视图：按标题 / 摘要 / 分类过滤全部文章
// ============================================================
function renderSearchResults() {
  const list = document.getElementById('evo-articles-list')
  const empty = document.getElementById('evo-articles-empty')
  if (!list) return

  const q = searchQuery.trim().toLowerCase()
  const items = q
    ? articles.filter((a) => {
        const title = String(a.title || '').toLowerCase()
        const excerpt = String(a.excerpt || a.freeExcerpt || '').toLowerCase()
        const category = String(a.category || a.categoryLabel || '').toLowerCase()
        return title.includes(q) || excerpt.includes(q) || category.includes(q)
      })
    : []

  list.classList.remove('hidden')

  if (!q) {
    empty.classList.add('hidden')
    return
  }

  if (!items.length) {
    empty.classList.remove('hidden')
    empty.querySelector('p').textContent = `没有找到包含「${searchQuery}」的文章`
    list.innerHTML = `
      <div class="mb-6">
        <h2 class="evo-title text-2xl sm:text-3xl mb-2">🔍 搜索结果</h2>
        <p class="text-sm text-[var(--evo-ink-3)]">关键词：${searchQuery}</p>
      </div>
    `
    return
  }

  empty.classList.add('hidden')

  list.innerHTML = `
    <div class="mb-6">
      <h2 class="evo-title text-2xl sm:text-3xl mb-2">🔍 搜索结果</h2>
      <p class="text-sm text-[var(--evo-ink-3)]">关键词「${searchQuery}」共找到 ${items.length} 篇文章</p>
    </div>
    <div class="grid gap-4 sm:gap-5 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
      ${items.map((a, i) => articleCard(a, i)).join('')}
    </div>
  `

  list.querySelectorAll('[data-article-id]').forEach((card) => {
    card.addEventListener('click', () => {
      const id = card.dataset.articleId
      const article = articles.find((a) => a.id === id)
      if (article) openArticleModal(article)
    })
  })

  if (window.EchoVerse && window.EchoVerse.refreshReveal) window.EchoVerse.refreshReveal()
}

// ============================================================
// 二级：文章列表（免费/付费）+ 返回按钮
// ============================================================
function renderArticleList(view) {
  const list = document.getElementById('evo-articles-list')
  const empty = document.getElementById('evo-articles-empty')
  if (!list) return

  const isFree = view === 'free'
  const items = isFree
    ? articles.filter((a) => !a.isPaid || !a.price)
    : articles.filter((a) => a.isPaid && a.price)

  const title = isFree ? '免费文章' : '付费文章'
  const icon = isFree ? '🌿' : '🔒'

  if (!items.length) {
    list.innerHTML = `
      <div class="mb-6">
        <button class="evo-back-btn flex items-center gap-2 text-sm text-[var(--evo-ink-2)] hover:text-[var(--evo-ink)] transition-colors" data-nav="home">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          返回文章
        </button>
      </div>
      <h2 class="evo-title text-2xl mb-6">${icon} ${title}</h2>
    `
    list.classList.remove('hidden')
    empty.classList.remove('hidden')
    empty.querySelector('p').textContent = `暂无${title}`
    bindBack(list)
    return
  }

  list.classList.remove('hidden')
  empty.classList.add('hidden')

  list.innerHTML = `
    <div class="mb-6">
      <button class="evo-back-btn flex items-center gap-2 text-sm text-[var(--evo-ink-2)] hover:text-[var(--evo-ink)] transition-colors" data-nav="home">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
        返回文章
      </button>
      <h2 class="evo-title text-2xl sm:text-3xl mt-4 mb-2">${icon} ${title}</h2>
      <p class="text-sm text-[var(--evo-ink-3)]">${items.length} 篇文章</p>
    </div>
    <div class="grid gap-4 sm:gap-5 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
      ${items.map((a, i) => articleCard(a, i)).join('')}
    </div>
  `

  list.querySelectorAll('[data-article-id]').forEach((card) => {
    card.addEventListener('click', () => {
      const id = card.dataset.articleId
      const article = articles.find((a) => a.id === id)
      if (article) openArticleModal(article)
    })
  })
  bindBack(list)

  if (window.EchoVerse && window.EchoVerse.refreshReveal) window.EchoVerse.refreshReveal()
}

// ============================================================
// 二级：合集列表（每个合集卡片带免费/付费角标）
// 数据源：飞书「合集」表（待建）；字段约定：
//   合集名 / 包含文章（多向关联或文本）/ 合集简介 / 合集封面 /
//   是否付费（单选）/ 合集售价（数字）/ 购买链接（超链接）
// 没有飞书数据时显示占位
// ============================================================

// 合集角标
function collectionBadgeHtml(c) {
  if (!c.isPaid || !c.price) {
    return '<span class="px-2 py-1 rounded-[var(--evo-radius-sm)] bg-[var(--evo-cyan)]/15 text-[var(--evo-cyan)] text-[11px]">免费合集</span>'
  }
  const priceText = (Number(c.price) % 1 === 0) ? String(c.price) : Number(c.price).toFixed(2)
  return `<span class="px-2 py-1 rounded-[var(--evo-radius-sm)] bg-gradient-to-r from-[var(--evo-pink)]/20 to-[var(--evo-purple-500)]/20 text-white text-[11px] font-semibold border border-[var(--evo-pink)]/40 tracking-wide">付费合集 ¥${priceText}</span>`
}

// 渲染单个合集卡片（卡片网格版，与文章卡片风格一致）
function collectionCard(c, index) {
  const coverHtml = c.coverImage
    ? `<div class="aspect-[16/9] overflow-hidden rounded-t-[var(--evo-radius-lg)]"><img src="${c.coverImage}" alt="${c.title}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" /></div>`
    : ''
  const articleCount = c.articleIds?.length || c.articleCount || 0
  // 合集是否整体已解锁（免费合集视为已解锁；付费合集看本地是否标记过）
  const unlocked = !c.isPaid || !c.price || (c.articleIds || []).every((id) => isUnlocked(id))
  return `
    <article class="evo-glass rounded-[var(--evo-radius-lg)] overflow-hidden hover:bg-[var(--evo-surface-2)] hover:border-[var(--evo-purple-400)]/40 transition-all cursor-pointer evo-reveal group relative flex flex-col" data-reveal-delay="${Math.min(index * 80, 400)}" data-collection-id="${c.id || ''}">
      ${coverHtml}
      <div class="p-4 md:p-5 flex-1 flex flex-col">
        <div class="flex flex-wrap items-center gap-2 mb-3">
          ${collectionBadgeHtml(c)}
          ${articleCount ? `<span class="text-xs text-[var(--evo-ink-3)]">${articleCount} 篇文章</span>` : ''}
        </div>
        <h2 class="evo-title text-base sm:text-lg mb-2 line-clamp-2">${c.title || '未命名合集'}</h2>
        <p class="text-sm text-[var(--evo-ink-2)] leading-relaxed line-clamp-3 flex-1">${c.desc || '（暂无简介）'}</p>
        <div class="mt-3 pt-3 border-t border-[var(--evo-border)] flex items-center justify-between text-xs text-[var(--evo-ink-3)]">
          <span>${unlocked ? '已解锁' : (c.isPaid && c.price ? '需付费' : '免费')}</span>
          <span class="text-[var(--evo-purple-300)] opacity-60 group-hover:opacity-100 transition-opacity">查看 →</span>
        </div>
      </div>
    </article>`
}

function renderCollections() {
  const list = document.getElementById('evo-articles-list')
  const empty = document.getElementById('evo-articles-empty')
  if (!list) return

  list.classList.remove('hidden')
  empty.classList.add('hidden')

  if (!collections.length) {
    list.innerHTML = `
      <div class="mb-6">
        <button class="evo-back-btn flex items-center gap-2 text-sm text-[var(--evo-ink-2)] hover:text-[var(--evo-ink)] transition-colors" data-nav="home">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          返回文章
        </button>
        <h2 class="evo-title text-2xl sm:text-3xl mt-4 mb-2">📚 合集</h2>
        <p class="text-sm text-[var(--evo-ink-3)]">多篇文章打包，每个合集独立标记免费或付费</p>
      </div>
      <div class="evo-glass rounded-[var(--evo-radius-lg)] p-8 md:p-12 text-center">
        <div class="text-5xl mb-4">📚</div>
        <h3 class="evo-title text-xl mb-3">还没有合集</h3>
        <p class="text-[var(--evo-ink-2)] text-sm leading-relaxed max-w-md mx-auto mb-4">
          在飞书多维表格的「合集」表里添加合集行，并关联文章，这里就会自动显示。
        </p>
      </div>
    `
    bindBack(list)
    return
  }

  list.innerHTML = `
    <div class="mb-6">
      <button class="evo-back-btn flex items-center gap-2 text-sm text-[var(--evo-ink-2)] hover:text-[var(--evo-ink)] transition-colors" data-nav="home">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
        返回文章
      </button>
      <h2 class="evo-title text-2xl sm:text-3xl mt-4 mb-2">📚 合集</h2>
      <p class="text-sm text-[var(--evo-ink-3)]">${collections.length} 个合集，每个合集独立定价</p>
    </div>
    <div class="grid gap-4 sm:gap-5 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
      ${collections.map((c, i) => collectionCard(c, i)).join('')}
    </div>
  `

  // 点合集卡片 → 进合集详情
  list.querySelectorAll('[data-collection-id]').forEach((card) => {
    card.addEventListener('click', () => {
      const id = card.dataset.collectionId
      const c = collections.find((x) => x.id === id)
      if (c) navigate('collection', id)
    })
  })
  bindBack(list)

  if (window.EchoVerse && window.EchoVerse.refreshReveal) window.EchoVerse.refreshReveal()
}

// ============================================================
// 三级：单个合集详情（合集内文章列表 + 付费合集兑换入口）
// ============================================================
function renderCollectionDetail(collectionId) {
  const list = document.getElementById('evo-articles-list')
  const empty = document.getElementById('evo-articles-empty')
  if (!list) return

  const c = collections.find((x) => x.id === collectionId)
  if (!c) {
    navigate('collections')
    return
  }

  list.classList.remove('hidden')
  empty.classList.add('hidden')

  // 用合集关联的 articleIds 过滤出文章
  const items = (c.articleIds || [])
    .map((id) => articles.find((a) => a.id === id))
    .filter(Boolean)

  // 整体是否已解锁
  const allUnlocked = !c.isPaid || !c.price || (c.articleIds || []).every((id) => isUnlocked(id))

  // 付费合集未解锁时的解锁面板（含合集简介 + 付费入口 + 兑换码）
  const lockedPanelHtml = (!c.isPaid || !c.price || allUnlocked) ? '' : `
    <div class="rounded-[var(--evo-radius-lg)] evo-glass border border-[var(--evo-purple-400)]/40 p-6 sm:p-8 evo-glow-purple space-y-6">
      <div class="space-y-3">
        <div class="flex items-center gap-2 text-2xl font-bold text-white">
          <span>🔒</span>
          <span>付费合集</span>
        </div>
        ${c.desc ? `
          <div class="text-sm text-[var(--evo-ink-2)] leading-loose whitespace-pre-line">
            ${c.desc}
          </div>
        ` : ''}
        <p class="text-xs text-[var(--evo-ink-3)]">
          本合集共 ${items.length} 篇文章，一次付费永久解锁全部内容。
        </p>
      </div>

      <div class="border-t border-[var(--evo-border)] pt-5 space-y-4">
        ${c.buyUrl ? `
          <a href="${c.buyUrl}" target="_blank" rel="noopener noreferrer"
             class="inline-flex items-center gap-2 px-6 py-3 rounded-[var(--evo-radius-md)] bg-gradient-to-r from-[var(--evo-pink)] to-[var(--evo-purple-500)] hover:from-[var(--evo-purple-500)] hover:to-[var(--evo-pink)] text-white font-semibold transition-all shadow-lg hover:shadow-[var(--evo-purple-500)]/40">
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
             立即支付 ¥${priceText(c)} 解锁合集
          </a>
        ` : '<p class="text-[var(--evo-ink-3)] text-sm">（站长还没配置购买链接）</p>'}

        <div class="pt-3 border-t border-[var(--evo-border)]">
          <p class="text-xs text-[var(--evo-ink-3)] mb-3">已经付款并拿到兑换码？粘贴下方验证解锁整合集：</p>
          <div class="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center max-w-md">
            <input id="evo-collection-redeem-input" type="text" placeholder="输入兑换码"
              class="flex-1 px-4 py-3 rounded-[var(--evo-radius-md)] bg-[var(--evo-surface-2)] border border-[var(--evo-border)] focus:outline-none focus:ring-2 focus:ring-[var(--evo-purple-400)] text-[var(--evo-ink)] text-sm tracking-wider font-mono" />
            <button id="evo-collection-redeem-btn" class="px-5 py-3 rounded-[var(--evo-radius-md)] border border-[var(--evo-purple-400)] text-[var(--evo-purple-300)] hover:bg-[var(--evo-purple-500)]/20 hover:text-white transition-colors font-semibold whitespace-nowrap">
              验证解锁
            </button>
          </div>
          <div id="evo-collection-redeem-msg" class="mt-2 text-xs h-4"></div>
        </div>
      </div>
    </div>
  `

  // 付费合集未解锁时不显示文章列表，只显示锁定面板
  // 解锁后（或免费合集）才显示文章列表
  const showArticleList = !c.isPaid || !c.price || allUnlocked

  list.innerHTML = `
    <div class="mb-6">
      <button class="evo-back-btn flex items-center gap-2 text-sm text-[var(--evo-ink-2)] hover:text-[var(--evo-ink)] transition-colors" data-nav="collections">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
        返回合集
      </button>
      <div class="mt-4 mb-2">
        <div class="flex flex-wrap items-center gap-3 mb-2">
          ${collectionBadgeHtml(c)}
          ${items.length ? `<span class="text-xs text-[var(--evo-ink-3)]">${items.length} 篇文章</span>` : ''}
        </div>
        <h2 class="evo-title text-2xl sm:text-3xl mb-2">${c.title || '未命名合集'}</h2>
        ${showArticleList && c.desc ? `<p class="text-sm text-[var(--evo-ink-2)] leading-relaxed mb-2">${c.desc}</p>` : ''}
      </div>
    </div>
    ${lockedPanelHtml}
    ${showArticleList ? (items.length ? `
      <div class="grid gap-4 sm:gap-5 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        ${items.map((a, i) => articleCard(a, i)).join('')}
      </div>
    ` : `
      <div class="evo-glass rounded-[var(--evo-radius-lg)] p-8 text-center text-[var(--evo-ink-3)]">
        <p>这个合集还没有关联文章。</p>
      </div>
    `) : ''}
  `

  // 点文章卡片 → 传合集对象过去，让详情弹窗按合集是否解锁判定
  list.querySelectorAll('[data-article-id]').forEach((card) => {
    card.addEventListener('click', () => {
      const id = card.dataset.articleId
      const article = articles.find((a) => a.id === id)
      if (article) openArticleModal(article, c)
    })
  })
  bindBack(list)

  // 绑定合集兑换码
  const input = list.querySelector('#evo-collection-redeem-input')
  const btn = list.querySelector('#evo-collection-redeem-btn')
  const msg = list.querySelector('#evo-collection-redeem-msg')
  if (input && btn && msg) {
    const showMsg = (text, ok = null) => {
      msg.textContent = text || ''
      msg.className = 'mt-2 text-xs h-4 ' + (ok === true ? 'text-[var(--evo-cyan)]' : ok === false ? 'text-[var(--evo-pink)]' : 'text-[var(--evo-ink-3)]')
    }
    const doRedeem = async () => {
      const code = input.value.trim()
      if (!code) { showMsg('请先输入兑换码', false); return }
      btn.disabled = true
      btn.classList.add('opacity-60')
      showMsg('正在验证…')
      const r = await redeemCode({
        code,
        collectionId: c.id,
        collectionName: c.title,
        type: 'collection'
      })
      btn.disabled = false
      btn.classList.remove('opacity-60')
      if (!r.ok) {
        showMsg('✗ ' + (r.message || '兑换失败'), false)
        return
      }
      // 合集核销成功：批量标记所有文章为已解锁
      const ids = r.articleIds || c.articleIds || []
      ids.forEach((aid) => markUnlocked(aid))
      showMsg(`✓ 验证成功，已解锁 ${ids.length} 篇文章`, true)
      // 重渲染合集详情，让所有文章显示为已解锁
      setTimeout(() => renderCollectionDetail(c.id), 600)
    }
    btn.addEventListener('click', doRedeem)
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doRedeem() })
  }

  if (window.EchoVerse && window.EchoVerse.refreshReveal) window.EchoVerse.refreshReveal()
}

// 绑定返回按钮
function bindBack(scope) {
  scope.querySelectorAll('.evo-back-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      navigate(btn.dataset.nav || 'home')
    })
  })
}

// 导航：切换视图（view='collection' 时第二参数为合集 id）
function navigate(view, collectionId) {
  currentView = view
  if (view === 'home') renderHome()
  else if (view === 'free' || view === 'paid') renderArticleList(view)
  else if (view === 'collections') renderCollections()
  else if (view === 'collection' && collectionId) {
    currentCollectionId = collectionId
    renderCollectionDetail(collectionId)
  }
  else if (view === 'prose') renderProse()
  else if (view === 'search') renderSearchResults()
  // 滚动到列表顶部
  const list = document.getElementById('evo-articles-list')
  if (list) list.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// ============================================================
// 二级：散文列表（按飞书「分类」字段筛选「散文」）
// ============================================================
function renderProse() {
  const list = document.getElementById('evo-articles-list')
  const empty = document.getElementById('evo-articles-empty')
  if (!list) return

  const items = articles.filter((a) => {
    const cat = String(a.category || a.categoryLabel || '').toLowerCase()
    return cat === '散文' || cat.includes('散文')
  })

  const title = '散文'
  const icon = '✒️'

  if (!items.length) {
    list.innerHTML = `
      <div class="mb-6">
        <button class="evo-back-btn flex items-center gap-2 text-sm text-[var(--evo-ink-2)] hover:text-[var(--evo-ink)] transition-colors" data-nav="home">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          返回文章
        </button>
      </div>
      <h2 class="evo-title text-2xl mb-6">${icon} ${title}</h2>
    `
    list.classList.remove('hidden')
    empty.classList.remove('hidden')
    empty.querySelector('p').textContent = `暂无${title}`
    bindBack(list)
    return
  }

  list.classList.remove('hidden')
  empty.classList.add('hidden')

  list.innerHTML = `
    <div class="mb-6">
      <button class="evo-back-btn flex items-center gap-2 text-sm text-[var(--evo-ink-2)] hover:text-[var(--evo-ink)] transition-colors" data-nav="home">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
        返回文章
      </button>
      <h2 class="evo-title text-2xl sm:text-3xl mt-4 mb-2">${icon} ${title}</h2>
      <p class="text-sm text-[var(--evo-ink-3)]">${items.length} 篇散文</p>
    </div>
    <div class="grid gap-4 sm:gap-5 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
      ${items.map((a, i) => articleCard(a, i)).join('')}
    </div>
  `

  list.querySelectorAll('[data-article-id]').forEach((card) => {
    card.addEventListener('click', () => {
      const id = card.dataset.articleId
      const article = articles.find((a) => a.id === id)
      if (article) openArticleModal(article)
    })
  })
  bindBack(list)

  if (window.EchoVerse && window.EchoVerse.refreshReveal) window.EchoVerse.refreshReveal()
}

// ============================================================
// 文章详情弹窗（核心：对付费文章解锁流程）
// ============================================================
function openArticleModal(article, fromCollection) {
  const existing = document.getElementById('evo-article-modal')
  if (existing) existing.remove()

  const toneCls = CAT_TONE[article.category] || CAT_TONE['道']
  const coverHtml = article.coverImage
    ? `<div class="mb-6 rounded-[var(--evo-radius-md)] overflow-hidden aspect-[16/9]"><img src="${article.coverImage}" alt="${article.title}" class="w-full h-full object-cover" /></div>`
    : ''
  // 判定是否解锁：
  //   1. 文章本身标记为已解锁
  //   2. 来自付费合集 → 合集内所有文章都已解锁才算解锁
  //   3. 文章自身免费（且不在付费合集里）→ 算解锁
  const fromPaidCollection = fromCollection && fromCollection.isPaid && fromCollection.price
  const collectionUnlocked = fromPaidCollection
    ? (fromCollection.articleIds || []).every((id) => isUnlocked(id))
    : false
  const unlocked = isUnlocked(article.id)
    || (fromPaidCollection ? collectionUnlocked : (!article.isPaid || !article.price))

  // 显示内容
  let bodyHtml = ''
  if (!article.isPaid || !article.price || unlocked) {
    // 免费 / 已解锁 → 全文
    bodyHtml = getFullContentHtml(article)
  } else if (fromPaidCollection) {
    // 来自付费合集且未解锁 → 显示合集购买入口 + 合集兑换码输入
    const c = fromCollection
    const price = Number(c.price) % 1 === 0 ? String(c.price) : Number(c.price).toFixed(2)
    const buyBtn = c.buyUrl
      ? `<a href="${c.buyUrl}" target="_blank" rel="noopener noreferrer"
           class="inline-flex items-center gap-2 px-5 py-3 rounded-[var(--evo-radius-md)] bg-gradient-to-r from-[var(--evo-pink)] to-[var(--evo-purple-500)] hover:from-[var(--evo-purple-500)] hover:to-[var(--evo-pink)] text-white font-semibold transition-all shadow-lg hover:shadow-[var(--evo-purple-500)]/40">
           <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
           立即支付 ¥${price} 解锁合集《${c.title}》
         </a>`
      : `<span class="text-[var(--evo-ink-3)] text-sm">（站长还没配置购买链接，请稍后再来或联系作者。）</span>`

    bodyHtml = `
      <div>
        <!-- 免费预览（合集内文章的摘要/试读） -->
        <div class="mb-4">
          ${getFreePreview(article)}
        </div>
        <!-- 遮罩 -->
        <div class="relative">
          <div class="h-40 pointer-events-none select-none" aria-hidden="true"
               style="mask-image: linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0) 100%);
                      -webkit-mask-image: linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0) 100%);">
            <div class="prose-content text-[var(--evo-ink-3)] leading-loose space-y-4 opacity-60 blur-[2px]">
              <p>………… 本文属于付费合集，付费后可解锁整合集 ………… ………………………… </p>
              <p>………… 一次付费，永久阅读本合集内全部文章 ……………………………………… </p>
              <p>…………………………………………………………………………………………………………………………………………</p>
            </div>
          </div>
          <!-- 合集解锁面板 -->
          <div class="mt-[-2rem] sm:mt-[-3rem] rounded-[var(--evo-radius-lg)] evo-glass border border-[var(--evo-purple-400)]/40 p-5 sm:p-6 evo-glow-purple space-y-4 text-center">
            <div class="flex items-center justify-center gap-2 text-xl font-bold text-white">
              <span>🔒</span>
              <span>付费合集 · 解锁全部 ${(c.articleIds || []).length} 篇</span>
            </div>
            <p class="text-sm text-[var(--evo-ink-2)]">
              本文属于付费合集《${c.title}》，付费后可永久阅读本合集内全部文章。
            </p>
            <div class="flex flex-wrap items-center justify-center gap-3">
              ${buyBtn}
            </div>

            <!-- 合集兑换码输入 -->
            <div class="pt-2 border-t border-[var(--evo-border)]">
              <p class="text-xs text-[var(--evo-ink-3)] mb-2">已经在链动小铺付款并拿到兑换码？粘贴下方验证解锁整合集：</p>
              <div class="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center justify-center max-w-md mx-auto">
                <input id="evo-redeem-input" type="text" placeholder="输入 12 位兑换码，如 A7K2-9XYP-3B5D"
                  class="flex-1 px-4 py-3 rounded-[var(--evo-radius-md)] bg-[var(--evo-surface-2)] border border-[var(--evo-border)] focus:outline-none focus:ring-2 focus:ring-[var(--evo-purple-400)] text-[var(--evo-ink)] text-sm tracking-wider font-mono" />
                <button id="evo-redeem-btn" class="px-5 py-3 rounded-[var(--evo-radius-md)] border border-[var(--evo-purple-400)] text-[var(--evo-purple-300)] hover:bg-[var(--evo-purple-500)]/20 hover:text-white transition-colors font-semibold whitespace-nowrap">
                  验证解锁
                </button>
              </div>
              <div id="evo-redeem-msg" class="mt-2 text-xs h-4"></div>
            </div>
          </div>
        </div>
      </div>`
  } else {
    // 单篇付费文章未解锁 → 免费预览 + 遮罩 + 两按钮
    const price = priceText(article)
    const buyBtn = article.buyUrl
      ? `<a href="${article.buyUrl}" target="_blank" rel="noopener noreferrer"
           class="inline-flex items-center gap-2 px-5 py-3 rounded-[var(--evo-radius-md)] bg-gradient-to-r from-[var(--evo-pink)] to-[var(--evo-purple-500)] hover:from-[var(--evo-purple-500)] hover:to-[var(--evo-pink)] text-white font-semibold transition-all shadow-lg hover:shadow-[var(--evo-purple-500)]/40">
           <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
           立即支付 ¥${price} 解锁全文
         </a>`
      : `<span class="text-[var(--evo-ink-3)] text-sm">（站长还没配置购买链接，请稍后再来或联系作者。）</span>`

    bodyHtml = `
      <div>
        <!-- 免费预览 -->
        <div class="mb-4">
          ${getFreePreview(article)}
        </div>
        <!-- 遮罩 -->
        <div class="relative">
          <div class="h-40 pointer-events-none select-none" aria-hidden="true"
               style="mask-image: linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0) 100%);
                      -webkit-mask-image: linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0) 100%);">
            <div class="prose-content text-[var(--evo-ink-3)] leading-loose space-y-4 opacity-60 blur-[2px]">
              <p>………… 付费内容已锁定，请解锁后阅读完整章节 ………… ………………………… ……………… </p>
              <p>………… 图、表、详细方法论与完整案例 在此段落 ……………………………………… </p>
              <p>…………………………………………………………………………………………………………………………………………</p>
            </div>
          </div>
          <!-- 解锁面板 -->
          <div class="mt-[-2rem] sm:mt-[-3rem] rounded-[var(--evo-radius-lg)] evo-glass border border-[var(--evo-purple-400)]/40 p-5 sm:p-6 evo-glow-purple space-y-4 text-center">
            <div class="flex items-center justify-center gap-2 text-xl font-bold text-white">
              <span>🔒</span>
              <span>付费解锁 · 全文</span>
            </div>
            <p class="text-sm text-[var(--evo-ink-2)]">
              付费后可永久阅读本篇文章的完整内容、图表、代码与案例。
            </p>
            <div class="flex flex-wrap items-center justify-center gap-3">
              ${buyBtn}
            </div>

            <!-- 兑换码输入 -->
            <div class="pt-2 border-t border-[var(--evo-border)]">
              <p class="text-xs text-[var(--evo-ink-3)] mb-2">已经在链动小铺付款并拿到兑换码？粘贴下方验证解锁：</p>
              <div class="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center justify-center max-w-md mx-auto">
                <input id="evo-redeem-input" type="text" placeholder="输入 12 位兑换码，如 A7K2-9XYP-3B5D"
                  class="flex-1 px-4 py-3 rounded-[var(--evo-radius-md)] bg-[var(--evo-surface-2)] border border-[var(--evo-border)] focus:outline-none focus:ring-2 focus:ring-[var(--evo-purple-400)] text-[var(--evo-ink)] text-sm tracking-wider font-mono" />
                <button id="evo-redeem-btn" class="px-5 py-3 rounded-[var(--evo-radius-md)] border border-[var(--evo-purple-400)] text-[var(--evo-purple-300)] hover:bg-[var(--evo-purple-500)]/20 hover:text-white transition-colors font-semibold whitespace-nowrap">
                  验证解锁
                </button>
              </div>
              <div id="evo-redeem-msg" class="mt-2 text-xs h-4"></div>
            </div>
          </div>
        </div>
      </div>`
  }

  const unlockedTagHtml = unlocked && article.isPaid && article.price
    ? `<span class="px-2 py-1 rounded-[var(--evo-radius-sm)] bg-[var(--evo-cyan)]/15 text-[var(--evo-cyan)] text-[11px] ml-2 align-middle">✓ 已解锁</span>`
    : ''

  const modal = document.createElement('div')
  modal.id = 'evo-article-modal'
  modal.className = 'fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm'
  modal.innerHTML = `
    <div class="evo-glass max-w-2xl w-full max-h-[85vh] overflow-y-auto rounded-[var(--evo-radius-lg)] p-6 md:p-10 relative" onclick="event.stopPropagation()">
      <button class="fixed top-4 right-4 z-[110] w-10 h-10 rounded-full bg-[var(--evo-surface-2)]/90 backdrop-blur border border-[var(--evo-border)] hover:bg-[var(--evo-purple-500)]/40 text-[var(--evo-ink-2)] hover:text-white transition-all flex items-center justify-center shadow-lg" id="evo-article-close" aria-label="关闭">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      ${coverHtml}
      <div class="flex flex-wrap items-center gap-3 mb-4">
        <span class="px-2 py-1 rounded-[var(--evo-radius-sm)] ${toneCls} text-xs">${article.categoryLabel || article.category}</span>
        ${paidBadgeHtml(article)}
        <span class="text-xs text-[var(--evo-ink-3)]">${article.date}</span>
        ${article.readTime ? `<span class="text-xs text-[var(--evo-ink-3)]">${article.readTime}</span>` : ''}
      </div>
      <h1 class="evo-title text-2xl sm:text-3xl mb-6 flex items-center">
        ${article.title}
        ${unlockedTagHtml}
      </h1>
      <div id="evo-article-body">
        ${bodyHtml}
      </div>
    </div>
  `
  // 点遮罩关闭
  modal.addEventListener('click', () => modal.remove())
  modal.querySelector('#evo-article-close').addEventListener('click', () => modal.remove())
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      modal.remove()
      document.removeEventListener('keydown', escHandler)
    }
  }
  document.addEventListener('keydown', escHandler)
  document.body.appendChild(modal)

  // 绑定：兑换码输入（如果渲染了）
  const input = modal.querySelector('#evo-redeem-input')
  const btn = modal.querySelector('#evo-redeem-btn')
  const msg = modal.querySelector('#evo-redeem-msg')
  if (input && btn && msg) {
    const showMsg = (text, ok = null) => {
      msg.textContent = text || ''
      msg.className = 'mt-2 text-xs h-4 ' + (ok === true ? 'text-[var(--evo-cyan)]' : ok === false ? 'text-[var(--evo-pink)]' : 'text-[var(--evo-ink-3)]')
    }
    const doRedeem = async () => {
      const code = input.value.trim()
      if (!code) { showMsg('请先输入兑换码', false); return }
      btn.disabled = true
      btn.classList.add('opacity-60')
      showMsg('正在验证…')

      // 来自付费合集 → 走合集核销分支
      if (fromPaidCollection) {
        const r = await redeemCode({
          code,
          collectionId: fromCollection.id,
          collectionName: fromCollection.title,
          type: 'collection'
        })
        btn.disabled = false
        btn.classList.remove('opacity-60')
        if (!r.ok) {
          showMsg('✗ ' + (r.message || '兑换失败'), false)
          return
        }
        // 合集核销成功：批量标记合集内所有文章为已解锁
        const ids = r.articleIds || fromCollection.articleIds || []
        ids.forEach((aid) => markUnlocked(aid))
        showMsg(`✓ 验证成功，已解锁整合集（${ids.length} 篇）`, true)
        // 重开弹窗显示全文
        setTimeout(() => openArticleModal(article, fromCollection), 600)
        return
      }

      // 单篇付费文章核销
      const r = await redeemCode({ code, articleId: article.id, articleTitle: article.title })
      btn.disabled = false
      btn.classList.remove('opacity-60')
      if (!r.ok) {
        showMsg('✗ ' + (r.message || '兑换失败'), false)
        return
      }
      // 成功：标记已解锁 + 刷新弹窗全文
      markUnlocked(article.id)
      showMsg('✓ 验证成功，正在解锁全文…', true)
      const fullText = r.articleContent || article.fullContent || article.content || ''
      const bodyEl = modal.querySelector('#evo-article-body')
      if (bodyEl) {
        bodyEl.innerHTML = fullText
          ? textToParagraphs(fullText, article.contentFormat)
          : getFullContentHtml({ ...article, fullContent: article.fullContent })
      }
      openArticleModal(article) // 重开一次，让顶部角标刷新
    }
    btn.addEventListener('click', doRedeem)
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doRedeem() })
  }
}

async function loadData() {
  // 并行拉文章 + 合集
  const [raw, rawCollections] = await Promise.all([
    fetchArticles(),
    fetchCollections()
  ])
  if (raw && raw.length) {
    articles = raw
  } else {
    // mock fallback 时补付费字段默认免费
    articles = MOCK_ARTICLES.map((a) => ({
      ...a,
      coverImage: null,
      isPaid: false,
      price: 0,
      buyUrl: '',
      fullContent: a.content || '',
      freeExcerpt: a.excerpt || '',
      contentFormat: 'plain'
    }))
  }
  // 合集数据：拉到就用，拉不到就空数组（合集卡片会显示占位）
  collections = (rawCollections && rawCollections.length) ? rawCollections : []
}

async function init() {
  const list = document.getElementById('evo-articles-list')
  if (list) list.innerHTML = '<div class="text-center py-16 text-[var(--evo-ink-3)]">加载中…</div>'
  // 隐藏旧的筛选栏（如果 HTML 里还有的话）
  const filtersBar = document.getElementById('evo-articles-filters')
  if (filtersBar) filtersBar.style.display = 'none'

  // 绑定搜索框
  const searchInput = document.getElementById('evo-articles-search')
  const searchClear = document.getElementById('evo-articles-search-clear')
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const val = e.target.value
      if (searchClear) searchClear.classList.toggle('hidden', !val)
      clearTimeout(searchDebounceTimer)
      searchDebounceTimer = setTimeout(() => {
        searchQuery = val
        if (val.trim()) {
          navigate('search')
        } else {
          // 清空搜索 → 回到文章首页
          navigate('home')
        }
      }, 200)
    })
  }
  if (searchClear) {
    searchClear.addEventListener('click', () => {
      if (searchInput) {
        searchInput.value = ''
        searchQuery = ''
        searchClear.classList.add('hidden')
        navigate('home')
        searchInput.focus()
      }
    })
  }

  await loadData()
  // 默认渲染文章首页（一级）
  renderHome()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
