// ============================================================
// 首页 home.js
// 1) 生成星空背景（轻量，含闪烁动画）
// 2) 鼠标视差：Hero 光晕随鼠标轻微移动
// 3) 读飞书 / mock：设置（姓名/头像首字/分身名/描述）、统计数、精选作品（大轮播）、最近文章
// ============================================================

import { fetchProjects, fetchArticles, fetchNotes, fetchSiteSettings } from '../feishu.js'
import { PROJECTS as MOCK_PROJECTS, ARTICLES as MOCK_ARTICLES } from '../data.js'
import { TAG_TONE, ACCENT_GRADIENT, openProjectModal } from '../project-ui.js'
import { bindTiltEffect } from '../effects.js'

// 生成星空：在 #evo-hero-bg 内插入若干闪烁的小点
function buildStarfield() {
  const bg = document.getElementById('evo-hero-bg')
  if (!bg) return
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

// 鼠标视差
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
  setText('evo-home-doppelganger-name', doppelName)
  setText('evo-home-doppelganger-name-2', doppelName)

  const avatarInner = document.getElementById('evo-home-avatar-inner')
  const avatarCharEl = document.getElementById('evo-home-avatar-char')
  if (settings.avatarImage && avatarInner) {
    avatarInner.innerHTML = `<img src="${settings.avatarImage}" alt="${settings.ownerName || '头像'}" class="w-full h-full object-contain" />`
  } else if (avatarCharEl) {
    avatarCharEl.textContent = char
  }

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

// ------------------------------------------------------------
// 精选作品大轮播（首页）
// ------------------------------------------------------------
let projectsData = []

function renderFeaturedCarousel(projects) {
  projectsData = projects
  const container = document.getElementById('evo-home-featured')
  if (!container) return

  let featured = projects.filter((p) => p.featured)
  if (featured.length < 3) featured = projects.slice(0, Math.min(5, projects.length))
  if (!featured.length) {
    container.innerHTML = '<div class="col-span-full text-center py-12 text-white/30">暂无项目，稍后回来看看吧。</div>'
    return
  }

  const slidesHtml = featured.map((p, i) => {
    const gradient = ACCENT_GRADIENT[p.accent] || ACCENT_GRADIENT.purple
    const toneCls = TAG_TONE[p.accent] || TAG_TONE.purple
    const bg = p.coverImage
      ? `<img src="${p.coverImage}" alt="${p.title}" class="absolute inset-0 w-full h-full object-cover" loading="lazy" />`
      : `<div class="absolute inset-0 bg-gradient-to-br ${gradient}"></div>`
    return `
      <div class="evo-carousel-slide absolute inset-0 transition-opacity duration-700 ${i === 0 ? 'opacity-100' : 'opacity-0 pointer-events-none'}" data-slide="${i}">
        ${bg}
        <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent"></div>
        <div class="absolute bottom-0 left-0 right-0 p-6 sm:p-10">
          <div class="flex items-center gap-2 mb-3 flex-wrap">
            <span class="px-2 py-1 rounded-[var(--evo-radius-sm)] ${toneCls} text-xs">${p.categoryLabel || p.category}</span>
            <span class="text-xs text-white/70">${p.year || ''}</span>
          </div>
          <h3 class="font-serif-instrument text-2xl sm:text-4xl text-white mb-2">${p.title}</h3>
          <p class="text-white/70 text-sm sm:text-base max-w-xl mb-4 line-clamp-2">${p.desc || ''}</p>
          <button class="evo-featured-open inline-flex items-center gap-2 px-5 py-2.5 rounded-[var(--evo-radius-md)] bg-white/15 backdrop-blur-md hover:bg-white/25 text-white text-sm transition-all border border-white/20" data-project-id="${p.id}">
            查看详情
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </button>
        </div>
      </div>`
  }).join('')

  const dotsHtml = featured.map((_, i) => `
    <button class="evo-carousel-dot w-2.5 h-2.5 rounded-full transition-all ${i === 0 ? 'bg-white w-8' : 'bg-white/40 hover:bg-white/60'}" data-dot="${i}"></button>
  `).join('')

  container.innerHTML = `
    <div class="relative rounded-[var(--evo-radius-lg)] overflow-hidden evo-glass evo-reveal" style="aspect-ratio: 21/9; min-height: 280px;">
      ${slidesHtml}
      <button class="evo-carousel-prev absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-all backdrop-blur-sm z-10" aria-label="上一张">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <button class="evo-carousel-next absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-all backdrop-blur-sm z-10" aria-label="下一张">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
      <div class="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-10">
        ${dotsHtml}
      </div>
    </div>
  `

  // 轮播逻辑
  let current = 0
  let timer = null
  const slides = container.querySelectorAll('.evo-carousel-slide')
  const dots = container.querySelectorAll('.evo-carousel-dot')
  const total = slides.length

  function goTo(idx) {
    slides[current].classList.add('opacity-0', 'pointer-events-none')
    slides[current].classList.remove('opacity-100')
    dots[current].classList.remove('bg-white', 'w-8')
    dots[current].classList.add('bg-white/40')
    current = (idx + total) % total
    slides[current].classList.remove('opacity-0', 'pointer-events-none')
    slides[current].classList.add('opacity-100')
    dots[current].classList.add('bg-white', 'w-8')
    dots[current].classList.remove('bg-white/40')
  }
  function next() { goTo(current + 1) }
  function prev() { goTo(current - 1) }
  function startAuto() { stopAuto(); timer = setInterval(next, 5000) }
  function stopAuto() { if (timer) clearInterval(timer) }

  container.querySelector('.evo-carousel-next').addEventListener('click', () => { next(); startAuto() })
  container.querySelector('.evo-carousel-prev').addEventListener('click', () => { prev(); startAuto() })
  dots.forEach((d) => d.addEventListener('click', () => { goTo(parseInt(d.dataset.dot)); startAuto() }))
  container.addEventListener('mouseenter', stopAuto)
  container.addEventListener('mouseleave', startAuto)

  container.querySelectorAll('.evo-featured-open').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const id = btn.dataset.projectId
      const project = projectsData.find((p) => p.id === id)
      if (project) openProjectModal(project)
    })
  })

  if (total > 1) startAuto()

  if (window.EchoVerse && window.EchoVerse.refreshReveal) window.EchoVerse.refreshReveal()
}

