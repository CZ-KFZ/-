// ============================================================
// aid.js — 「给她的一小束光」互助申请前端
// 职责：
//   1) 拉取剩余名额并渲染到 about 页卡片
//   2) 点击「申请支持」打开表单弹窗
//   3) 表单校验 + 提交到 /api/aid
//   4) 生成轻量设备指纹（Canvas + UA + 时区组合）用于去重
// ============================================================

// ---- HTML 转义，防 XSS ----
function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ---- 轻量设备指纹 ----
// 说明：非精确身份，仅用于辅助去重。明文不涉及隐私，存飞书只做哈希比对。
async function getDeviceFingerprint() {
  try {
    const ua = navigator.userAgent || ''
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
    const lang = navigator.language || ''
    const screenInfo = `${screen.width}x${screen.height}x${screen.colorDepth}`
    // Canvas 指纹
    let canvasHash = ''
    try {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      ctx.textBaseline = 'top'
      ctx.font = '14px Arial'
      ctx.fillText('EchoVerse aid fp', 2, 2)
      canvasHash = canvas.toDataURL().slice(-64)
    } catch (e) {
      canvasHash = 'nocanvas'
    }
    const raw = [ua, tz, lang, screenInfo, canvasHash].join('|')
    // 简单哈希
    let h = 5381
    for (let i = 0; i < raw.length; i++) {
      h = ((h << 5) + h + raw.charCodeAt(i)) >>> 0
    }
    return 'fp_' + h.toString(36)
  } catch (e) {
    return 'fp_' + Date.now().toString(36)
  }
}

// ---- 拉取剩余名额 ----
async function loadQuota() {
  const padEl = document.getElementById('evo-aid-pad-quota')
  const mealEl = document.getElementById('evo-aid-meal-quota')
  try {
    const resp = await fetch('/api/aid?quota=1', { method: 'GET' })
    if (!resp.ok) return
    const data = await resp.json()
    if (padEl && typeof data.pad?.remaining === 'number') {
      padEl.textContent = data.pad.remaining
      padEl.classList.toggle('opacity-50', data.pad.remaining === 0)
    }
    if (mealEl && typeof data.meal?.remaining === 'number') {
      mealEl.textContent = data.meal.remaining
      mealEl.classList.toggle('opacity-50', data.meal.remaining === 0)
    }
  } catch (e) {
    // 静默失败，保留默认名额展示
  }
}

// ---- 弹窗：类型选择（从底部大按钮进入） ----
function openTypeSelector() {
  const root = document.getElementById('evo-aid-modal-root')
  if (!root) return
  closeModal()

  root.innerHTML = `
    <div id="evo-aid-modal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" data-aid-close></div>
      <div class="relative w-full max-w-md evo-glass rounded-[var(--evo-radius-lg)] p-6 sm:p-8 border border-[var(--evo-pink)]/30">
        <button class="absolute top-4 right-4 text-[var(--evo-ink-3)] hover:text-[var(--evo-ink)]" data-aid-close aria-label="关闭">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <h3 class="evo-title text-xl mb-1">选择申请类型</h3>
        <p class="text-xs text-[var(--evo-ink-3)] mb-5 leading-relaxed">两种补助可同时独立申请，名额实时更新。</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button data-aid-type="pad" class="evo-type-btn rounded-[var(--evo-radius-md)] p-4 bg-[var(--evo-pink)]/8 border border-[var(--evo-pink)]/30 text-left hover:bg-[var(--evo-pink)]/15 transition-colors">
            <span class="text-xl block mb-1">🌸</span>
            <span class="evo-title text-sm block mb-1">卫生巾补助</span>
            <span class="text-[10px] text-[var(--evo-ink-3)]">绵绵的羊 30 元款 · 寄到你给的地址</span>
          </button>
          <button data-aid-type="meal" class="evo-type-btn rounded-[var(--evo-radius-md)] p-4 bg-[var(--evo-amber)]/8 border border-[var(--evo-amber)]/30 text-left hover:bg-[var(--evo-amber)]/15 transition-colors">
            <span class="text-xl block mb-1">🍚</span>
            <span class="evo-title text-sm block mb-1">一顿饭补助</span>
            <span class="text-[10px] text-[var(--evo-ink-3)]">15 元微信转账 · 每周每人 1 次</span>
          </button>
        </div>
      </div>
    </div>
  `

  root.querySelectorAll('[data-aid-close]').forEach((el) => {
    el.addEventListener('click', closeModal)
  })
  root.querySelectorAll('[data-aid-type]').forEach((el) => {
    el.addEventListener('click', () => {
      const t = el.getAttribute('data-aid-type')
      openModal({ type: t })
    })
  })
}

