// ============================================================
// 轻量 Markdown 解析器（自包含，无依赖）
// 支持：标题 H1-H3 / 加粗 / 斜体 / 高亮 / 行内代码 / 引用块 /
//       无序列表 / 有序列表 / 代码块 / 图片 / 超链接 / 分隔线 / 段落
// 不支持复杂嵌套（表格、脚注等），保证小而稳
// 输出：HTML 字符串，已转义用户输入的尖括号防止 XSS
// ============================================================

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// 行内格式：加粗 **xxx** / 斜体 *xxx* / 高亮 ==xxx== / 行内代码 `xxx` / 图片 ![](url) / 链接 [](url)
function parseInline(text) {
  let s = escapeHtml(text)

  // 图片：![alt](url)  —— 必须先于普通链接解析
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, url) => {
    const safeAlt = alt.replace(/"/g, '&quot;')
    const safeUrl = encodeURI(url)
    return `<img src="${safeUrl}" alt="${safeAlt}" loading="lazy" class="evo-md-img" />`
  })

  // 链接：[text](url)
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, txt, url) => {
    const safeUrl = encodeURI(url)
    return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="evo-md-link">${txt}</a>`
  })

  // 行内代码：`xxx`
  s = s.replace(/`([^`]+)`/g, '<code class="evo-md-code-inline">$1</code>')

  // 高亮：==xxx==
  s = s.replace(/==([^=]+)==/g, '<mark class="evo-md-mark">$1</mark>')

  // 加粗：**xxx**
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong class="evo-md-strong">$1</strong>')

  // 斜体：*xxx*（在加粗之后处理，避免误吞）
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em class="evo-md-em">$2</em>')

  return s
}

// 主入口：把一段 Markdown 文本转成 HTML 字符串
export function parseMarkdown(src) {
  if (!src) return ''

  const lines = String(src).replace(/\r\n/g, '\n').split('\n')
  const blocks = []
  let i = 0
  let inCodeBlock = false
  let codeBuf = []
  let listType = null // 'ul' | 'ol'
  let listBuf = []

  const flushList = () => {
    if (!listBuf.length) return
    const tag = listType === 'ol' ? 'ol' : 'ul'
    blocks.push(`<${tag} class="evo-md-${tag}">${listBuf.join('')}</${tag}>`)
    listBuf = []
    listType = null
  }

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    // 代码块围栏 ``` 或 ~~~
    const fence = line.match(/^(`{3,}|~{3,})\s*([\w-]*)\s*$/)
    if (fence) {
      if (!inCodeBlock) {
        flushList()
        inCodeBlock = true
        codeBuf = []
      } else {
        blocks.push(`<pre class="evo-md-code-block"><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`)
        inCodeBlock = false
        codeBuf = []
      }
      i++
      continue
    }
    if (inCodeBlock) {
      codeBuf.push(line)
      i++
      continue
    }

    // 空行：结束当前列表
    if (!trimmed) {
      flushList()
      i++
      continue
    }

    // 分隔线 ---
    if (/^-{3,}$/.test(trimmed) || /^\*{3,}$/.test(trimmed)) {
      flushList()
      blocks.push('<hr class="evo-md-hr" />')
      i++
      continue
    }

    // 标题 # ## ###
    const h = trimmed.match(/^(#{1,3})\s+(.*)$/)
    if (h) {
      flushList()
      const level = h[1].length
      blocks.push(`<h${level} class="evo-md-h${level}">${parseInline(h[2])}</h${level}>`)
      i++
      continue
    }

    // 引用块 >
    const quote = trimmed.match(/^>\s?(.*)$/)
    if (quote) {
      flushList()
      const buf = [quote[1]]
      while (i + 1 < lines.length && /^>\s?/.test(lines[i + 1].trim())) {
        i++
        buf.push(lines[i].trim().replace(/^>\s?/, ''))
      }
      blocks.push(`<blockquote class="evo-md-blockquote">${parseInline(buf.join(' '))}</blockquote>`)
      i++
      continue
    }

    // 无序列表 - / * / +
    const ul = trimmed.match(/^[-*+]\s+(.*)$/)
    if (ul) {
      if (listType && listType !== 'ul') flushList()
      listType = 'ul'
      listBuf.push(`<li class="evo-md-li">${parseInline(ul[1])}</li>`)
      i++
      continue
    }

    // 有序列表 1. 2.
    const ol = trimmed.match(/^\d+\.\s+(.*)$/)
    if (ol) {
      if (listType && listType !== 'ol') flushList()
      listType = 'ol'
      listBuf.push(`<li class="evo-md-li">${parseInline(ol[1])}</li>`)
      i++
      continue
    }

    // 普通段落：连续非空非特殊行合并
    flushList()
    const paraBuf = [trimmed]
    while (
      i + 1 < lines.length &&
      lines[i + 1].trim() &&
      !/^(#{1,3}\s|>\s?|[-*+]\s|\d+\.\s|```|~~~|---|\*\*\*)/.test(lines[i + 1].trim())
    ) {
      i++
      paraBuf.push(lines[i].trim())
    }
    blocks.push(`<p class="evo-md-p">${parseInline(paraBuf.join(' '))}</p>`)
    i++
  }

  // 收尾
  if (inCodeBlock) {
    blocks.push(`<pre class="evo-md-code-block"><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`)
  }
  flushList()

  return blocks.join('\n')
}

// 兼容旧调用：作为 textToParagraphs 的并行函数
export function paragraphsToHtml(text) {
  return parseMarkdown(text)
}
