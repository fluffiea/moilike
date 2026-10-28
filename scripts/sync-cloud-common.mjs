#!/usr/bin/env node
/**
 * 把 cloudfunctions/_shared/common-utils.js 同步到各云函数的 common/utils.js。
 *
 * 为什么需要复制而不是 require 上级目录：
 * 微信云函数按目录独立上传部署，`require('../common/utils')` 不会被打包进函数目录，
 * 因此跨函数复用的代码必须以物理副本存在于各自目录。
 *
 * 单一源：cloudfunctions/_shared/common-utils.js
 * 用法：npm run sync:cloud-utils
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CLOUDFUNCTIONS_DIR = join(ROOT, 'cloudfunctions')
const SOURCE = join(CLOUDFUNCTIONS_DIR, '_shared', 'common-utils.js')

if (!existsSync(SOURCE)) {
  console.error(`[sync-cloud-utils] 找不到单一源：${SOURCE}`)
  process.exit(1)
}

const sourceText = readFileSync(SOURCE, 'utf8')
const targets = readdirSync(CLOUDFUNCTIONS_DIR)
  .filter((name) => name !== '_shared')
  .map((name) => join(CLOUDFUNCTIONS_DIR, name, 'common', 'utils.js'))
  .filter((file) => existsSync(file))

if (targets.length === 0) {
  console.error('[sync-cloud-utils] 未找到任何 cloudfunctions/<name>/common/utils.js')
  process.exit(1)
}

let changed = 0
for (const file of targets) {
  const current = readFileSync(file, 'utf8')
  if (current === sourceText) continue
  writeFileSync(file, sourceText)
  console.log('[sync-cloud-utils] 已更新 ' + file.slice(ROOT.length + 1))
  changed++
}

console.log(`[sync-cloud-utils] 完成：${targets.length} 个副本，${changed} 个更新`)
