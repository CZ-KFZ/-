// ============================================================
// 作品集 portfolio.js（Landing Page 版）
// 数据源：优先飞书多维表格；为空或未配置时回退到 data.js
// 结构：Hero(磁吸肖像) → Marquee(滚动跑马灯) → About(字符级动画)
//       → Services(分类列表) → Projects(堆叠缩放卡片) + Archive(筛选网格)
// ============================================================

import { fetchProjects, fetchSiteSettings } from '../feishu.js'
import { PROJECTS as MOCK_PROJECTS, PROJECT_FILTERS } from '../data.js'
import { TAG_TONE, ACCENT_GRADIENT, ACCENT_GLOW, openProjectModal } from '../project-ui.js'
import { bindTiltEffect } from '../effects.js'

let currentFilter = 'all'
let projects = []
let settings = null
let searchQuery = ''
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches

// ============================================================
// 工具：取作品封面图，没有则用渐变占位
// ============================================================
function projectCoverStyle(p) {
  const gradient = ACCENT_GRADIENT[p.accent] || ACCENT_GRADIENT.purple
  if (p.coverImage) {
    return { bg: '', img: p.coverImage, gradient }
  }
  return { bg: `linear-gradient(135deg, var(--evo-purple-700), var(--evo-cyan))`, img: '', gradient }
}

// ============================================================
// 01 · HERO 磁吸肖像
// 鼠标靠近时肖像被"吸引"产生位移，远离时回弹
// ============================================================
function updateHeroPortrait() {
  const magnet = document.getElementById('evo-pl-magnet')
  const img = magnet?.querySelector('img')
  if (!magnet || !img) return
  // 优先用飞书 settings 的头像；没有则保留默认「阴」字渐变兜底
  const src = settings?.avatarImage
  if (src) {
    img.src = src
    img.alt = settings?.ownerName ? `${settings.ownerName}的头像` : '创作者头像'
    img.style.display = 'block'
    magnet.classList.remove('evo-pl-portrait-fallback')
    img.onerror = () => {
      img.style.display = 'none'
      magnet.classList.add('evo-pl-portrait-fallback')
    }
  }
  // 没有 src：保持兜底（HTML 默认就是 fallback 状态）
}


function setupHeroMagnet() {
  if (prefersReducedMotion || isCoarsePointer) return
  const magnet = document.getElementById('evo-pl-magnet')
  if (!magnet) return
  const STRENGTH = 3
  const PADDING = 150
  let raf = 0
  let targetX = 0, targetY = 0
  let curX = 0, curY = 0

  function onMove(e) {
    const rect = magnet.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const dx = e.clientX - cx
    const dy = e.clientY - cy
    // 鼠标在 PADDING 范围内才激活
    if (Math.abs(dx) < rect.width / 2 + PADDING && Math.abs(dy) < rect.height / 2 + PADDING) {
      targetX = dx / STRENGTH
      targetY = dy / STRENGTH
      magnet.style.transition = 'transform 0.3s ease-out'
    } else {
      targetX = 0
      targetY = 0
      magnet.style.transition = 'transform 0.6s ease-in-out'
    }
    if (!raf) raf = requestAnimationFrame(tick)
  }

  function tick() {
    // 缓动逼近
    curX += (targetX - curX) * 0.18
    curY += (targetY - curY) * 0.18
    magnet.style.transform = `translate3d(${curX.toFixed(2)}px, ${curY.toFixed(2)}px, 0)`
    if (Math.abs(targetX - curX) > 0.1 || Math.abs(targetY - curY) > 0.1) {
      raf = requestAnimationFrame(tick)
    } else {
      raf = 0
    }
  }

  window.addEventListener('mousemove', onMove, { passive: true })
  // 离开窗口归位
  window.addEventListener('mouseout', (e) => {
    if (!e.relatedTarget) {
      targetX = 0; targetY = 0
      magnet.style.transition = 'transform 0.6s ease-in-out'
      if (!raf) raf = requestAnimationFrame(tick)
    }
  })
}

