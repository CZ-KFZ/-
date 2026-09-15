// ============================================================
// EchoVerse · 全局脚本 main.js
// 负责：header/footer 注入、移动端抽屉、当前页高亮、滚动揭示动画
// ============================================================

import '../styles/theme.css'
import { NAV_ITEMS } from './data.js'
import { bindAllTiltCards } from './effects.js'
import { initGlobalSearch } from './search.js'

// ============================================================
// 赞赏（Donation）配置
// 在此处替换为你的真实收款链接 / 二维码图片地址
// ============================================================
const DONATION_CONFIG = {
  // 标题与文案
  title: '支持 EchoVerse',
  subtitle: '如果这里的内容对你有帮助，欢迎请我喝杯咖啡 ☕',
  // PayPal（全球用户，暂时未开通，设为 false 隐藏；开通后改成 true 并填 url）
  paypal: {
    enabled: false,
    url: 'https://paypal.me/echoverse',
    label: 'PayPal · 全球支付'
  },
  // 支付宝（二维码图片地址，可放在 /public 目录下，如 /alipay-qr.png）
  alipay: {
    enabled: true,
    qrUrl: '/alipay-qr.png',
    label: '支付宝'
  },
  // 微信支付（二维码图片地址，可放在 /public 目录下，如 /wechat-qr.png）
  wechat: {
    enabled: true,
    qrUrl: '/wechat-qr.png',
    label: '微信支付'
  }
}

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
    <header class="fixed top-0 inset-x-0 z-50 bg-transparent">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <a href="index.html" data-dom-id="nav-home-logo" class="flex items-center gap-3 shrink-0">
          <div class="w-8 h-8 rounded-[var(--evo-radius-sm)] bg-gradient-to-br from-[var(--evo-purple-500)] to-[var(--evo-cyan)] flex items-center justify-center evo-glow-purple">
            <span class="evo-title text-sm text-white font-bold">E</span>
          </div>
          <span class="evo-title text-xl evo-gradient-text">EchoVerse</span>
        </a>
        <nav class="hidden md:flex items-center gap-8">${navLinks}</nav>
        <div class="flex items-center gap-2">
          <button id="evo-search-trigger" aria-label="搜索" class="w-10 h-10 rounded-[var(--evo-radius-md)] evo-glass flex items-center justify-center text-[var(--evo-ink-2)] hover:text-[var(--evo-ink)] hover:bg-[var(--evo-surface-2)] transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          </button>
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
  initGlobalSearch()
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
// 站点导航链接
const FOOTER_NAV = [
  { label: '首页', href: 'index.html' },
  { label: '作品集', href: 'portfolio.html' },
  { label: '文章', href: 'articles.html' },
  { label: '精选合集', href: 'garden.html' },
  { label: '关于', href: 'about.html' },
  { label: '对话', href: 'chat.html' }
]

// Footer 常用社交图标（精简版，与 home.js 的社交订阅区块分工不同）
const FOOTER_SOCIAL_ICONS = {
  github: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .5C5.37.5 0 5.78 0 12.292c0 5.211 3.438 9.63 8.205 11.188.6.111.82-.254.82-.567 0-.28-.01-1.022-.015-2.005-3.338.711-4.042-1.582-4.042-1.582-.546-1.361-1.335-1.725-1.335-1.725-1.087-.731.084-.716.084-.716 1.205.082 1.838 1.215 1.838 1.215 1.07 1.802 2.809 1.281 3.495.981.109-.763.419-1.281.762-1.576-2.665-.295-5.467-1.309-5.467-5.827 0-1.287.465-2.339 1.235-3.164-.124-.298-.535-1.497.117-3.121 0 0 1.008-.316 3.3 1.209a11.542 11.542 0 0 1 3-.395c1.02.005 2.047.135 3.005.395 2.291-1.525 3.297-1.209 3.297-1.209.654 1.624.243 2.823.12 3.121.77.825 1.231 1.877 1.231 3.164 0 4.53-2.805 5.527-5.475 5.817.43.363.81 1.08.81 2.176 0 1.575-.014 2.846-.014 3.233 0 .315.21.682.825.566C20.565 21.917 24 17.495 24 12.292 24 5.78 18.63.5 12 .5z"/></svg>',
  weibo: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.6 0 12 0zm0 22C6.5 22 2 17.5 2 12S6.5 2 12 2s10 4.5 10 10-4.5 10-10 10zm-3.5-6c-2 0-3.5-1.2-3.5-2.7s1.6-2.7 3.5-2.7 3.5 1.2 3.5 2.7-1.6 2.7-3.5 2.7zm5.5-3.5c-.5 0-1-.3-1.1-.8-.1-.4 0-.9.4-1.2.4-.3 1-.3 1.4 0 .4.3.6.8.5 1.3-.1.4-.6.7-1.2.7zm3.7-3.8c-.6-.2-1.3 0-1.6.5-.3.5-.1 1.1.4 1.4.5.3 1.2.1 1.6-.4.3-.5.1-1.2-.4-1.5z"/></svg>',
  email: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>',
  rss: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/></svg>'
}

