// ============================================================
// 关于我 about.js（CMS 版）
// 数据源：siteSettings（名片 + 技能 + 社交）+ timeline（成长轨迹）
// 均优先飞书多维表格，fallback 到 data.js / 内置 mock
// ============================================================

import { fetchSiteSettings, fetchTimeline } from '../feishu.js'
import { TIMELINE as MOCK_TIMELINE, SKILLS as MOCK_SKILLS } from '../data.js'

const DOT_COLOR = {
  primary: 'bg-[var(--evo-primary)]',
  cyan: 'bg-[var(--evo-cyan)]',
  pink: 'bg-[var(--evo-pink)]',
  violet: 'bg-[var(--evo-violet)]',
  muted: 'bg-[var(--evo-surface-2)] border border-[var(--evo-border)]'
}

const SKILL_TONE = {
  default: 'text-[var(--evo-ink)]',
  purple: 'text-[var(--evo-purple-300)] border border-[var(--evo-purple-500)]/30',
  cyan: 'text-[var(--evo-cyan)] border border-[var(--evo-cyan)]/30',
  pink: 'text-[var(--evo-pink)] border border-[var(--evo-pink)]/30'
}

// 兜底数据
const DEFAULT_SOCIALS = [
  { label: '𝕏', title: 'X / Twitter', href: '#' },
  { label: '✉', title: '邮箱', href: '#' },
  { label: '◐', title: '个人站点', href: '#' }
]

const DEFAULT_STATS = [
  { value: '5+', label: '年设计经验' },
  { value: '20+', label: '服务客户' },
  { value: '10+', label: '旅居城市' },
  { value: '∞', label: '好奇心' }
]

const DEFAULT_QUOTE = {
  text: '在混沌中寻找秩序，在秩序中创造混沌。设计是对生活的温柔反抗。',
  author: '— 阴之体道'
}

const DEFAULT_BIO = '相信设计的力量在于连接人与世界。游走在代码与美学之间，用技术表达创意，用设计温暖生活。'

// ------------------------------------------------------------
// 渲染：社交链接
// ------------------------------------------------------------
function renderSocials(socials) {
  const box = document.getElementById('evo-social')
  if (!box) return
  const list = socials && socials.length ? socials : DEFAULT_SOCIALS
  box.innerHTML = list
    .map(
      (s) => `
      <a href="${s.href || '#'}" title="${s.title || ''}" aria-label="${s.title || ''}" target="_blank" rel="noopener noreferrer"
         class="w-10 h-10 rounded-full evo-glass flex items-center justify-center text-[var(--evo-ink-2)] hover:text-[var(--evo-ink)] hover:bg-[var(--evo-surface-2)] hover:scale-110 transition-all">${s.label || '·'}</a>`
    )
    .join('')
}

// ------------------------------------------------------------
// 渲染：数据统计
// ------------------------------------------------------------
function renderStats(stats) {
  const box = document.getElementById('evo-stats')
  if (!box) return
  const list = stats && stats.length ? stats : DEFAULT_STATS
  box.innerHTML = list
    .map(
      (s) => `
      <div class="text-center">
        <div class="evo-display text-2xl sm:text-3xl bg-gradient-to-r from-[var(--evo-purple-300)] to-[var(--evo-cyan)] bg-clip-text text-transparent font-bold">${s.value}</div>
        <div class="text-xs text-[var(--evo-ink-3)] mt-1">${s.label}</div>
      </div>`
    )
    .join('')
}

// ------------------------------------------------------------
// 渲染：个人信条
// ------------------------------------------------------------
function renderQuote(quote) {
  const textEl = document.getElementById('evo-quote')
  const authorEl = document.getElementById('evo-quote-author')
  const q = quote || DEFAULT_QUOTE
  if (textEl) textEl.textContent = q.text || DEFAULT_QUOTE.text
  if (authorEl) authorEl.textContent = q.author || DEFAULT_QUOTE.author
}