// ============================================================
// 02 · MARQUEE 滚动跑马灯
// 两行作品封面，随页面滚动横向位移（一行右移，一行左移）
// ============================================================
function renderMarquee() {
  const row1 = document.getElementById('evo-pl-marquee-row-1')
  const row2 = document.getElementById('evo-pl-marquee-row-2')
  if (!row1 || !row2) return

  // 用项目数据生成封面瓦片；不足则循环
  const source = projects.length ? projects : MOCK_PROJECTS
  const half = Math.ceil(source.length / 2) || 3
  const set1 = source.slice(0, half)
  const set2 = source.slice(half)

  const buildTile = (p, idx) => {
    const cover = projectCoverStyle(p)
    const firstChar = (p.title || '·').slice(0, 1)
    const imgHtml = cover.img
      ? `<img src="${cover.img}" alt="${p.title}" loading="lazy" class="evo-pl-marquee-img" />`
      : `<div class="evo-pl-marquee-gradient relative flex items-center justify-center" style="background:${cover.bg || 'linear-gradient(135deg, var(--evo-purple-700), var(--evo-cyan))'}">
          <span class="evo-title text-4xl text-white/80 drop-shadow">${firstChar}</span>
        </div>`
    return `<div class="evo-pl-marquee-tile">${imgHtml}<span class="evo-pl-marquee-label">${p.title || ''}</span></div>`
  }

  // 三倍化以无缝滚动
  const triple = (arr) => [...arr, ...arr, ...arr].map(buildTile).join('')
  row1.innerHTML = triple(set1.length ? set1 : source)
  row2.innerHTML = triple(set2.length ? set2 : source.slice(0, 3))
}

function setupMarqueeScroll() {
  if (prefersReducedMotion) return
  const section = document.getElementById('evo-pl-marquee')
  const row1 = document.getElementById('evo-pl-marquee-row-1')
  const row2 = document.getElementById('evo-pl-marquee-row-2')
  if (!section || !row1 || !row2) return

  let raf = 0
  function update() {
    raf = 0
    const rect = section.getBoundingClientRect()
    // 滚动进度：section 顶部从视口底到视口顶的过程中 0→1
    const progress = (window.innerHeight - rect.top) / (window.innerHeight + rect.height)
    const offset = progress * 600 // 位移幅度
    row1.style.transform = `translateX(${offset - 200}px)`
    row2.style.transform = `translateX(${-(offset - 200)}px)`
  }
  function onScroll() {
    if (!raf) raf = requestAnimationFrame(update)
  }
  window.addEventListener('scroll', onScroll, { passive: true })
  update()
}

// ============================================================
// 03 · ABOUT 字符级滚动揭示
// 段落里每个字符随滚动进度从 opacity 0.2 → 1
// ============================================================
function setupAboutText() {
  if (prefersReducedMotion) return
  const el = document.getElementById('evo-pl-about-text')
  if (!el) return
  const text = el.textContent.trim()
  // 包成 span，保留空格
  el.innerHTML = text.split('').map((ch) => {
    if (ch === ' ' || ch === '\n') return ch
    return `<span class="evo-pl-char">${ch}</span>`
  }).join('')

  const chars = el.querySelectorAll('.evo-pl-char')
  let raf = 0
  function update() {
    raf = 0
    const rect = el.getBoundingClientRect()
    // 段落从视口 80% 进入到 20% 退出时的进度 0→1
    const start = window.innerHeight * 0.8
    const end = window.innerHeight * 0.2
    const progress = Math.max(0, Math.min(1, (start - rect.top) / (start - end)))
    const total = chars.length
    chars.forEach((c, i) => {
      const charProgress = total > 1 ? i / (total - 1) : 1
      // 字符在该进度点之前则完全显示，否则按差值渐显
      const local = Math.max(0, Math.min(1, (progress - charProgress) * 3 + 0.2))
      c.style.opacity = (0.2 + local * 0.8).toFixed(3)
    })
  }
  function onScroll() {
    if (!raf) raf = requestAnimationFrame(update)
  }
  window.addEventListener('scroll', onScroll, { passive: true })
  update()
}

