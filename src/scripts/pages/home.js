// ============================================================
// 首页 home.js
// 1) 生成星空背景（轻量，含闪烁动画）
// 2) 鼠标视差：Hero 光晕随鼠标轻微移动
// 3) 读飞书 / mock：设置（姓名/头像首字/分身名/描述）、统计数、精选作品、最近文章
// ============================================================

import { fetchProjects, fetchArticles, fetchNotes, fetchSiteSettings } from '../feishu.js'
import { PROJECTS as MOCK_PROJECTS, ARTICLES as MOCK_ARTICLES } from '../data.js'

// 作品集配色映射（和 portfolio.js 对齐）
const ACCENT_GRADIENT = {
  purple: 'from-[var(--evo-purple-700)] to-[var(--evo-cyan)]/30',
  cyan: 'from-[var(--evo-cyan)]/40 to-[var(--evo-purple-700)]',
  pink: 'from-[var(--evo-pink)]/40 to-[var(--evo-violet)]/40',
  violet: 'from-[var(--evo-violet)]/50 to-[var(--evo-pink)]/30'
}
const TAG_TONE = {
  purple: 'bg-[var(--evo-purple-500)]/20 text-[var(--evo-purple-300)]',
  cyan: 'bg-[var(--evo-cyan)]/20 text-[var(--evo-cyan)]',
  pink: 'bg-[var(--evo-pink)]/20 text-[var(--evo-pink)]',
  violet: 'bg-[var(--evo-violet)]/30 text-[var(--evo-violet)]'
}

// 生成星空：在 #evo-hero-bg 内插入若干闪烁的小点
function buildStarfield() {
  const bg = document.getElementById('evo-hero-bg')
  if (!bg) return
  // 避免重复生成
  if (bg.dataset.starsBuilt === '1') return
  bg.dataset.starsBuilt = '1'
  const stars = document.createElement('div')
  stars.className = 'absolute inset-0'
  stars.setAttribute('aria-hidden', 'true')

  const count = window.innerWidth < 640 ? 28 : 56
  let html = ''
  for (let i = 0; i < count; i++) {
    const x = Math.random() * 100
    const y = Math.random() * 100
    const size = Math.random() * 2 + 1
    const delay = (Math.random() * 4).toFixed(2)
    const dur = (3 + Math.random() * 3).toFixed(2)
    const opacity = (0.2 + Math.random() * 0.6).toFixed(2)
    html += `<span class="absolute rounded-full bg-white evo-animate-twinkle" style="left:${x}%;top:${y}%;width:${size}px;height:${size}px;opacity:${opacity};animation-delay:${delay}s;animation-duration:${dur}s;"></span>`
  }
  stars.innerHTML = html
  bg.appendChild(stars)
}

// 鼠标视差：Hero 光晕 + 轨道环跟随鼠标轻微偏移
function setupParallax() {
  const bg = document.getElementById('evo-hero-bg')
  if (!bg) return
  if (window.matchMedia('(pointer: coarse)').matches) return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  const layers = bg.children
  const section = bg.parentElement
  let raf = 0

  section.addEventListener('mousemove', (e) => {
    if (raf) return
    raf = requestAnimationFrame(() => {
      const rect = section.getBoundingClientRect()
      const cx = (e.clientX - rect.left) / rect.width - 0.5
      const cy = (e.clientY - rect.top) / rect.height - 0.5
      Array.from(layers).forEach((layer, i) => {
        const depth = (i + 1) * 6
        layer.style.transform = `translate(${cx * depth}px, ${cy * depth}px)`
      })
      raf = 0
    })
  })
  section.addEventListener('mouseleave', () => {
    Array.from(layers).forEach((layer) => (layer.style.transform = ''))
  })
}

// 设置文本内容
function setText(id, text) {
  const el = document.getElementById(id)
  if (el) el.textContent = text
}

