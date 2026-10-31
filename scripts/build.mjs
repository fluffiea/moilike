#!/usr/bin/env node
/**
 * 把 src/ 编译到 miniprogram/（开发者工具读取的目录）。
 *
 * - .ts 逐文件用 esbuild 转成 ES2017 + CommonJS（不打包，保留目录结构与 require 关系）
 * - 其余文件（wxml / wxss / json / 图片）原样复制
 *
 * 用法：node scripts/build.mjs [--watch]
 */
import { transform } from 'esbuild'
import { mkdir, readFile, readdir, rm, writeFile, copyFile, stat } from 'node:fs/promises'
import { watch } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'src')
const OUT = join(ROOT, 'miniprogram')
const WATCH = process.argv.includes('--watch')

function outPathFor(srcFile) {
  const rel = relative(SRC, srcFile)
  return join(OUT, rel.endsWith('.ts') ? rel.slice(0, -3) + '.js' : rel)
}

async function buildFile(srcFile) {
  if (srcFile.endsWith('.d.ts')) return
  const out = outPathFor(srcFile)
  await mkdir(dirname(out), { recursive: true })
  if (!srcFile.endsWith('.ts')) {
    await copyFile(srcFile, out)
    return
  }
  const code = await readFile(srcFile, 'utf8')
  const result = await transform(code, {
    loader: 'ts',
    format: 'cjs',
    target: 'es2017',
    sourcefile: relative(ROOT, srcFile).split(sep).join('/'),
    // 内联 sourcemap 只在开发时带上，避免上传包体积膨胀
    sourcemap: WATCH ? 'inline' : false,
  })
  await writeFile(out, result.code)
}

async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) await walk(full, out)
    else out.push(full)
  }
  return out
}

async function buildAll() {
  const started = Date.now()
  await rm(OUT, { recursive: true, force: true })
  const files = await walk(SRC)
  const failures = []
  await Promise.all(
    files.map((f) =>
      buildFile(f).catch((e) => {
        failures.push(`${relative(ROOT, f)}: ${e.message}`)
      }),
    ),
  )
  if (failures.length > 0) {
    console.error(`[build] ${failures.length} 个文件编译失败：`)
    for (const f of failures) console.error('  - ' + f)
    return false
  }
  console.log(`[build] ${files.length} 个文件 → miniprogram/（${Date.now() - started}ms）`)
  return true
}

function startWatch() {
  const pending = new Map()
  watch(SRC, { recursive: true }, (_event, name) => {
    if (!name || name.split(sep).some((seg) => seg.startsWith('.'))) return
    const full = join(SRC, name)
    clearTimeout(pending.get(full))
    pending.set(
      full,
      setTimeout(async () => {
        pending.delete(full)
        const exists = await stat(full).then((s) => s.isFile(), () => false)
        try {
          if (exists) await buildFile(full)
          else await rm(outPathFor(full), { force: true })
          console.log(`[watch] ${exists ? '更新' : '删除'} ${name}`)
        } catch (e) {
          console.error(`[watch] ${name}: ${e.message}`)
        }
      }, 50),
    )
  })
  console.log('[watch] 监听 src/ 变更中…')
}

const ok = await buildAll()
if (WATCH) startWatch()
else if (!ok) process.exit(1)