// ---- 弹窗（通用表单） ----
function openModal({ type }) {
  const root = document.getElementById('evo-aid-modal-root')
  if (!root) return

  // 关闭已存在的弹窗
  closeModal()

  const isPad = type === 'pad'
  const title = isPad ? '卫生巾补助申请' : '一顿饭补助申请'
  const extraFieldHtml = isPad
    ? `
      <label class="block">
        <span class="text-xs text-[var(--evo-ink-3)] mb-1 block">收件地址 <span class="text-[var(--evo-pink)]">*</span></span>
        <input id="evo-aid-address" type="text" maxlength="100" placeholder="卫生巾将直接寄到此地址" class="w-full bg-[var(--evo-surface-2)]/60 border border-[var(--evo-border)] rounded-[var(--evo-radius-sm)] px-3 py-2 text-sm text-[var(--evo-ink)] focus:outline-none focus:border-[var(--evo-pink)]/60" />
      </label>`
    : `
      <label class="block">
        <span class="text-xs text-[var(--evo-ink-3)] mb-1 block">微信收款码链接 <span class="text-[var(--evo-amber)]">*</span></span>
        <input id="evo-aid-paycode" type="url" maxlength="200" placeholder="微信收款码图片链接" class="w-full bg-[var(--evo-surface-2)]/60 border border-[var(--evo-border)] rounded-[var(--evo-radius-sm)] px-3 py-2 text-sm text-[var(--evo-ink)] focus:outline-none focus:border-[var(--evo-amber)]/60" />
        <span class="text-[10px] text-[var(--evo-ink-3)]/70 mt-1 block">15 元将直接转到你的微信</span>
      </label>`

  root.innerHTML = `
    <div id="evo-aid-modal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" data-aid-close></div>
      <div class="relative w-full max-w-md evo-glass rounded-[var(--evo-radius-lg)] p-6 sm:p-8 border border-[var(--evo-pink)]/30 max-h-[90vh] overflow-y-auto">
        <button class="absolute top-4 right-4 text-[var(--evo-ink-3)] hover:text-[var(--evo-ink)]" data-aid-close aria-label="关闭">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <h3 class="evo-title text-xl mb-2">${isPad ? '🌸' : '🍚'} ${escapeHtml(title)}</h3>
        <p class="text-xs text-[var(--evo-ink-3)] mb-5 leading-relaxed">
          ${isPad ? '绵绵的羊 30 元款，寄到你给的地址。每月每人限 1 次。' : '15 元微信转账，每周每人限 1 次。'}
          两种补助可同时申请。
        </p>

        <form id="evo-aid-form" class="space-y-4">
          <!-- Honeypot（隐藏字段，机器人会填，正常人不填） -->
          <input type="text" name="website" tabindex="-1" autocomplete="off" class="absolute -left-[9999px] opacity-0" aria-hidden="true" />

          <label class="block">
            <span class="text-xs text-[var(--evo-ink-3)] mb-1 block">微信号 <span class="text-[var(--evo-pink)]">*</span></span>
            <input id="evo-aid-wechat" type="text" maxlength="20" placeholder="6-20 位，字母开头" class="w-full bg-[var(--evo-surface-2)]/60 border border-[var(--evo-border)] rounded-[var(--evo-radius-sm)] px-3 py-2 text-sm text-[var(--evo-ink)] focus:outline-none focus:border-[var(--evo-pink)]/60" />
          </label>

          <label class="block">
            <span class="text-xs text-[var(--evo-ink-3)] mb-1 block">手机号 <span class="text-[var(--evo-pink)]">*</span></span>
            <input id="evo-aid-phone" type="tel" maxlength="11" placeholder="11 位手机号" class="w-full bg-[var(--evo-surface-2)]/60 border border-[var(--evo-border)] rounded-[var(--evo-radius-sm)] px-3 py-2 text-sm text-[var(--evo-ink)] focus:outline-none focus:border-[var(--evo-pink)]/60" />
          </label>

          ${extraFieldHtml}

          <label class="block">
            <span class="text-xs text-[var(--evo-ink-3)] mb-1 block">困难简述 <span class="text-[var(--evo-pink)]">*</span></span>
            <textarea id="evo-aid-desc" rows="3" maxlength="200" placeholder="5-200 字，简单说说你现在的难处" class="w-full bg-[var(--evo-surface-2)]/60 border border-[var(--evo-border)] rounded-[var(--evo-radius-sm)] px-3 py-2 text-sm text-[var(--evo-ink)] focus:outline-none focus:border-[var(--evo-pink)]/60 resize-none"></textarea>
          </label>

          <p id="evo-aid-msg" class="text-xs h-4 transition-colors"></p>

          <button id="evo-aid-submit" type="submit" class="w-full px-6 py-3 rounded-full bg-gradient-to-r from-[var(--evo-pink)] to-[var(--evo-amber)] text-white font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50">
            提交申请
          </button>
        </form>
      </div>
    </div>
  `

  // 绑定关闭
  root.querySelectorAll('[data-aid-close]').forEach((el) => {
    el.addEventListener('click', closeModal)
  })

  // 绑定表单提交
  const form = document.getElementById('evo-aid-form')
  form.addEventListener('submit', (e) => handleSubmit(e, type))
}

