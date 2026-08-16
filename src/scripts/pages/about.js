// ============================================================
// 关于我 about.js（CMS 版）
// 数据源：siteSettings（名片 + 技能 + 社交）+ timeline（成长轨迹）
// 均优先飞书多维表格，fallback 到 data.js
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

// 兜底社交数据
const DEFAULT_SOCIALS = [
  { label: '𝕏', title: 'X / Twitter', href: '#' },
  { label: '✉', title: '邮箱', href: '#' },
  { label: '◐', title: '个人站点', href: '#' }
]

function renderSocials(socials) {
  const box = document.getElementById('evo-social')
  if (!box) return
  const list = socials && socials.length ? socials : DEFAULT_SOCIALS
  box.innerHTML = list
    .map(
      (s) => `
      <a href="${s.href || '#'}" title="${s.title || ''}" aria-label="${s.title || ''}" class="w-10 h-10 rounded-full evo-glass flex items-center justify-center text-[var(--evo-ink-2)] hover:text-[var(--evo-ink)] hover:bg-[var(--evo-surface-2)] transition-colors">${s.label || '·'}</a>`
    )
    .join('')
}

function renderTimeline(items) {
  const box = document.getElementById('evo-timeline')
  if (!box) return
  const list = items && items.length ? items : MOCK_TIMELINE
  box.innerHTML = list
    .map(
      (item, i) => `
      <div class="pl-6 sm:pl-8 relative evo-reveal" data-reveal-delay="${Math.min(i * 80, 400)}">
        <span class="absolute -left-[5px] top-2 w-2.5 h-2.5 rounded-full ${DOT_COLOR[item.dot] || DOT_COLOR.primary}"></span>
        <div class="evo-glass rounded-[var(--evo-radius-lg)] p-5 sm:p-6 hover:bg-[var(--evo-surface-2)] transition-colors">
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-2">
            <h3 class="evo-title text-base sm:text-lg">${item.title}</h3>
            <span class="text-sm text-[var(--evo-ink-3)]">${item.period}</span>
          </div>
          <p class="text-[var(--evo-ink-2)] text-sm leading-relaxed">${item.desc}</p>
        </div>
      </div>`
    )
    .join('')
  if (window.EchoVerse && window.EchoVerse.refreshReveal) window.EchoVerse.refreshReveal()
}

function renderSkills(skills) {
  const box = document.getElementById('evo-skills')
  if (!box) return
  const list = skills && skills.length ? skills : MOCK_SKILLS
  box.innerHTML = list
    .map(
      (s) => `
      <span class="px-4 py-2 rounded-full evo-glass text-sm transition-all hover:-translate-y-0.5 hover:bg-[var(--evo-surface-2)] ${SKILL_TONE[s.tone] || SKILL_TONE.default}">${s.label}</span>`
    )
    .join('')
  if (window.EchoVerse && window.EchoVerse.refreshReveal) window.EchoVerse.refreshReveal()
}

// 名片头部信息（名字 / 头像 / 身份 / 简介）
function renderProfile(settings) {
  if (!settings) return
  const nameEl = document.getElementById('evo-profile-name')
  const identityEl = document.getElementById('evo-profile-identity')
  const bioEl = document.getElementById('evo-profile-bio')
  const avatarEl = document.getElementById('evo-profile-avatar')

  if (nameEl && settings.ownerName) nameEl.textContent = settings.ownerName
  if (identityEl && settings.identity) identityEl.textContent = settings.identity
  if (bioEl && settings.bio) bioEl.textContent = settings.bio

  // 头像：上传图片 > 首字兜底
  if (avatarEl) {
    if (settings.avatarImage) {
      avatarEl.innerHTML = `<img src="${settings.avatarImage}" alt="${settings.ownerName || '头像'}" class="w-full h-full object-cover" />`
      return
    }
    avatarEl.textContent = settings.avatarChar || '阴'
  }
}

async function loadData() {
  const [settings, timeline] = await Promise.all([fetchSiteSettings(), fetchTimeline()])
  return { settings, timeline }
}

async function init() {
  // 加载前先显示骨架（保留 HTML 里的兜底文案）
  const { settings, timeline } = await loadData()
  renderProfile(settings)
  renderSocials(settings?.socials)
  renderSkills(settings?.skills)
  renderTimeline(timeline)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
