// ============================================================
// 共享交互动效 effects.js
// 全站通用：3D 倾斜卡片 + 鼠标光晕
// 所有页面的卡片只需加 .evo-tilt-card（外层）+ .evo-tilt-inner（内层包裹）
// ============================================================

// 3D 倾斜 + 鼠标光晕（绑定到单个卡片）
export function bindTiltEffect(card) {
  if (window.matchMedia('(pointer: coarse)').matches) return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  if (card.dataset.tiltBound === '1') return
  card.dataset.tiltBound = '1'

  let raf = null
  card.addEventListener('mousemove', (e) => {
    if (raf) return
    raf = requestAnimationFrame(() => {
      const rect = card.getBoundingClientRect()
      const px = (e.clientX - rect.left) / rect.width
      const py = (e.clientY - rect.top) / rect.height
      const tiltX = (py - 0.5) * -10  // 上下倾斜
      const tiltY = (px - 0.5) * 10   // 左右倾斜
      card.style.transform = `perspective(1000px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) translateZ(0)`
      card.style.setProperty('--mouse-x', `${px * 100}%`)
      card.style.setProperty('--mouse-y', `${py * 100}%`)
      raf = null
    })
  })
  card.addEventListener('mouseleave', () => {
    card.style.transform = ''
  })
}

// 批量绑定指定范围内所有 .evo-tilt-card
export function bindAllTiltCards(scope = document) {
  scope.querySelectorAll('.evo-tilt-card').forEach(bindTiltEffect)
}
