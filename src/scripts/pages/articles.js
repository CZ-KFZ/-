// ============================================================
// 文章 articles.js（CMS + 付费版）
// 数据源：优先飞书多维表格；为空或未配置时回退到 data.js
// 新功能：
//   - 文章卡片显示「付费 ¥XX」/「免费」角标
//   - 付费文章：详情里只显示免费部分（摘要 / 前 3 段 / 免费字段内容）+ 🔒 遮罩
//   - [立即支付 ¥XX 解锁] 按钮（跳飞书表里填的 buyUrl，即链动小铺商品链接）
//   - 输入兑换码 → 调后端 /api/redeem 校验 → 解锁全文，解锁态存 localStorage
// ============================================================

import { fetchArticles, redeemCode } from '../feishu.js'
import { ARTICLES as MOCK_ARTICLES, ARTICLE_FILTERS } from '../data.js'

let currentFilter = 'all'
let articles = []

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
    ? `<div class="mb-4 rounded-[var(--evo-radius-md)] overflow-hidden aspect-[16/9]"><img src="${a.coverImage}" alt="${a.title}" class="w-full h-full object-cover" loading="lazy" /></div>`
    : ''
  const unlocked = isUnlocked(a.id)
  const lockIcon = (a.isPaid && a.price && !unlocked) ? '<span class="ml-1">🔒</span>' : ''
  return `
    <article class="evo-glass rounded-[var(--evo-radius-lg)] p-6 md:p-8 hover:bg-[var(--evo-surface-2)] transition-colors cursor-pointer evo-reveal group relative overflow-hidden" data-reveal-delay="${Math.min(index * 80, 400)}" data-article-id="${a.id}">
      ${coverHtml}
      <div class="flex flex-wrap items-center gap-3 mb-4">
        <span class="px-2 py-1 rounded-[var(--evo-radius-sm)] ${toneCls} text-xs">${a.categoryLabel || a.category}</span>
        ${paidBadgeHtml(a)}
        <span class="text-xs text-[var(--evo-ink-3)]">${a.date}</span>
        ${a.readTime ? `<span class="text-xs text-[var(--evo-ink-3)]">${a.readTime}</span>` : ''}
      </div>
      <h2 class="evo-title text-xl sm:text-2xl mb-3 flex items-center">${a.title}${lockIcon}</h2>
      <p class="text-[var(--evo-ink-2)] leading-relaxed">${a.excerpt || a.freeExcerpt || '（暂无摘要）'}</p>
      <div class="mt-4 flex items-center justify-between text-sm">
        <div class="text-[var(--evo-purple-300)] opacity-0 group-hover:opacity-100 transition-opacity">
          ${unlocked ? '已解锁 · 阅读全文 →' : '阅读全文 →'}
        </div>
        ${unlocked ? '<span class="text-xs text-[var(--evo-cyan)]">✓ 已解锁</span>' : ''}
      </div>
    </article>`
}

// 把正文转成段落 HTML
function textToParagraphs(text) {
  if (!text) return ''
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
  // 优先级：手动填的免费部分 > 正文前 3 段 > 摘要
  if (article.freeExcerpt) return textToParagraphs(article.freeExcerpt)
  const fullText = article.fullContent || article.content || ''
  if (!fullText) return `<p class="text-[var(--evo-ink-3)] italic">（付费文章的试读部分请在飞书「免费部分/试读」字段填写，或在正文里写前 3 段。）</p>`
  const paras = fullText.split(/\n\n+/).filter((p) => p.trim()).slice(0, 3)
  return textToParagraphs(paras.join('\n\n'))
}

// 拿「全文内容」
function getFullContentHtml(article) {
  const text = article.fullContent || article.content || ''
  if (!text) return `<p class="text-[var(--evo-ink-3)] italic">这篇文章暂无正文内容。</p>`
  return textToParagraphs(text)
}

// 提取「价格文本」
function priceText(a) {
  if (!a || !a.price) return ''
  return (Number(a.price) % 1 === 0) ? String(a.price) : Number(a.price).toFixed(2)
}

// ============================================================
// 文章详情弹窗（核心：对付费文章解锁流程）
// ============================================================
function openArticleModal(article) {
  const existing = document.getElementById('evo-article-modal')
  if (existing) existing.remove()

  const toneCls = CAT_TONE[article.category] || CAT_TONE['道']
  const coverHtml = article.coverImage
    ? `<div class="mb-6 rounded-[var(--evo-radius-md)] overflow-hidden aspect-[16/9]"><img src="${article.coverImage}" alt="${article.title}" class="w-full h-full object-cover" /></div>`
    : ''
  const unlocked = isUnlocked(article.id) || !article.isPaid || !article.price

  // 显示内容
  let bodyHtml = ''
  if (!article.isPaid || !article.price || unlocked) {
    // 免费 / 已解锁 → 全文
    bodyHtml = getFullContentHtml(article)
  } else {
    // 付费文章未解锁 → 免费预览 + 遮罩 + 两按钮
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
      <button class="absolute top-4 right-4 w-9 h-9 rounded-full bg-[var(--evo-surface-2)] hover:bg-[var(--evo-purple-500)]/30 text-[var(--evo-ink-2)] hover:text-white transition-all flex items-center justify-center" id="evo-article-close" aria-label="关闭">
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
      const r = await redeemCode({ code, articleId: article.id })
      btn.disabled = false
      btn.classList.remove('opacity-60')
      if (!r.ok) {
        showMsg('✗ ' + (r.message || '兑换失败'), false)
        return
      }
      // 成功：标记已解锁 + 刷新弹窗全文
      markUnlocked(article.id)
      showMsg('✓ 验证成功，正在解锁全文…', true)
      // 如果后端返回了全文内容，就用后端的；否则用本地（如果本地就有全文也能用）
      const fullText = r.articleContent || article.fullContent || article.content || ''
      const bodyEl = modal.querySelector('#evo-article-body')
      if (bodyEl) {
        bodyEl.innerHTML = fullText
          ? textToParagraphs(fullText)
          : getFullContentHtml({ ...article, fullContent: article.fullContent })
      }
      // 标题旁边加个「已解锁」
      openArticleModal(article) // 重开一次，让顶部角标刷新
    }
    btn.addEventListener('click', doRedeem)
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doRedeem() })
  }
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
  list.querySelectorAll('[data-article-id]').forEach((card) => {
    card.addEventListener('click', () => {
      const id = card.dataset.articleId
      const article = articles.find((a) => a.id === id)
      if (article) openArticleModal(article)
    })
  })
  if (window.EchoVerse && window.EchoVerse.refreshReveal) window.EchoVerse.refreshReveal()
}

async function loadData() {
  const raw = await fetchArticles()
  if (raw && raw.length) {
    articles = raw
    return
  }
  // mock fallback 时补付费字段默认免费
  articles = MOCK_ARTICLES.map((a) => ({
    ...a,
    coverImage: null,
    isPaid: false,
    price: 0,
    buyUrl: '',
    fullContent: a.content || '',
    freeExcerpt: a.excerpt || ''
  }))
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
