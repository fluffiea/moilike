#!/usr/bin/env node
/**
 * 源码自检（不依赖微信开发者工具）。退出码：0 通过，1 失败。
 *
 *  1. src/ 下只放源码：不应出现 .js（编译产物在 miniprogram/）
 *  2. WXSS 引用的 var(--mo-*) 必须在 src/app.wxss 的 page 选择器中定义
 *  3. Skyline 兼容：WXSS 禁用 * 通配选择器；列方向 flex 容器禁用 gap
 *  4. Skyline 兼容：<text> 内不要换行 + 插值混排（部分真机中文显示为方块）
 *  5. usingComponents 指向的组件必须存在
 *  6. cloudfunctions/ 下每个非空目录都必须是云函数（有 index.js）
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'src')
const CLOUDFUNCTIONS = join(ROOT, 'cloudfunctions')
const problems = []

function walk(dir, filter, out = []) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, filter, out)
    else if (filter(full)) out.push(full)
  }
  return out
}

const rel = (full) => relative(ROOT, full).split(sep).join('/')
const lineOf = (text, index) => text.slice(0, index).split('\n').length

/* 1 */
for (const file of walk(SRC, (f) => f.endsWith('.js'))) {
  problems.push(`${rel(file)}：src/ 只放 TS 源码，.js 产物应只出现在 miniprogram/`)
}

/* 2 + 3 */
const appWxss = join(SRC, 'app.wxss')
const defined = new Set(
  [...readFileSync(appWxss, 'utf8').matchAll(/(--mo-[a-z0-9-]+)\s*:/g)].map((m) => m[1]),
)
for (const file of walk(SRC, (f) => f.endsWith('.wxss'))) {
  const text = readFileSync(file, 'utf8')
  for (const m of text.matchAll(/var\((--mo-[a-z0-9-]+)/g)) {
    if (!defined.has(m[1])) {
      problems.push(`${rel(file)}:${lineOf(text, m.index)} 引用了未定义的令牌 ${m[1]}`)
    }
  }
  const noComments = text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
  for (const m of noComments.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    const [, selector, body] = m
    if (/(^|[\s,>+~])\*(?![=])/.test(selector)) {
      problems.push(`${rel(file)}:${lineOf(noComments, m.index)} Skyline 不支持 * 通配选择器`)
    }
    if (/flex-direction\s*:\s*column/.test(body) && /(^|[;\s])(row-)?gap\s*:/.test(body)) {
      problems.push(`${rel(file)}:${lineOf(noComments, m.index)} 列方向 flex 容器不要用 gap（Skyline 间距会丢失），改用子元素 margin`)
    }
  }
}

/* 4 */
for (const file of walk(SRC, (f) => f.endsWith('.wxml'))) {
  const text = readFileSync(file, 'utf8')
  for (const m of text.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)) {
    if (m[1].includes('\n') && m[1].includes('{{')) {
      problems.push(`${rel(file)}:${lineOf(text, m.index)} <text> 内容请写在同一行（换行 + 插值在 Skyline 真机易出现方块）`)
    }
  }
}

/* 5 */
for (const file of walk(SRC, (f) => f.endsWith('.json'))) {
  let json
  try {
    json = JSON.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    problems.push(`${rel(file)} 不是合法 JSON：${e.message}`)
    continue
  }
  const using = json && json.usingComponents ? json.usingComponents : {}
  for (const [name, path] of Object.entries(using)) {
    const base = path.startsWith('/') ? join(SRC, path) : resolve(dirname(file), path)
    if (!existsSync(base + '.ts') && !existsSync(base + '.json')) {
      problems.push(`${rel(file)} 引用的组件 ${name} → ${path} 不存在`)
    }
  }
}

/* 6 */
for (const entry of readdirSync(CLOUDFUNCTIONS)) {
  const full = join(CLOUDFUNCTIONS, entry)
  if (!statSync(full).isDirectory() || entry === 'node_modules' || entry.startsWith('.')) continue
  const entries = readdirSync(full).filter((n) => n !== 'node_modules')
  if (entries.length > 0 && !existsSync(join(full, 'index.js'))) {
    problems.push(`cloudfunctions/${entry}/ 缺 index.js，不应放在 cloudfunctionRoot 下`)
  }
}

if (problems.length === 0) {
  console.log('[check-sources] 通过')
  process.exit(0)
}
console.error(`[check-sources] 发现 ${problems.length} 个问题：`)
for (const p of problems) console.error('  - ' + p)
process.exit(1)
