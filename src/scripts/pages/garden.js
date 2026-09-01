// ============================================================
// 数字花园 garden.js（实时版）
// 数据来源：飞书多维表格「笔记」
// - 网络图：用笔记的「分类」作为一级/二级节点，按分类数量多寡决定层级；
//           如果笔记条数太少，fallback 到基于分类名的固定布局；
//           每条笔记挂在它所属分类下。
// - 最近笔记：按原顺序取前 12 条。
// - 计数：真实显示笔记条数 + 分类数。
// ============================================================

import { fetchNotes, fetchSiteSettings } from '../feishu.js'
import { GARDEN_NOTES as MOCK_NOTES } from '../data.js'

let notes = []

// 笔记 -> 图谱节点 映射：每条笔记映射到它的分类节点 id
function buildNoteToNodeMap() {
  const map = {}
  notes.forEach((n) => {
    const cat = (n.category || n.categoryLabel || '未分类').toString()
    const nodeId = nodeIdFromCat(cat)
    if (nodeId) map[n.id] = nodeId
  })
  return map
}

const view = { tx: 0, ty: 0, scale: 1 }
const MIN_SCALE = 0.5
const MAX_SCALE = 2.5
let selectedNodeId = null

// 当前动态生成的图
let GRAPH_NODES = []
let GRAPH_LINKS = []
let ADJACENCY = {}

function nodeIdFromCat(name) {
  if (!name) return null
  return 'n_' + name.replace(/[\s_/\\-]+/g, '_').replace(/[^0-9a-zA-Z_\u4e00-\u9fa5]/g, '')
}

// ------------------------------------------------------------
// 根据笔记动态生成图谱
// 结构：
//   核心节点(level0)：「知识网络」1 个
//   一级领域(level1)：分类名（最多 8 个）
//   二级话题(level2)：如果笔记多，再拆二级（暂时按 标题/标签 生成）
// ------------------------------------------------------------
function buildGraphFromNotes(allNotes) {
  const NODES = []
  const LINKS = []

  // 分类统计
  const catCount = {}
  allNotes.forEach((n) => {
    const c = (n.category || n.categoryLabel || '未分类').toString()
    catCount[c] = (catCount[c] || 0) + 1
  })
  const cats = Object.keys(catCount).sort((a, b) => catCount[b] - catCount[a]).slice(0, 8)

  // 核心节点：居中（level 0）
  const centerLabel = pickCenterLabel(allNotes)
  const centerId = 'n_root'
  NODES.push({
    id: centerId,
    label: centerLabel,
    level: 0,
    color: 'var(--evo-violet)',
    r: 46,
    x: 400,
    y: 250,
    glow: 'purple'
  })

  // 一级领域节点：环形分布
  const n1 = cats.length || 1
  const radius = cats.length <= 3 ? 130 : cats.length <= 5 ? 150 : 170
  const palette = ['var(--evo-cyan)', 'var(--evo-pink)', 'var(--evo-purple-500)', 'var(--evo-violet)', 'var(--evo-purple-300)', 'var(--evo-purple-400)', '#67e8f9', '#c084fc']
  cats.forEach((cat, i) => {
    const angle = (-Math.PI / 2) + (2 * Math.PI * i) / n1
    const x = 400 + Math.cos(angle) * radius
    const y = 250 + Math.sin(angle) * radius
    const id = nodeIdFromCat(cat)
    NODES.push({
      id,
      label: cat,
      level: 1,
      color: palette[i % palette.length],
      r: 28,
      x, y
    })
    LINKS.push([centerId, id])
  })

  // 二级话题：从每条笔记里抽「标签」或「标题前 4 个字」作为外围节点
  // 限制最多 18 个，不然密密麻麻
  const MAX_L2 = 18
  let l2Added = 0
  const seenL2 = new Set()
  allNotes.forEach((n) => {
    if (l2Added >= MAX_L2) return
    const parentId = nodeIdFromCat((n.category || n.categoryLabel || '未分类').toString())
    const parent = NODES.find((nd) => nd.id === parentId)
    if (!parent) return
    const labels = []
    if (n.tags && n.tags.length) {
      n.tags.forEach((t) => {
        const lbl = (typeof t === 'string' ? t : t.label || t.text || '').toString().trim()
        if (lbl) labels.push(lbl)
      })
    } else if (n.title) {
      labels.push(n.title.toString().slice(0, 6))
    }
    labels.forEach((lbl) => {
      if (l2Added >= MAX_L2) return
      const lid = nodeIdFromCat(parentId + '__' + lbl)
      if (seenL2.has(lid)) return
      seenL2.add(lid)
      // 分布：父节点方向向外偏移
      const dx = parent.x - 400
      const dy = parent.y - 250
      const dist = Math.hypot(dx, dy) || 1
      const spread = 85
      const jitter = (l2Added % 5) * 18 - 36
      const normJitterX = (-dy / dist) * jitter
      const normJitterY = (dx / dist) * jitter
      const x = parent.x + (dx / dist) * spread + normJitterX
      const y = parent.y + (dy / dist) * spread + normJitterY
      NODES.push({
        id: lid,
        label: lbl,
        level: 2,
        color: parent.color,
        r: 20,
        x, y
      })
      LINKS.push([parentId, lid])
      l2Added++
    })
  })

  return { NODES, LINKS }
}