// 默认社交入口（飞书未配置时显示，确保 footer 始终饱满）
const FOOTER_DEFAULT_SOCIALS = [
  { label: 'GitHub', href: 'https://github.com', iconKey: 'github' },
  { label: '微博', href: 'https://weibo.com', iconKey: 'weibo' },
  { label: '邮箱', href: 'mailto:hello@echoverse.com', iconKey: 'email' },
  { label: 'RSS', href: '/feed.xml', iconKey: 'rss' }
]

function renderFooter() {
  const mount = document.getElementById('evo-footer')
  if (!mount) return
  const year = new Date().getFullYear()
  const navHtml = FOOTER_NAV.map(
    (n) =>
      `<a href="${n.href}" class="text-[var(--evo-ink-3)] hover:text-[var(--evo-ink)] transition-colors">${n.label}</a>`
  ).join('')
  const socialsHtml = FOOTER_DEFAULT_SOCIALS.map((s) => {
    const icon = FOOTER_SOCIAL_ICONS[s.iconKey] || ''
    return `<a href="${s.href}" target="_blank" rel="noopener" aria-label="${s.label}" class="w-9 h-9 rounded-full border border-[var(--evo-border)] text-[var(--evo-ink-3)] hover:text-[var(--evo-ink)] hover:border-[var(--evo-purple-400)]/60 hover:bg-[var(--evo-surface-2)]/50 flex items-center justify-center transition-all">${icon}</a>`
  }).join('')
  mount.innerHTML = `
    <footer class="relative border-t border-[var(--evo-border-glow)] py-12 sm:py-16 mt-20 overflow-hidden">
      <div class="absolute inset-0 pointer-events-none">
        <div class="absolute bottom-0 left-1/4 w-96 h-32 bg-[var(--evo-purple-500)]/10 blur-[100px] rounded-full"></div>
        <div class="absolute bottom-0 right-1/4 w-80 h-24 bg-[var(--evo-cyan)]/10 blur-[80px] rounded-full"></div>
      </div>
      <div class="relative max-w-7xl mx-auto px-6">
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-10 sm:gap-8">
          <!-- 左列：品牌 -->
          <div class="flex flex-col gap-3">
            <div class="flex items-center gap-2">
              <span class="w-7 h-7 rounded-[var(--evo-radius-sm)] bg-gradient-to-br from-[var(--evo-purple-500)] to-[var(--evo-cyan)] flex items-center justify-center">
                <span class="evo-title text-[11px] text-white font-bold">E</span>
              </span>
              <span class="evo-title text-[var(--evo-ink)]">EchoVerse</span>
            </div>
            <p class="text-sm text-[var(--evo-ink-3)] leading-relaxed max-w-xs">阴之体道 · 一个数字化的私人空间站，记录设计、技术与思考。</p>
          </div>
          <!-- 中列：站点导航 -->
          <div class="flex flex-col gap-2.5">
            <h4 class="text-xs tracking-[0.2em] text-[var(--evo-ink-3)] uppercase mb-1">导航</h4>
            <div class="grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
              ${navHtml}
            </div>
          </div>
          <!-- 右列：社交链接 -->
          <div class="flex flex-col gap-3">
            <h4 class="text-xs tracking-[0.2em] text-[var(--evo-ink-3)] uppercase mb-1">保持联系</h4>
            <div class="flex flex-wrap gap-2">
              ${socialsHtml}
            </div>
          </div>
        </div>
        <!-- 底部版权 -->
        <div class="mt-10 sm:mt-12 pt-6 border-t border-[var(--evo-border)]/40 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[var(--evo-ink-3)]">
          <span>© ${year} 阴之体道 · EchoVerse</span>
          <span class="text-[var(--evo-ink-3)]/70">用 ❤️ 与代码构建</span>
        </div>
      </div>
    </footer>
  `
  // 异步用飞书配置的社交链接替换默认入口（如果配了的话）
  enrichFooterSocials()
}

