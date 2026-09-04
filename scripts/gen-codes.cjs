#!/usr/bin/env node
/**
 * ============================================================
 * 卡密 / 兑换码 批量生成器
 * ============================================================
 * 用法：
 *   1. 打开命令行（Windows 终端 / Mac 终端）
 *   2. 进入项目根目录（echoverse 文件夹里）
 *   3. 运行：
 *
 *      node scripts/gen-codes.js 1000
 *           ↑ 生成 1000 个卡密，输出到 stdout（直接复制粘贴去链动小铺上传）
 *
 *      node scripts/gen-codes.js 500 codes-daofa.txt
 *           ↑ 生成 500 个，保存为 codes-daofa.txt（每行一个，直接上传）
 *
 *      node scripts/gen-codes.js 200 --group 4 --sep "-"
 *           ↑ 每 4 字符一组，中间用 "-" 分隔（默认 3 组共 12 位：AAAA-BBBB-CCCC）
 *
 * 卡密格式（默认）：
 *   12 位大写字母 + 数字，每 4 位一组用短横分隔：
 *   例如：A7K2-9XYP-3B5D
 *
 * 字符集：默认剔除易混淆的 0/O/1/I/L，避免用户输错
 * ============================================================
 */

const fs = require('fs')
const path = require('path')

const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // 去除 0/O/1/I/L

function rndChar() {
  return CHARS[Math.floor(Math.random() * CHARS.length)]
}

function genOne(totalLength = 12, group = 4, sep = '-') {
  let raw = ''
  for (let i = 0; i < totalLength; i++) raw += rndChar()
  if (!group || group <= 0) return raw
  const parts = []
  for (let i = 0; i < raw.length; i += group) {
    parts.push(raw.slice(i, i + group))
  }
  return parts.join(sep)
}

function parseArgs(argv) {
  const args = argv.slice(2)
  const result = { count: 500, out: '', length: 12, group: 4, sep: '-' }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--group' || a === '-g') {
      result.group = parseInt(args[++i] || '4', 10) || 0
      continue
    }
    if (a === '--sep' || a === '-s') {
      result.sep = args[++i] || ''
      continue
    }
    if (a === '--length' || a === '-l') {
      result.length = parseInt(args[++i] || '12', 10) || 12
      continue
    }
    if (a === '--help' || a === '-h') {
      result.help = true
      continue
    }
    if (!result._count && /^\d+$/.test(a)) {
      result.count = parseInt(a, 10)
      result._count = true
      continue
    }
    if (!result.out && a.endsWith('.txt')) {
      result.out = a
    } else if (!result.out) {
      // 第二个 positional 参数当作文件名
      result.out = a
    }
  }
  return result
}

function main() {
  const opt = parseArgs(process.argv)
  if (opt.help) {
    console.log(`
卡密生成器 · 用法：
  node ${path.basename(process.argv[1])} <数量> [输出文件.txt] [选项]

示例：
  node scripts/gen-codes.js 1000
        生成 1000 个 12 位兑换码（3 组 4 位），在终端里打印

  node scripts/gen-codes.js 500 output.txt
        生成 500 个保存到 output.txt（每行一个，直接去链动小铺批量上传）

选项：
  -g, --group <数字>   每几位一组（默认 4；0 表示不分组）
  -s, --sep   <字符>   分组分隔符（默认 "-"）
  -l, --length <数字>  总位数（默认 12）
  -h, --help           显示本帮助
`)
    process.exit(0)
  }

  const set = new Set()
  let safety = 0
  while (set.size < opt.count) {
    set.add(genOne(opt.length, opt.group, opt.sep))
    if (++safety > opt.count * 100) break
  }
  const lines = [...set]

  if (opt.out) {
    const outPath = path.isAbsolute(opt.out) ? opt.out : path.resolve(process.cwd(), opt.out)
    fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
    console.log(`✅ 已生成 ${lines.length} 个兑换码 → ${outPath}`)
    console.log(`   格式：${lines[0]}${lines[1] ? ` / ${lines[1]}` : ''}${lines[2] ? ` / ${lines[2]}` : ''} ...`)
  } else {
    console.log(lines.join('\n'))
  }
}

main()