function pickCenterLabel(allNotes) {
  // 尝试从站点设置取身份描述里的核心词
  return allNotes.length ? '知识网络' : '数字花园'
}

function buildAdjacency() {
  const adj = {}
  GRAPH_NODES.forEach((n) => (adj[n.id] = { links: [], neighbors: [] }))
  GRAPH_LINKS.forEach(([a, b], i) => {
    if (!adj[a] || !adj[b]) return
    adj[a].links.push(i)
    adj[b].links.push(i)
    adj[a].neighbors.push(b)
    adj[b].neighbors.push(a)
  })
  return adj
}

function renderGraph() {
  const container = document.getElementById('evo-graph-canvas')
  if (!container) return

  const linksHtml = GRAPH_LINKS.map(([a, b], i) => {
    const na = GRAPH_NODES.find((n) => n.id === a)
    const nb = GRAPH_NODES.find((n) => n.id === b)
    if (!na || !nb) return ''
    const w = na.level === 0 || nb.level === 0 ? 1.5 : 1
    return `<line data-link="${i}" data-from="${a}" data-to="${b}" x1="${na.x}" y1="${na.y}" x2="${nb.x}" y2="${nb.y}" stroke="url(#evoLinkGrad)" stroke-width="${w}" class="evo-graph-link transition-all duration-200"/>`
  }).join('')

  const nodesHtml = GRAPH_NODES.map((n) => {
    const glowClass = n.glow === 'purple' ? 'evo-glow-purple' : ''
    const stroke = n.level === 2 ? 'stroke="var(--evo-border)"' : ''
    const fontSize = n.level === 0 ? 11 : n.level === 1 ? 10 : 8
    const fill = n.level === 2 ? 'var(--evo-surface-2)' : n.color
    const fillOpacity = n.level === 0 ? 0.9 : n.level === 1 ? 0.7 : 1
    return `
      <g data-node="${n.id}" class="evo-graph-node cursor-pointer transition-all duration-200" tabindex="0" role="button" aria-label="${n.label}">
        <circle cx="${n.x}" cy="${n.y}" r="${n.r}" fill="${fill}" fill-opacity="${fillOpacity}" class="${glowClass}" ${stroke}/>
        <text x="${n.x}" y="${n.y + fontSize / 3}" text-anchor="middle" fill="${n.level === 2 ? 'var(--evo-ink-2)' : 'white'}" font-size="${fontSize}" font-family="var(--evo-font-body)" pointer-events="none" class="evo-graph-label">${n.label}</text>
      </g>`
  }).join('')

  container.innerHTML = `
    <svg id="evo-graph-svg" viewBox="0 0 800 500" class="w-full h-full opacity-90" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="evoLinkGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="var(--evo-cyan)" stop-opacity="0.3"/>
          <stop offset="100%" stop-color="var(--evo-pink)" stop-opacity="0.3"/>
        </linearGradient>
      </defs>
      <g id="evo-graph-root">
        <g id="evo-graph-links">${linksHtml}</g>
        <g id="evo-graph-nodes">${nodesHtml}</g>
      </g>
    </svg>`

  attachNodeEvents()
}

