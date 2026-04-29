/**
 * Tailwind v4 → WXSS：PostCSS + weapp createStyleHandler
 * 改完 WXML/TS 里的 class 后执行：pnpm build:tw
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { createStyleHandler } from '@weapp-tailwindcss/postcss'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const inputPath = path.join(root, 'miniprogram/app.css')
const outPath = path.join(root, 'miniprogram/tailwind.wxss')

const input = fs.readFileSync(inputPath, 'utf8')
const result = await postcss([tailwind]).process(input, { from: inputPath })
const handler = createStyleHandler()
const wxss = await handler(result.css)
const css = typeof wxss === 'string' ? wxss : wxss.css

fs.writeFileSync(outPath, `/* 自动生成：pnpm build:tw */\n${css}`, 'utf8')
console.log('build:tw →', path.relative(root, outPath), `(${css.length} bytes)`)