// 最近文章（推荐优先，取前 4 条）
function renderRecentArticles(articles) {
  const host = document.getElementById('evo-home-recent')
  if (!host) return
  const items = [...articles]
  items.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0))
  const list = items.slice(0, 4)
  if (!list.length) {
    host.innerHTML = '<div class="text-center py-12 text-white/30">暂无文章，稍后回来看看吧。</div>'
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
  host.innerHTML = list.map((a, i) => {
    const tone = CAT_TONE[a.category] || CAT_TONE.design
    const cover = a.coverImage
      ? `<div class="hidden sm:block w-36 md:w-44 aspect-[16/10] rounded-[var(--evo-radius-md)] overflow-hidden shrink-0"><img src="${a.coverImage}" alt="${a.title}" class="w-full h-full object-cover" loading="lazy" /></div>`
      : ''
    return `
      <a href="articles.html" class="group evo-glass evo-tilt-card evo-glow-card rounded-[var(--evo-radius-lg)] p-4 sm:p-5 flex gap-5 items-start hover:bg-[var(--evo-surface-2)] transition-all evo-reveal evo-filter-item" data-reveal-delay="${Math.min(i * 80, 400)}" style="animation-delay:${Math.min(i * 60, 360)}ms">
        <div class="evo-tilt-inner w-full flex gap-5 items-start">
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
        </div>
      </a>`
  }).join('')
  host.querySelectorAll('.evo-tilt-card').forEach((card) => bindTiltEffect(card))
  if (window.EchoVerse && window.EchoVerse.refreshReveal) window.EchoVerse.refreshReveal()
}

// 数据加载
async function loadAllData() {
  const [projectsRaw, articlesRaw, notesRaw, settingsRaw] = await Promise.all([
    fetchProjects(),
    fetchArticles(),
    fetchNotes(),
    fetchSiteSettings()
  ])

  const projects = projectsRaw && projectsRaw.length ? projectsRaw : MOCK_PROJECTS.map((p) => ({
    id: p.id, title: p.title, category: p.category, categoryLabel: p.categoryLabel,
    year: p.year, desc: p.desc, accent: p.accent, coverImage: null, demoUrl: null, featured: p.featured || false
  }))
  const articles = articlesRaw && articlesRaw.length ? articlesRaw : MOCK_ARTICLES.map((a) => ({
    id: a.id, title: a.title, category: a.category, categoryLabel: a.categoryLabel || a.category,
    date: a.date, readTime: a.readTime, excerpt: a.excerpt, coverImage: null, featured: false
  }))
  const notes = notesRaw && notesRaw.length ? notesRaw : []

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

const CACHE_KEY = 'echoverse:home:settings'

function loadCachedSettings() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveCachedSettings(settings) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(settings))
  } catch {}
}

async function init() {
  buildStarfield()
  setupParallax()

  const cached = loadCachedSettings()
  if (cached) applySettings(cached)

  const { projects, articles, notes, settings } = await loadAllData()
  applySettings(settings)
  saveCachedSettings(settings)
  applyCounts(projects, articles, notes)
  setText('evo-home-count-owner', settings.ownerName || '—')
  renderFeaturedCarousel(projects)
  renderRecentArticles(articles)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