// ------------------------------------------------------------
// 渲染：成长轨迹
// ------------------------------------------------------------
function renderTimeline(items) {
  const box = document.getElementById('evo-timeline')
  if (!box) return
  const list = items && items.length ? items : MOCK_TIMELINE
  box.innerHTML = `
    <div class="absolute left-[7px] top-2 bottom-2 w-px bg-gradient-to-b from-[var(--evo-purple-500)]/60 via-[var(--evo-border)] to-transparent"></div>
    ${list
      .map(
        (item, i) => `
        <div class="pl-8 sm:pl-10 relative evo-reveal pb-8 last:pb-0" data-reveal-delay="${Math.min(i * 80, 400)}">
          <span class="absolute left-0 top-2 w-3.5 h-3.5 rounded-full ${DOT_COLOR[item.dot] || DOT_COLOR.primary} ring-4 ring-[var(--evo-bg)] shadow-lg"></span>
          <div class="evo-glass rounded-[var(--evo-radius-lg)] p-5 sm:p-6 hover:bg-[var(--evo-surface-2)] hover:border-[var(--evo-purple-400)]/40 transition-all group">
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-2">
              <h3 class="evo-title text-base sm:text-lg group-hover:text-[var(--evo-purple-300)] transition-colors">${item.title}</h3>
              <span class="text-xs sm:text-sm text-[var(--evo-ink-3)] font-mono">${item.period}</span>
            </div>
            <p class="text-[var(--evo-ink-2)] text-sm leading-relaxed">${item.desc}</p>
          </div>
        </div>`
      )
      .join('')}
  `
  if (window.EchoVerse && window.EchoVerse.refreshReveal) window.EchoVerse.refreshReveal()
}

// ------------------------------------------------------------
// 渲染：技能标签
// ------------------------------------------------------------
function renderSkills(skills) {
  const box = document.getElementById('evo-skills')
  if (!box) return
  const list = skills && skills.length ? skills : MOCK_SKILLS
  box.innerHTML = list
    .map(
      (s) => `
      <span class="px-4 py-2 rounded-full evo-glass text-sm transition-all hover:-translate-y-0.5 hover:bg-[var(--evo-surface-2)] hover:border-[var(--evo-purple-400)]/40 ${SKILL_TONE[s.tone] || SKILL_TONE.default}">${s.label}</span>`
    )
    .join('')
  if (window.EchoVerse && window.EchoVerse.refreshReveal) window.EchoVerse.refreshReveal()
}

// ------------------------------------------------------------
// 渲染：名片头部
// ------------------------------------------------------------
function renderProfile(settings) {
  if (!settings) {
    // 没有 settings 时用默认 bio
    const bioEl = document.getElementById('evo-profile-bio')
    if (bioEl) bioEl.textContent = DEFAULT_BIO
    return
  }
  const nameEl = document.getElementById('evo-profile-name')
  const identityEl = document.getElementById('evo-profile-identity')
  const bioEl = document.getElementById('evo-profile-bio')
  const avatarEl = document.getElementById('evo-profile-avatar')

  if (nameEl && settings.ownerName) nameEl.textContent = settings.ownerName
  if (identityEl && settings.identity) identityEl.textContent = settings.identity
  if (bioEl) bioEl.textContent = settings.bio || DEFAULT_BIO

  if (avatarEl) {
    if (settings.avatarImage) {
      avatarEl.innerHTML = `<img src="${settings.avatarImage}" alt="${settings.ownerName || '头像'}" class="w-full h-full object-cover" />`
      return
    }
    avatarEl.textContent = settings.avatarChar || '阴'
  }
}

// ------------------------------------------------------------
// 数据加载
// ------------------------------------------------------------
async function loadData() {
  const [settings, timeline] = await Promise.all([fetchSiteSettings(), fetchTimeline()])
  return { settings, timeline }
}

async function init() {
  const { settings, timeline } = await loadData()
  renderProfile(settings)
  renderSocials(settings?.socials)
  renderStats(settings?.stats)
  renderQuote(settings?.quote)
  renderSkills(settings?.skills)
  renderTimeline(timeline)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