// 飞书配了社交链接则覆盖默认入口
async function enrichFooterSocials() {
  try {
    const { fetchSiteSettings } = await import('./feishu.js')
    const settings = await fetchSiteSettings()
    if (!settings || !Array.isArray(settings.socials) || !settings.socials.length) return
    const container = document.querySelector('#evo-footer .flex.flex-wrap.gap-2')
    if (!container) return
    const html = settings.socials
      .map((s) => {
        const label = s.label || s.title || '链接'
        const t = String(label).toLowerCase()
        let icon = ''
        for (const key of Object.keys(FOOTER_SOCIAL_ICONS)) {
          if (t.includes(key)) { icon = FOOTER_SOCIAL_ICONS[key]; break }
        }
        return `<a href="${s.url || s.link || '#'}" target="_blank" rel="noopener" aria-label="${label}" title="${label}" class="w-9 h-9 rounded-full border border-[var(--evo-border)] text-[var(--evo-ink-3)] hover:text-[var(--evo-ink)] hover:border-[var(--evo-purple-400)]/60 hover:bg-[var(--evo-surface-2)]/50 flex items-center justify-center transition-all">${icon || label.charAt(0)}</a>`
      })
      .join('')
    container.innerHTML = html
  } catch (e) {
    // 静默失败，保留默认入口
  }
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
// 赞赏浮动按钮 + 弹窗
// 按钮固定在屏幕左侧（顶部导航下方），点击弹出支付方式选择
// ------------------------------------------------------------
function openDonationModal() {
  const existing = document.getElementById('evo-donate-modal')
  if (existing) existing.remove()

  const cfg = DONATION_CONFIG
  const methods = []

  if (cfg.paypal && cfg.paypal.enabled) {
    methods.push(`
      <a href="${cfg.paypal.url}" target="_blank" rel="noopener noreferrer"
         class="evo-glass rounded-[var(--evo-radius-lg)] p-5 flex flex-col items-center gap-3 hover:bg-[var(--evo-surface-2)] hover:border-[var(--evo-cyan)]/50 transition-all group">
        <div class="w-12 h-12 rounded-full bg-[#0070ba]/15 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">💳</div>
        <span class="evo-title text-sm font-semibold text-[var(--evo-ink)]">${cfg.paypal.label}</span>
        <span class="text-xs text-[var(--evo-ink-3)]">点击前往 PayPal 支付</span>
      </a>
    `)
  }
  if (cfg.alipay && cfg.alipay.enabled) {
    const safeQrUrl = /^(https?:|\/)/i.test(String(cfg.alipay.qrUrl)) ? cfg.alipay.qrUrl : ''
    methods.push(`
      <div class="evo-glass rounded-[var(--evo-radius-lg)] p-5 flex flex-col items-center gap-3 hover:border-[var(--evo-cyan)]/50 transition-all">
        <div class="w-32 h-32 rounded-[var(--evo-radius-md)] bg-white flex items-center justify-center overflow-hidden">
          ${safeQrUrl ? `<img src="${safeQrUrl}" alt="支付宝收款码" class="w-full h-full object-contain" onerror="this.style.display='none';this.parentElement.innerHTML='<span class=\\'text-[var(--evo-ink-3)] text-xs p-2 text-center\\'>请将二维码图片放到 /public/alipay-qr.png</span>'" />` : '<span class="text-[var(--evo-ink-3)] text-xs p-2 text-center">请将二维码图片放到 /public/alipay-qr.png</span>'}
        </div>
        <span class="evo-title text-sm font-semibold text-[var(--evo-ink)]">${String(cfg.alipay.label || '支付宝').replace(/[<>"']/g, '')}</span>
        <span class="text-xs text-[var(--evo-ink-3)]">长按 / 扫码支付</span>
      </div>
    `)
  }
  if (cfg.wechat && cfg.wechat.enabled) {
    const safeQrUrl = /^(https?:|\/)/i.test(String(cfg.wechat.qrUrl)) ? cfg.wechat.qrUrl : ''
    methods.push(`
      <div class="evo-glass rounded-[var(--evo-radius-lg)] p-5 flex flex-col items-center gap-3 hover:border-[var(--evo-pink)]/50 transition-all">
        <div class="w-32 h-32 rounded-[var(--evo-radius-md)] bg-white flex items-center justify-center overflow-hidden">
          ${safeQrUrl ? `<img src="${safeQrUrl}" alt="微信收款码" class="w-full h-full object-contain" onerror="this.style.display='none';this.parentElement.innerHTML='<span class=\\'text-[var(--evo-ink-3)] text-xs p-2 text-center\\'>请将二维码图片放到 /public/wechat-qr.png</span>'" />` : '<span class="text-[var(--evo-ink-3)] text-xs p-2 text-center">请将二维码图片放到 /public/wechat-qr.png</span>'}
        </div>
        <span class="evo-title text-sm font-semibold text-[var(--evo-ink)]">${String(cfg.wechat.label || '微信支付').replace(/[<>"']/g, '')}</span>
        <span class="text-xs text-[var(--evo-ink-3)]">长按 / 扫码支付</span>
      </div>
    `)
  }

  const modal = document.createElement('div')
  modal.id = 'evo-donate-modal'
  modal.className = 'fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm'
  modal.innerHTML = `
    <div class="evo-glass max-w-md w-full rounded-[var(--evo-radius-xl)] p-6 md:p-8 relative" onclick="event.stopPropagation()">
      <button class="absolute top-4 right-4 w-9 h-9 rounded-full hover:bg-[var(--evo-surface-2)] text-[var(--evo-ink-2)] hover:text-white transition-colors flex items-center justify-center" id="evo-donate-close" aria-label="关闭">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      <div class="text-center mb-6">
        <div class="text-5xl mb-3 evo-animate-float">☕</div>
        <h3 class="evo-title text-2xl mb-2 evo-gradient-text">${cfg.title}</h3>
        <p class="text-sm text-[var(--evo-ink-2)]">${cfg.subtitle}</p>
      </div>
      <div class="grid gap-4 ${methods.length > 1 ? 'sm:grid-cols-2' : 'grid-cols-1'}">
        ${methods.join('')}
      </div>
      <p class="text-center text-xs text-[var(--evo-ink-3)] mt-6">感谢你的支持，每一份心意都是创作的动力 ✨</p>
    </div>
  `
  modal.addEventListener('click', () => modal.remove())
  modal.querySelector('#evo-donate-close').addEventListener('click', () => modal.remove())
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      modal.remove()
      document.removeEventListener('keydown', escHandler)
    }
  }
  document.addEventListener('keydown', escHandler)
  document.body.appendChild(modal)
}