function closeModal() {
  const modal = document.getElementById('evo-aid-modal')
  if (modal) modal.remove()
}

// ---- 表单提交 ----
async function handleSubmit(e, type) {
  e.preventDefault()
  const msg = document.getElementById('evo-aid-msg')
  const submitBtn = document.getElementById('evo-aid-submit')
  const honeypot = document.querySelector('#evo-aid-form input[name="website"]')?.value || ''

  const wechat = document.getElementById('evo-aid-wechat')?.value.trim() || ''
  const phone = document.getElementById('evo-aid-phone')?.value.trim() || ''
  const address = document.getElementById('evo-aid-address')?.value.trim() || ''
  const payCode = document.getElementById('evo-aid-paycode')?.value.trim() || ''
  const desc = document.getElementById('evo-aid-desc')?.value.trim() || ''

  // 前端基础校验（后端会再校一遍）
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{5,19}$/.test(wechat)) {
    return showMsg(msg, '微信号格式不正确（6-20 位，字母开头）', 'error')
  }
  if (!/^1[3-9]\d{9}$/.test(phone)) {
    return showMsg(msg, '手机号格式不正确', 'error')
  }
  if (desc.length < 5 || desc.length > 200) {
    return showMsg(msg, '困难简述需 5-200 字', 'error')
  }
  if (type === 'pad' && address.length < 5) {
    return showMsg(msg, '请填写收件地址', 'error')
  }
  if (type === 'meal' && !payCode) {
    return showMsg(msg, '请填写微信收款码链接', 'error')
  }

  submitBtn.disabled = true
  submitBtn.textContent = '提交中…'
  showMsg(msg, '', '')

  try {
    const fingerprint = await getDeviceFingerprint()
    const resp = await fetch('/api/aid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        wechat,
        phone,
        address,
        payCode,
        desc,
        fingerprint,
        website: honeypot
      })
    })
    const data = await resp.json()

    if (data.success) {
      showMsg(msg, '✓ ' + (data.message || '申请已收到'), 'success')
      setTimeout(() => {
        closeModal()
        loadQuota() // 刷新剩余名额
      }, 1500)
    } else {
      showMsg(msg, data.error || '申请失败，请稍后重试', 'error')
      submitBtn.disabled = false
      submitBtn.textContent = '提交申请'
    }
  } catch (err) {
    showMsg(msg, '网络异常，请稍后重试', 'error')
    submitBtn.disabled = false
    submitBtn.textContent = '提交申请'
  }
}

