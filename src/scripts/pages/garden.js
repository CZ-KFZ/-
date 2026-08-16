// ============================================================
// 数字花园 garden.js（CMS 版）
// 笔记数据：优先飞书多维表格；图谱节点结构沿用 data.js（拓扑固定）
// 节点↔笔记联动：通过 note.graphNode 字段匹配
// ============================================================

import { fetchNotes } from '../feishu.js'
import { GARDEN_NODES, GARDEN_LINKS, GARDEN_NOTES as MOCK_NOTES } from '../data.js'

let notes = []

// 笔记 → 图谱节点 映射（基于 note.graphNode 字段动态构建）
function buildNoteToNodeMap() {
  const map = {}
  notes.forEach((n) => {
    if (n.graphNode) map[n.id] = n.graphNode
  })
  return map
}

const view = { tx: 0, ty: 0, scale: 1 }
const MIN_SCALE = 0.5
const MAX_SCALE = 2.5
let selectedNodeId = null

function buildAdjacency() {
  const adj = {}
  GARDEN_NODES.forEach((n) => (adj[n.id] = { links: [], neighbors: [] }))
  GARDEN_LINKS.forEach(([a, b], i) => {
    adj[a].links.push(i)
    adj[b].links.push(i)
    adj[a].neighbors.push(b)
    adj[b].neighbors.push(a)
  })
  return adj
}
const adjacency = buildAdjacency()

function renderGraph() {
  const container = document.getElementById('evo-graph-canvas')
  if (!container) return

  const linksHtml = GARDEN_LINKS.map(([a, b], i) => {
    const na = GARDEN_NODES.find((n) => n.id === a)
    const nb = GARDEN_NODES.find((n) => n.id === b)
    const w = na.level === 0 || nb.level === 0 ? 1.5 : 1
    return `<line data-link="${i}" data-from="${a}" data-to="${b}" x1="${na.x}" y1="${na.y}" x2="${nb.x}" y2="${nb.y}" stroke="url(#evoLinkGrad)" stroke-width="${w}" class="evo-graph-link transition-all duration-200"/>`
  }).join('')

  const nodesHtml = GARDEN_NODES.map((n) => {
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
  const adj = adjacency[id]
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
  // 联动：找关联到此节点的笔记
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
    box.innerHTML = '<div class="text-center py-8 text-[var(--evo-ink-3)] text-sm">暂无笔记</div>'
    return
  }
  box.innerHTML = notes
    .map(
      (n, i) => `
      <article data-note="${n.id}" class="evo-glass rounded-[var(--evo-radius-lg)] p-5 hover:bg-[var(--evo-surface-2)] transition-colors cursor-pointer evo-reveal" data-reveal-delay="${Math.min(150 + i * 80, 500)}">
        <div class="flex flex-wrap gap-2 mb-3">
          ${(n.tags || []).map((t) => `<span class="px-2 py-1 rounded-[var(--evo-radius-sm)] ${NOTE_TONE[t.tone] || NOTE_TONE.purple} text-xs">${t.label}</span>`).join('')}
        </div>
        <h3 class="evo-title text-lg mb-2">${n.title}</h3>
        <p class="text-sm text-[var(--evo-ink-2)] line-clamp-2">${n.excerpt}</p>
      </article>`
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
  const node = GARDEN_NODES.find((n) => n.id === id)
  if (!node) return
  view.tx = 400 - node.x * view.scale
  view.ty = 250 - node.y * view.scale
  applyTransform()
}

async function loadData() {
  const raw = await fetchNotes()
  if (raw && raw.length) {
    notes = raw
    return
  }
  notes = MOCK_NOTES.map((n) => ({ ...n }))
}

async function init() {
  renderGraph()
  applyTransform()
  setupPan()
  setupWheel()
  setupZoomButtons()
  // 笔记区加载占位
  const box = document.getElementById('evo-notes-list')
  if (box) box.innerHTML = '<div class="text-center py-8 text-[var(--evo-ink-3)] text-sm">加载中…</div>'
  await loadData()
  renderNotes()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