function renderDonationButton() {
  // 只渲染一次
  if (document.getElementById('evo-donate-btn')) return
  const btn = document.createElement('button')
  btn.id = 'evo-donate-btn'
  btn.setAttribute('aria-label', '赞赏支持')
  btn.className = 'evo-donate-fab'
  btn.innerHTML = `
    <span class="evo-donate-fab-icon">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
    </span>
    <span class="evo-donate-fab-label">赞赏</span>
  `
  btn.addEventListener('click', openDonationModal)
  document.body.appendChild(btn)
}

// ------------------------------------------------------------
// 全局背景注入（首页已有 #evo-hero-bg，其他页面注入相同背景）
// ------------------------------------------------------------
function injectGlobalBg() {
  // 首页已有自己的背景，跳过
  if (document.getElementById('evo-hero-bg')) return
  // 已注入过则跳过
  if (document.getElementById('evo-global-bg')) return

  const bg = document.createElement('div')
  bg.id = 'evo-global-bg'
  bg.className = 'fixed inset-0 pointer-events-none -z-10'
  bg.innerHTML = `
    <video
      class="absolute inset-0 w-full h-full object-cover object-bottom"
      muted
      autoplay
      loop
      playsinline
      preload="auto"
    >
      <source src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260405_074625_a81f018a-956b-43fb-9aee-4d1508e30e6a.mp4" type="video/mp4" />
    </video>
    <div class="absolute inset-0 bg-black/5"></div>
  `
  // 放到 body 最前面，确保在内容之下
  document.body.insertBefore(bg, document.body.firstChild)
  // 确保 body 是黑色背景，防止视频加载时白屏
  document.body.classList.add('bg-black')
}

// ------------------------------------------------------------
// 预加载赞赏收款码图片：页面加载时就缓存，点开弹窗瞬间显示
// ------------------------------------------------------------
function preloadDonationImages() {
  const urls = []
  if (DONATION_CONFIG.alipay?.enabled) urls.push(DONATION_CONFIG.alipay.qrUrl)
  if (DONATION_CONFIG.wechat?.enabled) urls.push(DONATION_CONFIG.wechat.qrUrl)
  urls.forEach((src) => {
    const img = new Image()
    img.src = src
  })
}

// ------------------------------------------------------------
// 初始化入口
// ------------------------------------------------------------
function init() {
  injectGlobalBg()
  renderHeader()
  renderFooter()
  renderDonationButton()
  preloadDonationImages()
  setupReveal()
  bindAllTiltCards()
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
  refreshReveal: () => { setupReveal(); bindAllTiltCards() },
  bindTilt: bindAllTiltCards
}