function applyTransform() {
  const root = document.getElementById('evo-graph-root')
  if (!root) return
  root.setAttribute('transform', `translate(${view.tx} ${view.ty}) scale(${view.scale})`)
  const label = document.getElementById('evo-zoom-label')
  if (label) label.textContent = `${Math.round(view.scale * 100)}%`
}

function clientToSvg(clientX, clientY) {
  const svg = document.getElementById('evo-graph-svg')
  if (!svg || !svg.getScreenCTM) return { x: clientX, y: clientY }
  const pt = svg.createSVGPoint()
  pt.x = clientX
  pt.y = clientY
  const ctm = svg.getScreenCTM()
  if (!ctm) return { x: clientX, y: clientY }
  return pt.matrixTransform(ctm.inverse())
}

function setupPan() {
  const container = document.getElementById('evo-graph-canvas')
  if (!container) return
  let dragging = false
  let startSvg = null
  let startTx = 0
  let startTy = 0

  const onDown = (e) => {
    if (e.target.closest('.evo-graph-node')) return
    dragging = true
    const p = e.touches ? e.touches[0] : e
    startSvg = clientToSvg(p.clientX, p.clientY)
    startTx = view.tx
    startTy = view.ty
    container.style.cursor = 'grabbing'
  }
  const onMove = (e) => {
    if (!dragging) return
    const p = e.touches ? e.touches[0] : e
    const cur = clientToSvg(p.clientX, p.clientY)
    view.tx = startTx + (cur.x - startSvg.x)
    view.ty = startTy + (cur.y - startSvg.y)
    applyTransform()
    if (e.touches) e.preventDefault()
  }
  const onUp = () => {
    dragging = false
    container.style.cursor = ''
  }
  container.addEventListener('mousedown', onDown)
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
  container.addEventListener('touchstart', onDown, { passive: false })
  window.addEventListener('touchmove', onMove, { passive: false })
  window.addEventListener('touchend', onUp)
  container.addEventListener('click', (e) => {
    if (!e.target.closest('.evo-graph-node')) clearSelection()
  })
}

function setupWheel() {
  const container = document.getElementById('evo-graph-canvas')
  if (!container) return
  container.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
      zoomAt(e.clientX, e.clientY, factor)
    },
    { passive: false }
  )
}

function zoomAt(clientX, clientY, factor) {
  const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale * factor))
  if (newScale === view.scale) return
  const actualFactor = newScale / view.scale
  const p = clientToSvg(clientX, clientY)
  view.tx = p.x - (p.x - view.tx) * actualFactor
  view.ty = p.y - (p.y - view.ty) * actualFactor
  view.scale = newScale
  applyTransform()
}

function setupZoomButtons() {
  const container = document.getElementById('evo-graph-canvas')
  const rect = () => container.getBoundingClientRect()
  document.getElementById('evo-zoom-in')?.addEventListener('click', () => {
    const r = rect()
    zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.2)
  })
  document.getElementById('evo-zoom-out')?.addEventListener('click', () => {
    const r = rect()
    zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1 / 1.2)
  })
  document.getElementById('evo-zoom-reset')?.addEventListener('click', () => {
    view.tx = 0
    view.ty = 0
    view.scale = 1
    applyTransform()
    clearSelection()
  })
}

function attachNodeEvents() {
  document.querySelectorAll('.evo-graph-node').forEach((g) => {
    g.addEventListener('mouseenter', () => highlightNode(g.dataset.node))
    g.addEventListener('mouseleave', () => {
      if (selectedNodeId) highlightNode(selectedNodeId)
      else clearHighlight()
    })
    g.addEventListener('click', (e) => {
      e.stopPropagation()
      selectNode(g.dataset.node)
    })
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        selectNode(g.dataset.node)
      }
    })
  })
}

function highlightNode(id) {
  const adj = ADJACENCY[id]
  if (!adj) return
  const neighborSet = new Set(adj.neighbors)
  neighborSet.add(id)
  document.querySelectorAll('.evo-graph-node').forEach((g) => {
    const isOn = neighborSet.has(g.dataset.node)
    g.style.opacity = isOn ? '1' : '0.25'
    if (isOn && g.dataset.node === id) g.classList.add('evo-glow-purple')
    else if (g.dataset.node !== id) g.classList.remove('evo-glow-purple')
  })
  document.querySelectorAll('.evo-graph-link').forEach((line) => {
    const isOn = line.dataset.from === id || line.dataset.to === id
    line.style.opacity = isOn ? '1' : '0.1'
    line.style.strokeWidth = isOn ? '2' : ''
  })
}

