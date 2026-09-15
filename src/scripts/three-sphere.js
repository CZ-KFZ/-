// ============================================================
// EchoVerse · 头像 3D 球体展示
// 用 Three.js 把头像贴到球体上，自动缓慢旋转（像地球）
// 飞书 settings.avatarImage 优先；无图时用程序生成的渐变贴图
// 支持 prefers-reduced-motion：禁用动画时静止不转
// ============================================================

import * as THREE from 'three'

// 创建一个 Three.js 球体场景
// container: DOM 容器
// imageUrl: 头像图片 URL（可选，无则用渐变兜底贴图）
// 返回一个 dispose 函数，用于销毁场景释放资源
export function createAvatarSphere(container, imageUrl) {
  if (!container) return () => {}

  // 检测 WebGL 支持（详细诊断）
  const diag = diagnoseWebGL()
  console.log('[EchoVerse] WebGL 诊断：', diag)
  if (!diag.supported) {
    console.warn('[EchoVerse] 浏览器不支持 WebGL，3D 球体降级为 2D 兜底。原因：', diag.reason)
    // 在页面右上角显示诊断信息，方便你截图给我看
    showDiagnosticBadge(diag)
    render2DFallback(container, imageUrl)
    return () => {}
  }
  // WebGL 可用也显示一个小标识，确认走了 3D 路径
  showDiagnosticBadge({ ...diag, mode: '3D' })

  // 尺寸：以容器为准
  const width = container.clientWidth || 280
  const height = container.clientHeight || 280

  // 场景
  const scene = new THREE.Scene()

  // 相机：50° 视场，球体占满
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100)
  camera.position.set(0, 0, 3.2)

  // 渲染器：alpha=true 让背景透明，可与页面融合
  let renderer
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
  } catch (e) {
    console.warn('[EchoVerse] WebGLRenderer 创建失败，3D 球体降级为 2D 兜底：', e.message)
    render2DFallback(container, imageUrl)
    return () => {}
  }
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  container.appendChild(renderer.domElement)

  // 球体几何：半径 1，64 段，足够平滑
  const geometry = new THREE.SphereGeometry(1, 64, 64)

  // 灯光：环境光 + 主光 + 边缘光，让球体有立体感
  const ambient = new THREE.AmbientLight(0xffffff, 0.5)
  scene.add(ambient)
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.0)
  keyLight.position.set(2, 1.5, 3)
  scene.add(keyLight)
  const rimLight = new THREE.DirectionalLight(0x06b6d4, 0.5)
  rimLight.position.set(-2, -1, -3)
  scene.add(rimLight)

  // 贴图加载器
  const loader = new THREE.TextureLoader()
  loader.crossOrigin = 'anonymous'

  // 兜底贴图：用 canvas 生成紫青渐变 + 「阴」字，避免外部图片加载失败
  function makeFallbackTexture() {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 512
    const ctx = canvas.getContext('2d')
    const grad = ctx.createLinearGradient(0, 0, 512, 512)
    grad.addColorStop(0, '#7c3aed')
    grad.addColorStop(0.5, '#8b5cf6')
    grad.addColorStop(1, '#06b6d4')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 512, 512)
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.font = 'bold 280px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('阴', 256, 256)
    return new THREE.CanvasTexture(canvas)
  }

  // 材质：先放兜底贴图，异步加载真实头像后替换
  const material = new THREE.MeshStandardMaterial({
    map: makeFallbackTexture(),
    roughness: 0.4,
    metalness: 0.15,
  })
  const sphere = new THREE.Mesh(geometry, material)
  scene.add(sphere)

  // 异步加载真实头像贴图
  let textureLoaded = false
  if (imageUrl) {
    loader.load(
      imageUrl,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace
        material.map = texture
        material.needsUpdate = true
        textureLoaded = true
      },
      undefined,
      (err) => {
        // 加载失败：保留兜底贴图
        console.warn('[EchoVerse] 3D 头像贴图加载失败，用兜底：', err.message)
      }
    )
  }

  // 旋转动画：reduced-motion 时不旋转
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let rotateSpeed = prefersReducedMotion ? 0 : 0.0045
  let bounceY = 0
  let frameId = 0

  function animate() {
    frameId = requestAnimationFrame(animate)
    // 像地球一样绕 Y 轴匀速旋转
    sphere.rotation.y += rotateSpeed
    // 微小上下浮动，增加生命感
    bounceY += 0.01
    sphere.position.y = Math.sin(bounceY) * 0.03
    renderer.render(scene, camera)
  }
  animate()

  // 响应容器尺寸变化
  function onResize() {
    const w = container.clientWidth || 280
    const h = container.clientHeight || 280
    if (w === width && h === height) return
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
  }
  const resizeObserver = new ResizeObserver(onResize)
  resizeObserver.observe(container)

  // 返回销毁函数
  return function dispose() {
    cancelAnimationFrame(frameId)
    resizeObserver.disconnect()
    geometry.dispose()
    material.dispose()
    if (material.map) material.map.dispose()
    renderer.dispose()
    if (renderer.domElement.parentElement === container) {
      container.removeChild(renderer.domElement)
    }
  }
}

// 2D 兜底：WebGL 不可用时用 CSS 旋转圆形头像
function render2DFallback(container, imageUrl) {
  const wrapper = document.createElement('div')
  wrapper.className = 'evo-pl-sphere-2d'
  if (imageUrl) {
    wrapper.style.background = `url(${imageUrl}) center/cover`
  } else {
    wrapper.style.background = 'linear-gradient(135deg, #7c3aed 0%, #06b6d4 100%)'
    const span = document.createElement('span')
    span.textContent = '阴'
    wrapper.appendChild(span)
  }
  container.appendChild(wrapper)
}

// WebGL 详细诊断：返回支持状态 + 失败原因
function diagnoseWebGL() {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    if (!gl) {
      return { supported: false, reason: 'getContext("webgl") 返回 null' }
    }
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : '未知'
    const vendor = debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : '未知'
    const version = gl.getParameter(gl.VERSION)
    const shadingLang = gl.getParameter(gl.SHADING_LANGUAGE_VERSION)
    const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE)
    return {
      supported: true,
      renderer, vendor, version, shadingLang, maxTextureSize,
      reason: 'OK'
    }
  } catch (e) {
    return { supported: false, reason: `异常：${e.message}` }
  }
}

// 右上角显示诊断徽章：方便你截图给我看
function showDiagnosticBadge(diag) {
  const badge = document.createElement('div')
  badge.style.cssText = `
    position: fixed; top: 12px; right: 12px; z-index: 9999;
    background: ${diag.supported ? 'rgba(34,197,94,0.95)' : 'rgba(239,68,68,0.95)'};
    color: #fff; padding: 8px 14px; border-radius: 8px;
    font: 12px/1.5 -apple-system, system-ui, sans-serif;
    max-width: 320px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    pointer-events: none;
  `
  if (diag.supported) {
    badge.innerHTML = `<b>3D 球体已启用</b><br>显卡：${diag.renderer}<br>WebGL：${diag.version}`
  } else {
    badge.innerHTML = `<b>3D 球体降级为 2D</b><br>原因：${diag.reason}<br>建议：在 chrome://gpu 查看详情，或更新显卡驱动`
  }
  document.body.appendChild(badge)
  // 8 秒后自动消失
  setTimeout(() => badge.remove(), 8000)
}