// ============================================================
// 04 · SERVICES 分类列表
// 用 PROJECT_FILTERS 作为"服务项"，统计每类作品数
// ============================================================
function renderServices() {
  const list = document.getElementById('evo-pl-services-list')
  if (!list) return

  const items = PROJECT_FILTERS.filter((f) => f.key !== 'all').map((f, i) => {
    const count = projects.filter((p) => (p.tags || []).includes(f.key) || (p.category || '') === f.key).length
    const num = String(i + 1).padStart(2, '0')
    return `
      <div class="evo-pl-service-item evo-reveal" data-reveal-delay="${i * 100}">
        <span class="evo-pl-service-num">${num}</span>
        <div class="evo-pl-service-body">
          <h3 class="evo-pl-service-name">${f.label}</h3>
          <p class="evo-pl-service-desc">该分类下 ${count} 个作品 — 点击下方筛选查看</p>
        </div>
      </div>`
  }).join('')
  list.innerHTML = items
  if (window.EchoVerse && window.EchoVerse.refreshReveal) window.EchoVerse.refreshReveal()
}

// ============================================================
// 05 · PROJECTS 堆叠缩放卡片
// 多张卡片 sticky 堆叠，滚动时下方卡片缩放变小
// ============================================================
function renderStackCards() {
  const stack = document.getElementById('evo-pl-stack')
  if (!stack) return

  // 取前 3 个作品（或 featured）做堆叠
  const featured = projects.length
    ? projects.filter((p) => p.featured).slice(0, 3)
    : []
  const list = (featured.length ? featured : projects.length ? projects.slice(0, 3) : MOCK_PROJECTS.slice(0, 3))

  const total = list.length
  stack.innerHTML = list.map((p, i) => {
    const cover = projectCoverStyle(p)
    const num = String(i + 1).padStart(2, '0')
    const targetScale = 1 - (total - 1 - i) * 0.03
    const glow = ACCENT_GLOW[p.accent] || ACCENT_GLOW.purple
    const firstChar = (p.title || '·').slice(0, 1)
    const imgHtml = cover.img
      ? `<img src="${cover.img}" alt="${p.title}" loading="lazy" class="evo-pl-stack-img" />`
      : `<div class="evo-pl-stack-gradient relative flex items-center justify-center" style="background:${cover.bg || 'linear-gradient(135deg, var(--evo-purple-700), var(--evo-cyan))'}">
          <span class="evo-title text-7xl text-white/85 drop-shadow-lg">${firstChar}</span>
          <span class="absolute top-4 right-4 w-2.5 h-2.5 rounded-full bg-white/30"></span>
        </div>`
    return `
      <div class="evo-pl-stack-card evo-feature-card" data-stack-index="${i}" data-target-scale="${targetScale}" style="top:${i * 28}px; --card-glow: ${glow};" data-project-id="${p.id}">
        <div class="evo-pl-stack-inner">
          <div class="evo-pl-stack-head">
            <span class="evo-pl-stack-num">${num}</span>
            <div class="evo-pl-stack-meta">
              <span class="evo-pl-stack-cat">${p.categoryLabel || p.category || ''}</span>
              <h3 class="evo-pl-stack-title">${p.title}</h3>
            </div>
            <button class="evo-pl-ghost-btn evo-pl-stack-btn" type="button">查看作品</button>
          </div>
          <div class="evo-pl-stack-grid">
            <div class="evo-pl-stack-col1">${imgHtml}${imgHtml}</div>
            <div class="evo-pl-stack-col2">${imgHtml}</div>
          </div>
        </div>
      </div>`
  }).join('')

  // 绑定点击 → 打开详情弹窗
  stack.querySelectorAll('[data-project-id]').forEach((card) => {
    card.addEventListener('click', (e) => {
      // 不要点"查看作品"按钮也触发，按钮自己有逻辑
      const id = card.dataset.projectId
      const project = projects.find((p) => p.id === id) || MOCK_PROJECTS.find((p) => p.id === id)
      if (project) openProjectModal(project)
    })
  })
}

