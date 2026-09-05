// ============================================================
// EchoVerse · 全局脚本 main.js
// 负责：header/footer 注入、移动端抽屉、当前页高亮、滚动揭示动画
// ============================================================

import '../styles/theme.css'
import { NAV_ITEMS } from './data.js'

// ------------------------------------------------------------
// 工具：当前页面 key（基于 URL 文件名）
// ------------------------------------------------------------
function getCurrentPageKey() {
  const path = window.location.pathname.split('/').pop() || 'index.html'
  if (path === '' || path === 'index.html') return 'home'
  return path.replace('.html', '')
}

// ------------------------------------------------------------
// Header 注入
// 设计稿原结构：固定顶部玻璃态 header，左 Logo，中导航，右 CTA
// 扩展：移动端增加汉堡按钮触发抽屉
// ------------------------------------------------------------
function renderHeader() {
  const mount = document.getElementById('evo-header')
  if (!mount) return
  const current = getCurrentPageKey()

  const navLinks = NAV_ITEMS.map((item) => {
    const isActive = item.key === current
    const cls = isActive
      ? 'text-[var(--evo-ink)] transition-colors text-sm font-medium'
      : 'text-[var(--evo-ink-2)] hover:text-[var(--evo-ink)] transition-colors text-sm font-medium'
    return `<a href="${item.href}" data-nav-key="${item.key}" class="${cls}">${item.label}</a>`
  }).join('')

  // 移动端抽屉里的导航
  const drawerLinks = NAV_ITEMS.map((item) => {
    const isActive = item.key === current
    const cls = isActive
      ? 'block px-4 py-3 rounded-[var(--evo-radius-md)] bg-[var(--evo-surface-2)] text-[var(--evo-ink)] text-base font-medium'
      : 'block px-4 py-3 rounded-[var(--evo-radius-md)] text-[var(--evo-ink-2)] hover:bg-[var(--evo-surface-2)] hover:text-[var(--evo-ink)] transition-colors text-base'
    return `<a href="${item.href}" data-drawer-link class="${cls}">${item.label}</a>`
  }).join('')

  mount.innerHTML = `
    <header class="fixed top-0 inset-x-0 z-50 evo-glass-ultra shadow-[0_4px_30px_rgba(0,0,0,0.3)]">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <a href="index.html" data-dom-id="nav-home-logo" class="flex items-center gap-3 shrink-0">
          <div class="w-8 h-8 rounded-[var(--evo-radius-sm)] bg-gradient-to-br from-[var(--evo-purple-500)] to-[var(--evo-cyan)] flex items-center justify-center evo-glow-purple">
            <span class="evo-title text-sm text-white font-bold">E</span>
          </div>
          <span class="evo-title text-xl evo-gradient-text">EchoVerse</span>
        </a>
        <nav class="hidden md:flex items-center gap-8">${navLinks}</nav>
        <div class="flex items-center gap-2">
          <a href="chat.html" data-dom-id="cta-header-chat" class="hidden sm:inline-flex px-4 py-2 rounded-[var(--evo-radius-md)] bg-gradient-to-r from-[var(--evo-purple-500)] to-[var(--evo-cyan)] text-white text-sm font-medium hover:opacity-90 transition-all evo-glow-purple">对话</a>
          <button id="evo-menu-btn" aria-label="打开菜单" class="md:hidden w-10 h-10 rounded-[var(--evo-radius-md)] evo-glass flex items-center justify-center text-[var(--evo-ink)] hover:bg-[var(--evo-surface-2)] transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
          </button>
        </div>
      </div>
    </header>
    <!-- 移动端抽屉 -->
    <div id="evo-drawer-overlay" class="evo-drawer-overlay md:hidden"></div>
    <aside id="evo-drawer" class="md:hidden fixed top-0 right-0 z-[70] h-full w-72 max-w-[80vw] evo-glass-strong border-l border-[var(--evo-border-glow)] translate-x-full transition-transform duration-300 ease-out">
      <div class="flex items-center justify-between p-4 border-b border-[var(--evo-border)]">
        <span class="flex items-center gap-2">
          <span class="w-7 h-7 rounded-[var(--evo-radius-sm)] bg-gradient-to-br from-[var(--evo-purple-500)] to-[var(--evo-cyan)] flex items-center justify-center evo-glow-purple">
            <span class="evo-title text-xs text-white font-bold">E</span>
          </span>
          <span class="evo-title text-lg evo-gradient-text">EchoVerse</span>
        </span>
        <button id="evo-drawer-close" aria-label="关闭菜单" class="w-9 h-9 rounded-[var(--evo-radius-md)] hover:bg-[var(--evo-surface-2)] flex items-center justify-center text-[var(--evo-ink-2)] transition-colors">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <nav class="p-3 space-y-1">${drawerLinks}</nav>
      <div class="px-4 mt-6 pt-6 border-t border-[var(--evo-border)]">
        <a href="chat.html" class="block w-full text-center px-4 py-3 rounded-[var(--evo-radius-md)] bg-gradient-to-r from-[var(--evo-purple-500)] to-[var(--evo-cyan)] text-white text-sm font-medium hover:opacity-90 transition-all evo-glow-purple">和 Echo 聊聊 →</a>
      </div>
    </aside>
  `
  setupDrawer()
}

