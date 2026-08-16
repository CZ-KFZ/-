// ============================================================
// 首页 home.js
// 1) 生成星空背景（轻量，含闪烁动画）
// 2) 鼠标视差：Hero 光晕随鼠标轻微移动
// ============================================================

// 生成星空：在 #evo-hero-bg 内插入若干闪烁的小点
function buildStarfield() {
  const bg = document.getElementById('evo-hero-bg')
  if (!bg) return
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
  if (window.matchMedia('(pointer: coarse)').matches) return // 触屏跳过
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

function init() {
  buildStarfield()
  setupParallax()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
