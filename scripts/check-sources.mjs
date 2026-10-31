#!/usr/bin/env node
/**
 * 源码自检（不依赖微信开发者工具）。
 *
 * 检查项：
 *  1. miniprogram/**\/*.ts 中禁止出现可选链 `?.` 与空值合并 `??`
 *     —— 开发者工具对这两个语法支持不完整，会导致单文件编译失败、页面报「找不到 xxx.js」。
 *  2. cloudfunctions/<name>/common/utils.js 必须保持一致
 *     —— 云函数按目录独立部署，公共模块只能物理复制；本检查防止副本漂移。
 *  3. miniprogram 下不应存在与 .ts 同名的 .js（历史遗留的僵尸编译产物）。
 *
 * 退出码：0 通过，1 失败。
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\//, '')
const MINIPROGRAM_DIR = join(ROOT, 'miniprogram')
const CLOUDFUNCTIONS_DIR = join(ROOT, 'cloudfunctions')

const problems = []

function walk(dir, filter, out = []) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'miniprogram_npm' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, filter, out)
    else if (filter(full)) out.push(full)
  }
  return out
}

function toRel(full) {
  return relative(ROOT, full).split(sep).join('/')
}

/* ---------- 1. 禁止 ?. 与 ?? ---------- */
const FORBIDDEN = /\?\.[A-Za-z_$[{]|\?\?/
for (const file of walk(MINIPROGRAM_DIR, (f) => f.endsWith('.ts'))) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/)
  lines.forEach((line, i) => {
    if (line.includes('check-sources:allow')) return
    const trimmed = line.trim()
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) return
    if (FORBIDDEN.test(line)) {
      problems.push(`${toRel(file)}:${i + 1} 使用了 ?. 或 ??（开发者工具编译会失败，请改显式判空）：${trimmed}`)
    }
  })
}

/* ---------- 2. 云函数公共模块一致性 ---------- */
const sharedSource = join(ROOT, 'cloud-common', 'common-utils.js')
const copies = walk(CLOUDFUNCTIONS_DIR, (f) => /common[\\/]utils\.js$/.test(f))
if (copies.length > 1) {
  const reference = existsSync(sharedSource) ? sharedSource : copies[0]
  const referenceText = readFileSync(reference, 'utf8')
  for (const copy of copies) {
    if (copy === reference) continue
    if (readFileSync(copy, 'utf8') !== referenceText) {
      problems.push(`${toRel(copy)} 与 ${toRel(reference)} 不一致（运行 npm run sync:cloud-utils 重新生成）`)
    }
  }
}

/* ---------- 3. 僵尸 .js 文件 ---------- */
for (const file of walk(MINIPROGRAM_DIR, (f) => f.endsWith('.js'))) {
  const tsSibling = file.replace(/\.js$/, '.ts')
  if (existsSync(tsSibling)) {
    problems.push(`${toRel(file)} 是 ${toRel(tsSibling)} 的残留编译产物，应删除`)
  }
}

/* ---------- 4. WXSS 引用的设计令牌必须已定义 ---------- */
const APP_WXSS = join(MINIPROGRAM_DIR, 'app.wxss')
if (existsSync(APP_WXSS)) {
  const defined = new Set(
    [...readFileSync(APP_WXSS, 'utf8').matchAll(/--mo-[a-z0-9-]+(?=\s*:)/g)].map((m) => m[0]),
  )
  for (const file of walk(MINIPROGRAM_DIR, (f) => f.endsWith('.wxss'))) {
    if (file === APP_WXSS) continue
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .forEach((line, i) => {
        for (const m of line.matchAll(/var\((--mo-[a-z0-9-]+)/g)) {
          if (!defined.has(m[1])) {
            problems.push(`${toRel(file)}:${i + 1} 引用了未定义的令牌 ${m[1]}（在 app.wxss 的 page 选择器中定义）`)
          }
        }
      })
  }
}

/* ---------- 5. cloudfunctions/ 下只能有真正的云函数目录 ---------- */
// cloudfunctionRoot 的每个子目录都会被开发者工具当成云函数；
// 放非函数目录进去，误点「上传全部云函数」会生成 CreateFailed 记录（无法更新，只能删除重建）。
// 空目录不算问题：开发者工具会按云端函数列表回写空目录，删了也可能再出现。
for (const entry of readdirSync(CLOUDFUNCTIONS_DIR)) {
  const full = join(CLOUDFUNCTIONS_DIR, entry)
  if (!statSync(full).isDirectory()) continue
  if (entry === 'node_modules' || entry.startsWith('.')) continue
  const entries = readdirSync(full).filter((n) => n !== 'node_modules')
  if (entries.length === 0) continue
  if (!existsSync(join(full, 'index.js'))) {
    problems.push(`cloudfunctions/${entry}/ 不是云函数（缺 index.js），不应放在 cloudfunctionRoot 下`)
  }
}

/* ---------- 输出 ---------- */
if (problems.length === 0) {
  console.log('[check-sources] 通过')
  process.exit(0)
}
console.error(`[check-sources] 发现 ${problems.length} 个问题：`)
for (const p of problems) console.error('  - ' + p)
process.exit(1)