// ------------------------------------------------------------
// 移动端抽屉交互
// ------------------------------------------------------------
function setupDrawer() {
  const btn = document.getElementById('evo-menu-btn')
  const closeBtn = document.getElementById('evo-drawer-close')
  const drawer = document.getElementById('evo-drawer')
  const overlay = document.getElementById('evo-drawer-overlay')
  if (!btn || !drawer || !overlay) return

  const open = () => {
    drawer.classList.remove('translate-x-full')
    overlay.classList.add('is-open')
    document.body.style.overflow = 'hidden'
  }
  const close = () => {
    drawer.classList.add('translate-x-full')
    overlay.classList.remove('is-open')
    document.body.style.overflow = ''
  }
  btn.addEventListener('click', open)
  closeBtn.addEventListener('click', close)
  overlay.addEventListener('click', close)
  drawer.querySelectorAll('[data-drawer-link]').forEach((a) => a.addEventListener('click', close))
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('is-open')) close()
  })
}

// ------------------------------------------------------------
// Footer 注入
// ------------------------------------------------------------
function renderFooter() {
  const mount = document.getElementById('evo-footer')
  if (!mount) return
  mount.innerHTML = `
    <footer class="relative border-t border-[var(--evo-border-glow)] py-12 mt-20 overflow-hidden">
      <div class="absolute inset-0 pointer-events-none">
        <div class="absolute bottom-0 left-1/4 w-96 h-32 bg-[var(--evo-purple-500)]/10 blur-[100px] rounded-full"></div>
        <div class="absolute bottom-0 right-1/4 w-80 h-24 bg-[var(--evo-cyan)]/10 blur-[80px] rounded-full"></div>
      </div>
      <div class="relative max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-[var(--evo-ink-3)] text-sm">
        <div class="flex items-center gap-2">
          <span class="w-6 h-6 rounded-[var(--evo-radius-sm)] bg-gradient-to-br from-[var(--evo-purple-500)] to-[var(--evo-cyan)] flex items-center justify-center">
            <span class="evo-title text-[10px] text-white font-bold">E</span>
          </span>
          <span class="evo-title">EchoVerse</span>
        </div>
        <span>© 2026 阴之体道 · 个人数字化空间站</span>
      </div>
    </footer>
  `
}

// ------------------------------------------------------------
// 滚动揭示动画（IntersectionObserver）
// 给所有 .evo-reveal 元素在进入视口时添加 .is-visible
// ------------------------------------------------------------
function setupReveal() {
  const els = document.querySelectorAll('.evo-reveal')
  if (!els.length) return

  // 不支持 IO 或 prefers-reduced-motion：直接全部显示
  if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    els.forEach((el) => el.classList.add('is-visible'))
    return
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          // 支持 data-reveal-delay 错峰
          const delay = entry.target.dataset.revealDelay
          if (delay) entry.target.style.transitionDelay = `${delay}ms`
          entry.target.classList.add('is-visible')
          io.unobserve(entry.target)
        }
      })
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
  )
  els.forEach((el) => io.observe(el))
}

// ------------------------------------------------------------
// 页面切换淡入（提升多页跳转的连续感）
// ------------------------------------------------------------
function setupPageEnter() {
  document.body.classList.add('evo-animate-fade-in')
}

// ------------------------------------------------------------
// 初始化入口
// ------------------------------------------------------------
function init() {
  renderHeader()
  renderFooter()
  setupReveal()
  setupPageEnter()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}

// 暴露给页面脚本使用的工具
window.EchoVerse = {
  getCurrentPageKey,
  refreshReveal: setupReveal
}