// 应用站点设置
function applySettings(settings) {
  const char = settings.avatarChar || settings.ownerName?.slice(0, 1) || 'E'
  const doppelName = (settings.ownerName && settings.ownerName !== '阴之体道')
    ? settings.ownerName
    : 'Echo'
  setText('evo-home-avatar-char', char)
  setText('evo-home-doppelganger-name', doppelName)
  setText('evo-home-doppelganger-name-2', doppelName)
  if (settings.identity || settings.bio) {
    const desc = document.getElementById('evo-home-hero-desc')
    if (desc) desc.textContent = settings.bio || settings.identity || ''
  }
}

// 统计数
function applyCounts(projects, articles, notes) {
  setText('evo-home-count-projects', `${projects.length} 个项目`)
  setText('evo-home-count-articles', `${articles.length} 篇长文`)
  setText('evo-home-count-notes', `${notes.length} 条笔记`)
}

// 精选作品（推荐/最新的前 3 条，飞书优先 featured）
function renderFeaturedProjects(projects) {
  const host = document.getElementById('evo-home-featured')
  if (!host) return
  const items = [...projects]
  // 优先 featured 在前，保持原顺序取前 3
  items.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0))
  const list = items.slice(0, 3)
  if (!list.length) {
    host.innerHTML = '<div class="col-span-full text-center py-12 text-[var(--evo-ink-3)]">暂无项目，稍后回来看看吧。</div>'
    return
  }
  host.innerHTML = list.map((p) => {
    const tone = TAG_TONE[p.accent] || TAG_TONE.purple
    const gradient = ACCENT_GRADIENT[p.accent] || ACCENT_GRADIENT.purple
    const cover = p.coverImage
      ? `<div class="aspect-[16/10] overflow-hidden rounded-t-[var(--evo-radius-lg)]"><img src="${p.coverImage}" alt="${p.title}" class="w-full h-full object-cover" loading="lazy" /></div>`
      : `<div class="aspect-[16/10] bg-gradient-to-br ${gradient} flex items-center justify-center px-4 rounded-t-[var(--evo-radius-lg)]"><span class="evo-title text-lg sm:text-xl text-white/90 text-center">${p.title}</span></div>`
    return `
      <a href="portfolio.html" class="group evo-glass rounded-[var(--evo-radius-lg)] overflow-hidden hover:bg-[var(--evo-surface-2)] hover:-translate-y-1 transition-all evo-reveal">
        ${cover}
        <div class="p-5">
          <div class="flex items-center gap-2 mb-3 flex-wrap">
            <span class="px-2 py-1 rounded-[var(--evo-radius-sm)] ${tone} text-xs">${p.categoryLabel || p.category}</span>
            <span class="text-xs text-[var(--evo-ink-3)]">${p.year || ''}</span>
          </div>
          <h3 class="evo-title text-lg mb-2 group-hover:text-[var(--evo-purple-300)] transition-colors">${p.title}</h3>
          <p class="text-sm text-[var(--evo-ink-2)] leading-relaxed line-clamp-3">${p.desc || ''}</p>
        </div>
      </a>`
  }).join('')
  if (window.EchoVerse && window.EchoVerse.refreshReveal) window.EchoVerse.refreshReveal()
}