function setupStackScroll() {
  if (prefersReducedMotion) return
  const stack = document.getElementById('evo-pl-stack')
  if (!stack) return
  const cards = stack.querySelectorAll('.evo-pl-stack-card')
  if (!cards.length) return

  let raf = 0
  function update() {
    raf = 0
    const stackRect = stack.getBoundingClientRect()
    cards.forEach((card, i) => {
      const targetScale = parseFloat(card.dataset.targetScale || '1')
      const cardRect = card.getBoundingClientRect()
      // 该卡片相对栈顶的进度
      const progress = Math.max(0, Math.min(1, (stackRect.top * -1 + window.innerHeight * 0.5 - cardRect.top + stackRect.top) / 300))
      // 后面的卡片随滚动放大到 1，前面的卡片随滚动缩小到 targetScale
      let scale = targetScale + (1 - targetScale) * (1 - progress)
      scale = Math.max(targetScale, Math.min(1, scale))
      card.style.transform = `scale(${scale.toFixed(3)})`
      card.style.opacity = (0.7 + 0.3 * (1 - Math.abs(scale - 1) * 4)).toFixed(3)
    })
  }
  function onScroll() {
    if (!raf) raf = requestAnimationFrame(update)
  }
  window.addEventListener('scroll', onScroll, { passive: true })
  update()
}

// ============================================================
// ARCHIVE 筛选 + 网格（保留原有能力）
// ============================================================
function renderFilters() {
  const bar = document.getElementById('evo-portfolio-filters')
  if (!bar) return
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
  const glow = ACCENT_GLOW[p.accent] || ACCENT_GLOW.purple

  // 封面：有图用图，没图用「项目首字 + 渐变 + 装饰圆点」的优雅占位
  const firstChar = (p.title || '·').slice(0, 1)
  const cover = p.coverImage
    ? `<div class="h-40 sm:h-48 overflow-hidden bg-gradient-to-br ${gradient}"><img src="${p.coverImage}" alt="${p.title}" class="w-full h-full object-cover" loading="lazy" /></div>`
    : `<div class="h-40 sm:h-48 relative bg-gradient-to-br ${gradient} flex items-center justify-center overflow-hidden">
        <span class="evo-title text-5xl sm:text-6xl text-white/85 drop-shadow-lg">${firstChar}</span>
        <span class="absolute top-3 right-3 w-2 h-2 rounded-full bg-white/30"></span>
        <span class="absolute bottom-4 left-4 w-1.5 h-1.5 rounded-full bg-white/20"></span>
      </div>`

  const videoBadge = p.video ? `<span class="px-2 py-1 rounded-[var(--evo-radius-sm)] bg-[var(--evo-pink)]/20 text-[var(--evo-pink)] text-xs">▶ 视频</span>` : ''

  return `
    <article class="group evo-glass evo-tilt-card evo-glow-card evo-feature-card evo-filter-item rounded-[var(--evo-radius-lg)] hover:bg-[var(--evo-surface-2)] transition-all hover:-translate-y-1 cursor-pointer evo-reveal" style="animation-delay:${Math.min(index * 60, 360)}ms; --card-glow: ${glow};" data-reveal-delay="${Math.min(index * 80, 400)}" data-project-id="${p.id}">
      <div class="evo-tilt-inner rounded-[var(--evo-radius-lg)] overflow-hidden">
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

  let list = currentFilter === 'all'
    ? projects
    : projects.filter((p) => {
        if (p.category === currentFilter) return true
        const f = PROJECT_FILTERS.find((x) => x.key === currentFilter)
        if (f && (p.categoryLabel === f.label || p.category === f.label)) return true
        return false
      })

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

// ============================================================
// 数据加载
// ============================================================
async function loadData() {
  // 并行拉作品 + 站点设置（含头像）
  const [raw, settingsData] = await Promise.all([fetchProjects(), fetchSiteSettings()])
  if (settingsData) settings = settingsData
  if (raw && raw.length) {
    projects = raw
    return
  }
  projects = MOCK_PROJECTS.map((p) => ({ ...p, coverImage: null, video: null, demoUrl: null }))
}

// ============================================================
// 初始化
// ============================================================
async function init() {
  // 先渲染骨架占位
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

  // Landing 部分先渲染（用 mock），数据到了再刷新
  renderMarquee()
  renderServices()

  await loadData()

  // 数据到了刷新所有 landing 区块
  updateHeroPortrait()
  renderMarquee()
  renderServices()
  renderStackCards()
  renderFilters()
  renderGrid()

  // 启动动画交互（数据渲染完后再绑定，避免空节点）
  setupHeroMagnet()
  setupMarqueeScroll()
  setupAboutText()
  setupStackScroll()

  // 补刷 reveal
  if (window.EchoVerse && window.EchoVerse.refreshReveal) window.EchoVerse.refreshReveal()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