function clearHighlight() {
  document.querySelectorAll('.evo-graph-node').forEach((g) => {
    g.style.opacity = ''
    g.classList.remove('evo-glow-purple')
  })
  document.querySelectorAll('.evo-graph-link').forEach((line) => {
    line.style.opacity = ''
    line.style.strokeWidth = ''
  })
}

function selectNode(id) {
  selectedNodeId = id
  highlightNode(id)
  // 找关联到此节点的笔记
  const noteToNode = buildNoteToNodeMap()
  const noteId = Object.keys(noteToNode).find((k) => noteToNode[k] === id)
  highlightNote(noteId)
}

function clearSelection() {
  selectedNodeId = null
  clearHighlight()
  highlightNote(null)
}

const NOTE_TONE = {
  purple: 'bg-[var(--evo-purple-500)]/20 text-[var(--evo-purple-300)]',
  cyan: 'bg-[var(--evo-cyan)]/20 text-[var(--evo-cyan)]',
  pink: 'bg-[var(--evo-pink)]/20 text-[var(--evo-pink)]'
}

function renderNotes() {
  const box = document.getElementById('evo-notes-list')
  if (!box) return
  if (!notes.length) {
    box.innerHTML = '<div class="text-center py-8 text-[var(--evo-ink-3)] text-sm">暂无笔记，飞书「笔记」表添加一条记录后这里会实时显示。</div>'
    return
  }
  // 取前 12 条
  const list = notes.slice(0, 12)
  box.innerHTML = list
    .map(
      (n, i) => {
        const tags = n.tags && n.tags.length ? n.tags : []
        const cat = n.category || n.categoryLabel
        const catChip = cat
          ? `<span class="px-2 py-1 rounded-[var(--evo-radius-sm)] bg-[var(--evo-violet)]/30 text-[var(--evo-violet)] text-xs">${cat}</span>`
          : ''
        const tagsHtml = tags.map((t) => {
          const tone = (typeof t === 'string') ? 'purple' : (t.tone || 'purple')
          const label = (typeof t === 'string') ? t : (t.label || t.text || '')
          return `<span class="px-2 py-1 rounded-[var(--evo-radius-sm)] ${NOTE_TONE[tone] || NOTE_TONE.purple} text-xs">${label}</span>`
        }).join('')
        return `
      <article data-note="${n.id}" class="evo-glass rounded-[var(--evo-radius-lg)] p-5 hover:bg-[var(--evo-surface-2)] transition-colors cursor-pointer evo-reveal" data-reveal-delay="${Math.min(150 + i * 80, 500)}">
        <div class="flex flex-wrap gap-2 mb-3">
          ${catChip}
          ${tagsHtml}
        </div>
        <h3 class="evo-title text-lg mb-2">${n.title || '未命名笔记'}</h3>
        <p class="text-sm text-[var(--evo-ink-2)] line-clamp-2">${n.excerpt || '暂无摘要'}</p>
        ${n.publishedAt ? `<div class="mt-3 text-[11px] text-[var(--evo-ink-3)] evo-mono">${n.publishedAt}</div>` : ''}
      </article>`
      }
    )
    .join('')

  box.querySelectorAll('[data-note]').forEach((el) => {
    el.addEventListener('click', () => {
      const noteToNode = buildNoteToNodeMap()
      const nodeId = noteToNode[el.dataset.note]
      if (nodeId) {
        selectNode(nodeId)
        panToNode(nodeId)
      }
    })
    el.addEventListener('mouseenter', () => {
      const noteToNode = buildNoteToNodeMap()
      const nodeId = noteToNode[el.dataset.note]
      if (nodeId && !selectedNodeId) highlightNode(nodeId)
    })
    el.addEventListener('mouseleave', () => {
      if (!selectedNodeId) clearHighlight()
    })
  })
  if (window.EchoVerse && window.EchoVerse.refreshReveal) window.EchoVerse.refreshReveal()
}

function highlightNote(noteId) {
  document.querySelectorAll('[data-note]').forEach((el) => {
    if (noteId && el.dataset.note === noteId) {
      el.classList.add('ring-1', 'ring-[var(--evo-purple-400)]', 'bg-[var(--evo-surface-2)]')
    } else {
      el.classList.remove('ring-1', 'ring-[var(--evo-purple-400)]', 'bg-[var(--evo-surface-2)]')
    }
  })
}

