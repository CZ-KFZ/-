// ============================================================
// EchoVerse · 3D 场景模块（Three.js）
// 中心发光球体 + 星空 + 轨道环 + 拖拽旋转 + 滚轮缩放
// 仅负责 3D 视觉背景，数据卡片由 HTML 覆盖层承载（保持飞书实时数据）
// ============================================================

import * as THREE from 'three'

let scene, camera, renderer, animationId
let centralGroup, rings = [], particles
let isDragging = false
let previousMousePosition = { x: 0, y: 0 }
let targetRotation = { x: 0, y: 0 }
let currentRotation = { x: 0, y: 0 }
let autoRotate = true
let containerEl

const COLORS = {
  purple: 0xa855f7,
  cyan: 0x06b6d4,
  pink: 0xf472b6,
  violet: 0xa78bfa
}

/**
 * 初始化 3D 场景
 * @param {HTMLElement} container - canvas 容器元素
 */
export function initThreeScene(container) {
  if (!container) return
  containerEl = container

  // 场景
  scene = new THREE.Scene()
  scene.fog = new THREE.FogExp2(0x050510, 0.0008)

  // 相机
  const w = container.clientWidth || window.innerWidth
  const h = container.clientHeight || window.innerHeight
  camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 2000)
  camera.position.set(0, 0, 180)

  // 渲染器
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setSize(w, h)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor(0x000000, 0)
  container.appendChild(renderer.domElement)

  createCentralSphere()
  createOrbitRings()
  createStarfield()
  addLights()

  bindEvents()
  animate()
}

// 中心发光球体
function createCentralSphere() {
  centralGroup = new THREE.Group()

  // 内核球
  const geo = new THREE.IcosahedronGeometry(22, 2)
  const mat = new THREE.MeshPhongMaterial({
    color: 0x1a0a2e,
    emissive: COLORS.purple,
    emissiveIntensity: 0.35,
    shininess: 100,
    transparent: true,
    opacity: 0.85
  })
  const sphere = new THREE.Mesh(geo, mat)
  centralGroup.add(sphere)

  // 线框外壳
  const wireGeo = new THREE.IcosahedronGeometry(26, 1)
  const wireMat = new THREE.MeshBasicMaterial({
    color: COLORS.cyan,
    wireframe: true,
    transparent: true,
    opacity: 0.25
  })
  const wireframe = new THREE.Mesh(wireGeo, wireMat)
  centralGroup.add(wireframe)

  // 外层光晕球
  const glowGeo = new THREE.SphereGeometry(34, 32, 32)
  const glowMat = new THREE.MeshBasicMaterial({
    color: COLORS.purple,
    transparent: true,
    opacity: 0.08,
    side: THREE.BackSide
  })
  const glow = new THREE.Mesh(glowGeo, glowMat)
  centralGroup.add(glow)

  scene.add(centralGroup)
}

// 轨道环（3 层，不同角度）
function createOrbitRings() {
  const ringConfigs = [
    { radius: 55, color: COLORS.purple, opacity: 0.5, tilt: 0.3 },
    { radius: 70, color: COLORS.cyan, opacity: 0.35, tilt: -0.5 },
    { radius: 85, color: COLORS.pink, opacity: 0.25, tilt: 0.8 }
  ]

  ringConfigs.forEach((cfg, i) => {
    const geo = new THREE.TorusGeometry(cfg.radius, 0.3, 16, 100)
    const mat = new THREE.MeshBasicMaterial({
      color: cfg.color,
      transparent: true,
      opacity: cfg.opacity
    })
    const ring = new THREE.Mesh(geo, mat)
    ring.rotation.x = cfg.tilt
    ring.rotation.y = i * 0.5
    ring.userData.speed = 0.0008 + i * 0.0003
    ring.userData.direction = i % 2 === 0 ? 1 : -1
    rings.push(ring)
    scene.add(ring)
  })

  // 轨道上的小球（装饰）
  rings.forEach((ring) => {
    const dotGeo = new THREE.SphereGeometry(1.2, 12, 12)
    const dotMat = new THREE.MeshBasicMaterial({ color: ring.material.color, transparent: true, opacity: 0.8 })
    const dot = new THREE.Mesh(dotGeo, dotMat)
    dot.position.set(ring.geometry.parameters.radius, 0, 0)
    ring.add(dot)
  })
}