// 最近文章（按日期/原顺序取前 4 条）
function renderRecentArticles(articles) {
  const host = document.getElementById('evo-home-recent')
  if (!host) return
  const list = articles.slice(0, 4)
  if (!list.length) {
    host.innerHTML = '<div class="text-center py-12 text-[var(--evo-ink-3)]">暂无文章，稍后回来看看吧。</div>'
    return
  }
  const CAT_TONE = {
    '道': 'bg-[var(--evo-purple-500)]/20 text-[var(--evo-purple-300)]',
    '法': 'bg-[var(--evo-cyan)]/20 text-[var(--evo-cyan)]',
    '术': 'bg-[var(--evo-pink)]/20 text-[var(--evo-pink)]',
    '器': 'bg-[var(--evo-violet)]/30 text-[var(--evo-violet)]',
    '势': 'bg-[var(--evo-purple-700)]/20 text-[var(--evo-purple-400)]',
    design: 'bg-[var(--evo-purple-500)]/20 text-[var(--evo-purple-300)]',
    tech: 'bg-[var(--evo-cyan)]/20 text-[var(--evo-cyan)]',
    life: 'bg-[var(--evo-pink)]/20 text-[var(--evo-pink)]',
    thought: 'bg-[var(--evo-violet)]/30 text-[var(--evo-violet)]'
  }
  host.innerHTML = list.map((a) => {
    const tone = CAT_TONE[a.category] || CAT_TONE.design
    const cover = a.coverImage
      ? `<div class="hidden sm:block w-36 md:w-44 aspect-[16/10] rounded-[var(--evo-radius-md)] overflow-hidden shrink-0"><img src="${a.coverImage}" alt="${a.title}" class="w-full h-full object-cover" loading="lazy" /></div>`
      : ''
    return `
      <a href="articles.html" class="group evo-glass rounded-[var(--evo-radius-lg)] p-4 sm:p-5 flex gap-5 items-start hover:bg-[var(--evo-surface-2)] transition-all evo-reveal">
        ${cover}
        <div class="flex-1 min-w-0">
          <div class="flex flex-wrap items-center gap-2 mb-3">
            <span class="px-2 py-1 rounded-[var(--evo-radius-sm)] ${tone} text-xs">${a.categoryLabel || a.category}</span>
            <span class="text-xs text-[var(--evo-ink-3)]">${a.date || ''}</span>
            ${a.readTime ? `<span class="text-xs text-[var(--evo-ink-3)]">${a.readTime}</span>` : ''}
          </div>
          <h3 class="evo-title text-lg mb-2 group-hover:text-[var(--evo-cyan)] transition-colors">${a.title}</h3>
          <p class="text-sm text-[var(--evo-ink-2)] leading-relaxed line-clamp-2">${a.excerpt || ''}</p>
        </div>
      </a>`
  }).join('')
  if (window.EchoVerse && window.EchoVerse.refreshReveal) window.EchoVerse.refreshReveal()
}

// ------------------------------------------------------------
// 数据加载
// ------------------------------------------------------------
async function loadAllData() {
  const [projectsRaw, articlesRaw, notesRaw, settingsRaw] = await Promise.all([
    fetchProjects(),
    fetchArticles(),
    fetchNotes(),
    fetchSiteSettings()
  ])

  const projects = projectsRaw && projectsRaw.length ? projectsRaw : MOCK_PROJECTS.map((p) => ({
    id: p.id, title: p.title, category: p.category, categoryLabel: p.categoryLabel,
    year: p.year, desc: p.desc, accent: p.accent, coverImage: null, demoUrl: null, featured: false
  }))
  const articles = articlesRaw && articlesRaw.length ? articlesRaw : MOCK_ARTICLES.map((a) => ({
    id: a.id, title: a.title, category: a.category, categoryLabel: a.categoryLabel || a.category,
    date: a.date, readTime: a.readTime, excerpt: a.excerpt, coverImage: null, featured: false
  }))
  const notes = notesRaw && notesRaw.length ? notesRaw : []

  // 默认站点设置：fallback
  const settings = settingsRaw || {
    ownerName: '阴之体道',
    avatarChar: '阴',
    avatarImage: null,
    identity: '',
    bio: '她是我的数字分身，可以回答关于我的一切。在这里，作品、文章、思考被编织成一张可探索的知识网络。',
    skills: [],
    socials: []
  }

  return { projects, articles, notes, settings }
}

async function init() {
  buildStarfield()
  setupParallax()

  const { projects, articles, notes, settings } = await loadAllData()
  applySettings(settings)
  applyCounts(projects, articles, notes)
  setText('evo-home-count-owner', settings.ownerName || '—')
  renderFeaturedProjects(projects)
  renderRecentArticles(articles)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