function panToNode(id) {
  const node = GRAPH_NODES.find((n) => n.id === id)
  if (!node) return
  view.tx = 400 - node.x * view.scale
  view.ty = 250 - node.y * view.scale
  applyTransform()
}

// ------------------------------------------------------------
// 数据加载
// ------------------------------------------------------------
async function loadData() {
  const [rawNotes, rawSettings] = await Promise.all([
    fetchNotes().catch(() => null),
    fetchSiteSettings().catch(() => null)
  ])

  if (rawNotes && rawNotes.length) {
    notes = rawNotes
  } else {
    // fallback：老 mock，加分类信息
    notes = MOCK_NOTES.map((n) => ({
      id: n.id,
      title: n.title,
      excerpt: n.excerpt,
      tags: n.tags || [],
      graphNode: '',
      category: (n.tags && n.tags[0] && (typeof n.tags[0] === 'string' ? n.tags[0] : n.tags[0].label)) || '未分类',
      categoryLabel: '',
      publishedAt: ''
    }))
  }
  return { notes, settings: rawSettings || null }
}

function applyStats({ notes, settings }) {
  const nNotes = notes.length
  // 分类数量
  const set = new Set()
  notes.forEach((n) => {
    const c = (n.category || n.categoryLabel || '').toString()
    if (c) set.add(c)
  })
  const nCats = set.size

  // 副标题（左上方）
  const sub = document.getElementById('evo-garden-subtitle')
  if (sub) {
    const on = settings && settings.ownerName ? settings.ownerName : '她'
    sub.textContent = `${on} 的 · ${nNotes} 条笔记 / ${nCats} 个分类`
  }

  // 右侧「X 节点」
  const count = document.getElementById('evo-notes-count')
  if (count) count.textContent = `${nNotes} 节点`

  // 图例：有二级就显示全部；没笔记就隐藏
  const legend = document.getElementById('evo-graph-legend')
  if (legend) {
    if (!nNotes) {
      legend.style.display = 'none'
    } else if (nCats === 0) {
      legend.innerHTML = '<span class="px-2 py-1 rounded-[var(--evo-radius-sm)] bg-[var(--evo-purple-500)]/20 text-[var(--evo-purple-300)] text-xs">核心主题</span>'
    } else if (notes.length < 6) {
      legend.innerHTML = `
        <span class="px-2 py-1 rounded-[var(--evo-radius-sm)] bg-[var(--evo-purple-500)]/20 text-[var(--evo-purple-300)] text-xs">核心主题</span>
        <span class="px-2 py-1 rounded-[var(--evo-radius-sm)] bg-[var(--evo-cyan)]/20 text-[var(--evo-cyan)] text-xs">分类领域</span>`
    } else {
      legend.innerHTML = `
        <span class="px-2 py-1 rounded-[var(--evo-radius-sm)] bg-[var(--evo-purple-500)]/20 text-[var(--evo-purple-300)] text-xs">核心主题</span>
        <span class="px-2 py-1 rounded-[var(--evo-radius-sm)] bg-[var(--evo-cyan)]/20 text-[var(--evo-cyan)] text-xs">分类领域</span>
        <span class="px-2 py-1 rounded-[var(--evo-radius-sm)] bg-[var(--evo-pink)]/20 text-[var(--evo-pink)] text-xs">话题标签</span>`
    }
  }

  // 图谱描述（meta 意义不大，这里给 HTML title 下面的说明）
}

async function init() {
  // 先加载飞书数据再构建图，避免白图
  const box = document.getElementById('evo-notes-list')
  if (box) box.innerHTML = '<div class="text-center py-8 text-[var(--evo-ink-3)] text-sm">同步笔记中…</div>'

  const { notes: nArr, settings } = await loadData()
  const graph = buildGraphFromNotes(nArr)
  GRAPH_NODES = graph.NODES
  GRAPH_LINKS = graph.LINKS
  ADJACENCY = buildAdjacency()

  renderGraph()
  applyTransform()
  setupPan()
  setupWheel()
  setupZoomButtons()
  renderNotes()
  applyStats({ notes: nArr, settings })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