// 星空粒子
function createStarfield() {
  const count = 1500
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const colorChoices = [
    new THREE.Color(0xffffff),
    new THREE.Color(COLORS.purple),
    new THREE.Color(COLORS.cyan),
    new THREE.Color(COLORS.pink)
  ]

  for (let i = 0; i < count; i++) {
    const r = 400 + Math.random() * 600
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
    positions[i * 3 + 2] = r * Math.cos(phi)

    const c = colorChoices[Math.floor(Math.random() * colorChoices.length)]
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  const mat = new THREE.PointsMaterial({
    size: 1.5,
    vertexColors: true,
    transparent: true,
    opacity: 0.8,
    sizeAttenuation: true
  })

  particles = new THREE.Points(geo, mat)
  scene.add(particles)
}

// 灯光
function addLights() {
  const ambient = new THREE.AmbientLight(0x404060, 1.2)
  scene.add(ambient)

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8)
  dirLight.position.set(50, 50, 50)
  scene.add(dirLight)

  const purpleLight = new THREE.PointLight(COLORS.purple, 2, 200)
  purpleLight.position.set(-40, 20, 40)
  scene.add(purpleLight)

  const cyanLight = new THREE.PointLight(COLORS.cyan, 1.5, 200)
  cyanLight.position.set(40, -20, -40)
  scene.add(cyanLight)
}

// 事件绑定（拖拽旋转 + 滚轮缩放）
function bindEvents() {
  const canvas = renderer.domElement

  canvas.addEventListener('mousedown', (e) => {
    isDragging = true
    autoRotate = false
    previousMousePosition = { x: e.clientX, y: e.clientY }
  })

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return
    const deltaX = e.clientX - previousMousePosition.x
    const deltaY = e.clientY - previousMousePosition.y
    targetRotation.y += deltaX * 0.005
    targetRotation.x += deltaY * 0.005
    targetRotation.x = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, targetRotation.x))
    previousMousePosition = { x: e.clientX, y: e.clientY }
  })

  window.addEventListener('mouseup', () => {
    isDragging = false
    // 3 秒后恢复自动旋转
    setTimeout(() => { autoRotate = true }, 3000)
  })

  // 触摸支持
  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      isDragging = true
      autoRotate = false
      previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    }
  })
  canvas.addEventListener('touchmove', (e) => {
    if (!isDragging || e.touches.length !== 1) return
    e.preventDefault()
    const deltaX = e.touches[0].clientX - previousMousePosition.x
    const deltaY = e.touches[0].clientY - previousMousePosition.y
    targetRotation.y += deltaX * 0.005
    targetRotation.x += deltaY * 0.005
    targetRotation.x = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, targetRotation.x))
    previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }, { passive: false })
  canvas.addEventListener('touchend', () => {
    isDragging = false
    setTimeout(() => { autoRotate = true }, 3000)
  })

  // 滚轮缩放
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault()
    const zoomSpeed = 0.1
    if (e.deltaY > 0) {
      camera.position.z = Math.min(300, camera.position.z + zoomSpeed * 20)
    } else {
      camera.position.z = Math.max(80, camera.position.z - zoomSpeed * 20)
    }
  }, { passive: false })

  // 窗口 resize
  window.addEventListener('resize', onResize)
}

function onResize() {
  if (!containerEl) return
  const w = containerEl.clientWidth || window.innerWidth
  const h = containerEl.clientHeight || window.innerHeight
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h)
}

// 动画循环
function animate() {
  animationId = requestAnimationFrame(animate)

  // 自动旋转
  if (autoRotate) {
    targetRotation.y += 0.0015
  }

  // 平滑插值
  currentRotation.x += (targetRotation.x - currentRotation.x) * 0.08
  currentRotation.y += (targetRotation.y - currentRotation.y) * 0.08

  if (centralGroup) {
    centralGroup.rotation.x = currentRotation.x
    centralGroup.rotation.y = currentRotation.y
  }

  // 轨道环旋转
  rings.forEach((ring) => {
    ring.rotation.z += ring.userData.speed * ring.userData.direction
  })

  // 星空缓慢旋转
  if (particles) {
    particles.rotation.y += 0.0001
  }

  renderer.render(scene, camera)
}

// 销毁场景
export function disposeThreeScene() {
  if (animationId) cancelAnimationFrame(animationId)
  if (renderer) {
    renderer.dispose()
    if (renderer.domElement.parentNode) {
      renderer.domElement.parentNode.removeChild(renderer.domElement)
    }
  }
  scene?.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose()
    if (obj.material) {
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose())
      else obj.material.dispose()
    }
  })
}
