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
  // 描述性文案 + 数据：比"N 个项目"更有质感
  setText('evo-home-count-projects', `${projects.length} 件作品 · 创造的过程`)
  setText('evo-home-count-articles', `${articles.length} 篇 · 设计、技术与思考`)
  setText('evo-home-count-notes', `${notes.length} 个 · 系列文章打包`)
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
          ${p.outcome ? `<div class="flex items-center gap-2 mb-2"><span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--evo-cyan)]/20 text-[var(--evo-cyan)] text-xs font-medium"><span aria-hidden="true">↗</span>${p.outcome}</span></div>` : ''}
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
    <div class="relative rounded-[var(--evo-radius-lg)] overflow-hidden evo-glass evo-tilt-card evo-glow-card evo-reveal" style="aspect-ratio: 21/9; min-height: 280px;">
      <div class="evo-tilt-inner relative w-full h-full">
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
  const items = articles.filter((a) => !a.hidden)
  // featured 优先，然后按日期倒序
  items.sort((a, b) => {
    if ((b.featured ? 1 : 0) !== (a.featured ? 1 : 0)) return (b.featured ? 1 : 0) - (a.featured ? 1 : 0)
    return (b.date || '').localeCompare(a.date || '')
  })
  // 第一篇做大卡（精选/最近），其余 3 篇做小条目
  const [feature, ...rest] = items.slice(0, 4)
  if (!feature) {
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
  const toneOf = (a) => CAT_TONE[a.category] || CAT_TONE.design

  // —— 第一篇：大卡（带封面、完整摘要、3D 倾斜）
  const fTone = toneOf(feature)
  const fCover = feature.coverImage
    ? `<div class="shrink-0 w-full md:w-64 aspect-[16/10] rounded-[var(--evo-radius-md)] overflow-hidden"><img src="${feature.coverImage}" alt="${feature.title}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" /></div>`
    : ''
  const featureHtml = `
    <a href="articles.html" class="group evo-glass evo-tilt-card evo-glow-card rounded-[var(--evo-radius-lg)] p-6 sm:p-8 flex flex-col md:flex-row gap-6 hover:bg-[var(--evo-surface-2)] transition-all evo-reveal evo-filter-item" data-reveal-delay="0">
      <div class="evo-tilt-inner w-full flex flex-col md:flex-row gap-6">
        ${fCover}
        <div class="flex-1 min-w-0">
          <div class="flex flex-wrap items-center gap-2 mb-3">
            <span class="px-2 py-1 rounded-[var(--evo-radius-sm)] ${fTone} text-xs">${feature.categoryLabel || feature.category}</span>
            <span class="text-xs text-[var(--evo-ink-3)]">${feature.date || ''}</span>
            ${feature.readTime ? `<span class="text-xs text-[var(--evo-ink-3)]">${feature.readTime}</span>` : ''}
          </div>
          <h3 class="evo-title text-xl sm:text-2xl mb-2 group-hover:text-[var(--evo-cyan)] transition-colors leading-snug">${feature.title}</h3>
          ${feature.outcome ? `<div class="flex items-center gap-2 mb-3"><span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--evo-cyan)]/15 text-[var(--evo-cyan)] text-xs font-medium"><span aria-hidden="true">↗</span>${feature.outcome}</span></div>` : '<div class="mb-3"></div>'}
          <p class="text-sm text-[var(--evo-ink-2)] leading-relaxed line-clamp-3">${feature.excerpt || ''}</p>
        </div>
      </div>
    </a>`

  // —— 其余：小条目（无封面、单行标题、紧凑元信息）
  const restHtml = rest.map((a, i) => {
    const tone = toneOf(a)
    return `
      <a href="articles.html" class="group evo-glass rounded-[var(--evo-radius-md)] p-4 flex items-center gap-3 hover:bg-[var(--evo-surface-2)] hover:-translate-y-0.5 transition-all evo-reveal evo-filter-item" data-reveal-delay="${Math.min((i + 1) * 80, 400)}">
        <span class="px-2 py-0.5 rounded-[var(--evo-radius-sm)] ${tone} text-[11px] shrink-0">${a.categoryLabel || a.category}</span>
        <span class="evo-title text-sm flex-1 min-w-0 truncate group-hover:text-[var(--evo-cyan)] transition-colors">${a.title}</span>
        <span class="text-xs text-[var(--evo-ink-3)] shrink-0 hidden sm:inline">${(a.date || '').replace(/\.*/, '')}</span>
      </a>`
  }).join('')

  host.innerHTML = featureHtml + restHtml
  host.querySelectorAll('.evo-tilt-card').forEach((card) => bindTiltEffect(card))
  if (window.EchoVerse && window.EchoVerse.refreshReveal) window.EchoVerse.refreshReveal()
}

// ------------------------------------------------------------
// 社交订阅区块：渲染社交链接 + 邮箱订阅表单
// ------------------------------------------------------------
// 常用平台的图标映射：用 SVG 内联，避免外部图标库依赖
const SOCIAL_ICONS = {
  github: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .5C5.37.5 0 5.78 0 12.292c0 5.211 3.438 9.63 8.205 11.188.6.111.82-.254.82-.567 0-.28-.01-1.022-.015-2.005-3.338.711-4.042-1.582-4.042-1.582-.546-1.361-1.335-1.725-1.335-1.725-1.087-.731.084-.716.084-.716 1.205.082 1.838 1.215 1.838 1.215 1.07 1.802 2.809 1.281 3.495.981.109-.763.419-1.281.762-1.576-2.665-.295-5.467-1.309-5.467-5.827 0-1.287.465-2.339 1.235-3.164-.124-.298-.535-1.497.117-3.121 0 0 1.008-.316 3.3 1.209a11.542 11.542 0 0 1 3-.395c1.02.005 2.047.135 3.005.395 2.291-1.525 3.297-1.209 3.297-1.209.654 1.624.243 2.823.12 3.121.77.825 1.231 1.877 1.231 3.164 0 4.53-2.805 5.527-5.475 5.817.43.363.81 1.08.81 2.176 0 1.575-.014 2.846-.014 3.233 0 .315.21.682.825.566C20.565 21.917 24 17.495 24 12.292 24 5.78 18.63.5 12 .5z"/></svg>',
  twitter: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.46l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
  x: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.46l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
  weibo: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.6 0 12 0zm0 22C6.5 22 2 17.5 2 12S6.5 2 12 2s10 4.5 10 10-4.5 10-10 10zm-3.5-6c-2 0-3.5-1.2-3.5-2.7s1.6-2.7 3.5-2.7 3.5 1.2 3.5 2.7-1.6 2.7-3.5 2.7zm5.5-3.5c-.5 0-1-.3-1.1-.8-.1-.4 0-.9.4-1.2.4-.3 1-.3 1.4 0 .4.3.6.8.5 1.3-.1.4-.6.7-1.2.7zm3.7-3.8c-.6-.2-1.3 0-1.6.5-.3.5-.1 1.1.4 1.4.5.3 1.2.1 1.6-.4.3-.5.1-1.2-.4-1.5zm-2-2.2c-.3-.1-.6 0-.7.3-.1.3 0 .6.3.7.3.1.6 0 .7-.3.1-.3-.1-.6-.3-.7zm-1.5-.7c-.2-.1-.4 0-.5.2-.1.2 0 .4.2.5.2.1.4 0 .5-.2.1-.2 0-.4-.2-.5z"/></svg>',
  email: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>',
  mail: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>',
  rss: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/></svg>',
  bilibili: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.574 1.004.995 1.524 2.249 1.56 3.76v7.36c-.036 1.51-.556 2.769-1.56 3.773s-2.262 1.524-3.773 1.56H5.333c-1.51-.036-2.769-.556-3.773-1.56S.036 18.858 0 17.347v-7.36c.036-1.511.556-2.765 1.56-3.76 1.004-.996 2.262-1.52 3.773-1.574h.774l-1.174-1.12a1.234 1.234 0 0 1-.373-.906c0-.356.124-.658.373-.907l.027-.027c.267-.249.573-.373.92-.373.347 0 .653.124.92.373L15.287 4.653h2.526zM5.4 9.333c-.676 0-1.254.236-1.733.708-.478.472-.755 1.058-.755 1.758v5.067c0 .7.277 1.286.755 1.758.479.472 1.057.708 1.733.708h13.227c.675 0 1.253-.236 1.732-.708.479-.472.756-1.058.756-1.758v-5.067c0-.7-.277-1.286-.756-1.758-.479-.472-1.057-.708-1.732-.708H5.4zm2.853 3.734c-.249 0-.463-.082-.642-.248a.82.82 0 0 1-.266-.621c0-.249.085-.46.256-.635a.86.86 0 0 1 .652-.262h2.293a.86.86 0 0 1 .652.262c.171.175.256.386.256.635 0 .249-.085.46-.256.621a.86.86 0 0 1-.652.262H8.253zm6.24 0c-.249 0-.463-.082-.641-.248a.82.82 0 0 1-.267-.621c0-.249.085-.46.267-.635a.86.86 0 0 1 .651-.262h2.294a.86.86 0 0 1 .651.262c.172.175.257.386.257.635 0 .249-.085.46-.257.621a.86.86 0 0 1-.651.262h-2.294z"/></svg>',
  wechat: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.144-.048.219 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.902-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.85-2.617.157-4.792 1.932-6.025 1.863-1.285 4.145-1.406 5.844-1.027-.604-3.955-4.358-7.013-8.566-7.013zM5.785 5.991c.642 0 1.162.524 1.162 1.17 0 .645-.52 1.168-1.162 1.168-.642 0-1.162-.523-1.162-1.168 0-.646.52-1.17 1.162-1.17zm5.813 0c.642 0 1.162.524 1.162 1.17 0 .645-.52 1.168-1.162 1.168-.642 0-1.162-.523-1.162-1.168 0-.646.52-1.17 1.162-1.17zm5.34 4.987c-3.75 0-6.787 2.686-6.787 6.005 0 1.208.413 2.254 1.098 3.15a.49.49 0 0 1 .122.498l-.323 1.223c-.018.06-.04.122-.04.183 0 .135.108.245.241.245a.265.265 0 0 0 .14-.046l1.546-.91a.715.715 0 0 1 .594-.081 8.31 8.31 0 0 0 2.345.336c3.75 0 6.787-2.686 6.787-6.005 0-3.32-3.037-5.998-6.787-5.998zm-2.381 3.275c.534 0 .967.437.967.975 0 .538-.433.975-.967.975-.534 0-.968-.437-.968-.975 0-.538.434-.975.968-.975zm4.812 0c.534 0 .968.437.968.975 0 .538-.434.975-.968.975-.534 0-.967-.437-.967-.975 0-.538.433-.975.967-.975z"/></svg>',
  youtube: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.546 15.568V8.432L15.818 12l-6.272 3.568z"/></svg>'
}

// 根据社交链接标题匹配图标（大小写不敏感，含关键词即匹配）
function getSocialIcon(title) {
  if (!title) return ''
  const t = String(title).toLowerCase()
  for (const key of Object.keys(SOCIAL_ICONS)) {
    if (t.includes(key)) return SOCIAL_ICONS[key]
  }
  return '' // 没匹配到则用配置里的 label 字符
}

function renderSocialsSection(socials) {
  const box = document.getElementById('evo-home-socials')
  if (!box) return

  // 社交链接为空：只隐藏社交图标行，保留区块本身和邮箱订阅表单
  if (!socials || !socials.length) {
    box.style.display = 'none'
    // 同时隐藏"或通过邮件订阅"那行引导文字，因为没有了社交渠道做对比
    const subscribeHint = document.querySelector('#evo-home-subscribe')?.previousElementSibling
    if (subscribeHint) subscribeHint.style.display = 'none'
    return
  }

  box.innerHTML = socials.map((s) => {
    const iconHtml = getSocialIcon(s.title) || (s.label && s.label !== '·' ? s.label : '·')
    const label = s.title || ''
    return `<a href="${s.href || '#'}" title="${label}" aria-label="${label}" target="_blank" rel="noopener noreferrer"
        class="evo-tilt-card group w-12 h-12 sm:w-14 sm:h-14 rounded-full evo-glass flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 hover:scale-110 hover:border-white/30 transition-all border border-white/10">
      <span class="evo-tilt-inner">${iconHtml}</span>
    </a>`
  }).join('')

  // 绑定 3D 倾斜
  box.querySelectorAll('.evo-tilt-card').forEach((card) => bindTiltEffect(card))

  if (window.EchoVerse && window.EchoVerse.refreshReveal) window.EchoVerse.refreshReveal()
}

// 邮箱订阅：前端纯展示，复制邮箱到剪贴板 + 提示
function setupSubscribeForm() {
  const form = document.getElementById('evo-home-subscribe')
  const msg = document.getElementById('evo-subscribe-msg')
  if (!form || !msg) return

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const input = form.querySelector('input[type="email"]')
    const email = input.value.trim()
    if (!email) return

    const submitBtn = form.querySelector('button[type="submit"]')
    const originalText = submitBtn.textContent
    submitBtn.disabled = true
    submitBtn.textContent = '订阅中…'

    try {
      // 没有后端：尝试复制邮箱到剪贴板，引导用户通过邮件联系
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(email)
        msg.textContent = '✓ 已记录邮箱，请通过上方社交渠道联系我完成订阅'
        msg.className = 'mt-3 text-xs h-4 text-[var(--evo-state-success)] transition-colors'
      } else {
        msg.textContent = '✓ 感谢订阅，请通过上方社交渠道联系我'
        msg.className = 'mt-3 text-xs h-4 text-[var(--evo-state-success)] transition-colors'
      }
      input.value = ''
    } catch {
      msg.textContent = '订阅功能暂时不可用，请通过上方社交渠道联系'
      msg.className = 'mt-3 text-xs h-4 text-[var(--evo-state-warning)] transition-colors'
    } finally {
      submitBtn.disabled = false
      submitBtn.textContent = originalText
      // 3 秒后清空提示
      setTimeout(() => {
        msg.textContent = ''
        msg.className = 'mt-3 text-xs h-4 text-white/50 transition-colors'
      }, 3500)
    }
  })
}

// ------------------------------------------------------------
// "我是谁"叙事区块：身份描述 + 简介 + 技能标签 + 数据条
// ------------------------------------------------------------
const ABOUT_DEFAULT_BIO = '我是阴之体道，一个把设计、技术与生活思考编织成知识网络的创作者。这里记录我在数字分身时代的探索——从代码到文字，从作品到对话，慢慢长成一座可被探索的空间站。'
const ABOUT_DEFAULT_IDENTITY = '设计师 · 开发者 · 数字游民'
const ABOUT_DEFAULT_SKILLS = ['设计', '前端开发', '写作', '产品思考', '影像实验']

// 技能标签的配色（按位置循环）
const SKILL_TONES = [
  'bg-[var(--evo-purple-500)]/15 text-[var(--evo-purple-300)] border-[var(--evo-purple-400)]/30',
  'bg-[var(--evo-cyan)]/15 text-[var(--evo-cyan)] border-[var(--evo-cyan)]/30',
  'bg-[var(--evo-pink)]/15 text-[var(--evo-pink)] border-[var(--evo-pink)]/30',
  'bg-[var(--evo-violet)]/15 text-[var(--evo-violet)] border-[var(--evo-violet)]/30',
  'bg-[var(--evo-purple-700)]/15 text-[var(--evo-purple-400)] border-[var(--evo-purple-700)]/30'
]

function renderAboutSection(settings, projects, articles, notes) {
  // 身份描述（eyebrow）
  const identityEl = document.getElementById('evo-home-about-identity')
  if (identityEl) identityEl.textContent = settings.identity || ABOUT_DEFAULT_IDENTITY

  // 叙事段落：飞书配置的 bio 大于 20 字时用，否则用默认叙事
  const bioEl = document.getElementById('evo-home-about-bio')
  if (bioEl) bioEl.textContent = settings.bio && settings.bio.length > 20 ? settings.bio : ABOUT_DEFAULT_BIO

  // 技能标签：飞书配置的 skills 优先，否则用默认
  const skillsEl = document.getElementById('evo-home-about-skills')
  if (skillsEl) {
    const skills = (settings.skills && settings.skills.length)
      ? settings.skills.map((s) => (typeof s === 'string' ? s : s.label)).filter(Boolean)
      : ABOUT_DEFAULT_SKILLS
    skillsEl.innerHTML = skills.map((label, i) => {
      const tone = SKILL_TONES[i % SKILL_TONES.length]
      return `<span class="px-3 py-1 rounded-full text-xs sm:text-sm border ${tone} transition-colors">${label}</span>`
    }).join('')
  }

  // 数据条：直接从已加载的数据算，进入视口时触发递增动画
  const stats = [
    { id: 'evo-home-stat-articles', value: (articles && articles.length) || 0 },
    { id: 'evo-home-stat-collections', value: (notes && notes.length) || 0 },
    { id: 'evo-home-stat-projects', value: (projects && projects.length) || 0 }
  ]
  // 先把所有数字置 0，避免 IntersectionObserver 触发前显示终值
  stats.forEach((s) => setText(s.id, '0'))
  animateStatsOnScroll(stats)
}

// ------------------------------------------------------------
// "此刻在做"区块：展示当前正在进行的事（Now page 概念）
// 数据来源：settings.nowItems（飞书可配），否则用默认活动列表
// ------------------------------------------------------------
const NOW_DEFAULT_ITEMS = [
  { icon: '✍️', label: '正在写', text: '一篇关于数字分身与创作脉络的长文' },
  { icon: '📖', label: '正在读', text: '《思考，快与慢》Daniel Kahneman' },
  { icon: '🔧', label: '正在做', text: 'EchoVerse 空间站持续迭代中' },
  { icon: '🎨', label: '正在学', text: 'WebGL 创意编程与生成艺术' }
]

// 每张卡片的强调色（按位置循环，跟技能标签同源）
const NOW_TONES = [
  'text-[var(--evo-purple-300)]',
  'text-[var(--evo-cyan)]',
  'text-[var(--evo-pink)]',
  'text-[var(--evo-violet)]'
]

function renderNowSection(settings) {
  const host = document.getElementById('evo-home-now-items')
  if (!host) return

  // 飞书配置优先，否则用默认
  const items = (settings.nowItems && settings.nowItems.length)
    ? settings.nowItems.map((n) => ({
        icon: n.icon || '·',
        label: n.label || '',
        text: n.text || ''
      }))
    : NOW_DEFAULT_ITEMS

  host.innerHTML = items.map((item, i) => {
    const tone = NOW_TONES[i % NOW_TONES.length]
    return `
      <div class="evo-glass evo-tilt-card rounded-[var(--evo-radius-md)] p-4 sm:p-5 hover:bg-[var(--evo-surface-2)] hover:-translate-y-1 transition-all evo-reveal evo-filter-item" data-reveal-delay="${i * 80}">
        <div class="evo-tilt-inner">
          <div class="text-2xl mb-3">${item.icon}</div>
          <p class="text-xs ${tone} mb-1.5 tracking-wide">${item.label}</p>
          <p class="text-sm text-white/75 leading-relaxed">${item.text}</p>
        </div>
      </div>`
  }).join('')

  // 绑定 3D 倾斜
  host.querySelectorAll('.evo-tilt-card').forEach((card) => bindTiltEffect(card))

  // 最后更新时间：用飞书配置的日期，否则显示今天
  const updatedEl = document.getElementById('evo-home-now-updated')
  if (updatedEl) {
    const dateStr = settings.nowUpdated || new Date().toISOString().slice(0, 10)
    updatedEl.textContent = `最后更新于 ${dateStr}`
  }

  if (window.EchoVerse && window.EchoVerse.refreshReveal) window.EchoVerse.refreshReveal()
}

// ------------------------------------------------------------
// 数字递增动画：元素进入视口时从 0 滚到目标值（ease-out-cubic）
// ------------------------------------------------------------
function animateStatsOnScroll(stats) {
  const container = document.querySelector('#evo-home-about-skills')?.parentElement
  // 不支持 IO 或用户禁用动画 → 直接显示终值
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!container || !('IntersectionObserver' in window) || reduceMotion) {
    stats.forEach((s) => setText(s.id, String(s.value)))
    return
  }
  const triggered = { done: false }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting && !triggered.done) {
        triggered.done = true
        stats.forEach((s) => animateCount(s.id, s.value))
        io.disconnect()
      }
    })
  }, { threshold: 0.3 })
  io.observe(container)
}

// 从 0 滚到 target 的 ease-out 动画，时长 1.2s
function animateCount(id, target) {
  const el = document.getElementById(id)
  if (!el) return
  if (target <= 0) { el.textContent = '0'; return }
  const duration = 1200
  const start = performance.now()
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3)
  const tick = (now) => {
    const elapsed = now - start
    const t = Math.min(1, elapsed / duration)
    const v = Math.round(target * easeOutCubic(t))
    el.textContent = String(v)
    if (t < 1) requestAnimationFrame(tick)
    else el.textContent = String(target)
  }
  requestAnimationFrame(tick)
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
  // "关于我"卡片副标：用身份描述比纯名字更有吸引力，没配身份描述时回退到"认识幕后的我"
  setText('evo-home-count-owner', settings.identity || '认识幕后的我')
  renderFeaturedCarousel(projects)
  renderRecentArticles(articles)
  // 社交订阅区块（settings.socials 来自飞书 siteSettings）
  renderSocialsSection(settings.socials)
  setupSubscribeForm()
  // "我是谁"叙事区块：承接 Hero 的人格化叙事
  renderAboutSection(settings, projects, articles, notes)
  // "此刻在做"区块：展示当前正在进行的事
  renderNowSection(settings)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