function showMsg(el, text, type) {
  if (!el) return
  el.textContent = text
  el.className = 'text-xs h-4 transition-colors ' + (
    type === 'error' ? 'text-[var(--evo-state-error)]'
    : type === 'success' ? 'text-[var(--evo-state-success)]'
    : ''
  )
}

// ---- 选中状态管理 ----
const SELECTED_CLASS = 'bg-[var(--evo-pink)]/10'
const SELECTED_BORDER = 'border-[var(--evo-pink)]/50'
const SELECTED_RING = 'ring-2 ring-[var(--evo-pink)]/30'
let selectedType = null

function setSelected(type) {
  selectedType = type
  const cards = document.querySelectorAll('[data-aid-card]')
  cards.forEach((card) => {
    const isSelected = card.dataset.aidCard === type
    card.classList.toggle(SELECTED_CLASS, isSelected)
    card.classList.toggle(SELECTED_BORDER, isSelected)
    card.classList.toggle(SELECTED_RING, isSelected)
  })
  const applyBtn = document.getElementById('evo-aid-apply-btn')
  if (applyBtn) {
    applyBtn.disabled = !type
    if (type) {
      applyBtn.innerHTML = `申请${type === 'pad' ? '卫生巾' : '吃饭'}补助 <span aria-hidden="true">→</span>`
    } else {
      applyBtn.innerHTML = `请选择上方补助类型 <span aria-hidden="true">→</span>`
    }
  }
}

// ---- 初始化 ----
function init() {
  // 拉取剩余名额
  loadQuota()

  // 绑定卡片点击：切换选中状态
  const cards = document.querySelectorAll('[data-aid-card]')
  cards.forEach((card) => {
    card.addEventListener('click', (e) => {
      // 如果点击的是卡片内的「申请」按钮，不触发选中切换
      if (e.target.closest('[data-aid-direct]')) return
      const type = card.dataset.aidCard
      setSelected(selectedType === type ? null : type)
    })
  })

  // 1. 底部大按钮 → 已选类型直接申请，未选则弹出类型选择器
  const applyBtn = document.getElementById('evo-aid-apply-btn')
  if (applyBtn) {
    applyBtn.addEventListener('click', () => {
      if (selectedType) {
        openModal({ type: selectedType })
      } else {
        openTypeSelector()
      }
    })
  }

  // 2. 卫生巾卡片「申请」按钮 → 直接申请（不影响选中状态）
  const padBtn = document.getElementById('evo-aid-pad-apply-btn')
  if (padBtn) {
    padBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      openModal({ type: 'pad' })
    })
  }

  // 3. 吃饭卡片「申请」按钮 → 直接申请（不影响选中状态）
  const mealBtn = document.getElementById('evo-aid-meal-apply-btn')
  if (mealBtn) {
    mealBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      openModal({ type: 'meal' })
    })
  }

  // 如果 URL hash 指向申请按钮（首页提示条引流），自动滚动并轻微高亮
  if (location.hash === '#evo-aid-apply-btn' && applyBtn) {
    setTimeout(() => {
      applyBtn.scrollIntoView({ behavior: 'smooth', block: 'center' })
      applyBtn.classList.add('ring-2', 'ring-[var(--evo-pink)]/60')
      setTimeout(() => applyBtn.classList.remove('ring-2', 'ring-[var(--evo-pink)]/60'), 2000)
    }, 600)
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
