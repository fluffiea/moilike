import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const root = fileURLToPath(new URL('..', import.meta.url))

/** @type {typeof import('../src/core/views.ts')} */
let views

before(async () => {
  const dir = await mkdtemp(join(tmpdir(), 'moilike-views-'))
  const outfile = join(dir, 'views.mjs')
  await build({
    entryPoints: [join(root, 'src/core/views.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile,
    logLevel: 'silent',
  })
  views = await import(pathToFileURL(outfile).href)
  await rm(dir, { recursive: true, force: true })
})

function noon(daysAgo = 0) {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  return d.getTime() - daysAgo * 86400000
}

function post(patch = {}) {
  const now = noon(0)
  return {
    id: 'p',
    isMine: false,
    author: { name: '', avatarUrl: '' },
    body: '午餐',
    tags: [],
    images: [],
    recordAtMs: now,
    createdAtMs: now,
    state: 'awaiting_response',
    partnerOpenedAt: 0,
    partnerStickerId: '',
    partnerRespondedAt: 0,
    canRespond: true,
    ...patch,
  }
}

function ordered(items, mode) {
  return items.slice().sort((a, b) => views.reportRank(b, mode) - views.reportRank(a, mode))
}

function mapViews(items, mode) {
  const list = ordered(items, mode)
  return list.map((item, i) => views.reportView(item, list[i - 1], mode))
}

test('全部按记录时间，已回心降权，不把待回应顶上去', () => {
  const rows = mapViews(
    [
      post({ id: 'old-wait', recordAtMs: noon(0) - 60000, state: 'awaiting_response' }),
      post({ id: 'new-done', recordAtMs: noon(0), state: 'responded', partnerStickerId: 'hug', partnerRespondedAt: noon(0) }),
    ],
    'all',
  )
  assert.deepEqual(rows.map((row) => row.id), ['new-done', 'old-wait'])
  assert.equal(rows[0].dimmed, true)
  assert.equal(rows[0].quickReply, false)
  assert.equal(rows[0].showRespondedWhen, false)
  assert.equal(rows[0].sticker.id, 'hug')
  assert.equal(rows[1].dimmed, false)
  assert.equal(rows[1].quickReply, false)
  assert.equal(rows[1].listOpened, '')
  assert.equal(rows[0].day, '今天')
  assert.equal(rows[1].day, '')
  assert.equal(rows.every((row) => row.repliedDivider === false), true)
})

test('待我回应行可以快捷贴，已打开不进主行', () => {
  const row = views.reportView(
    post({ isMine: false, partnerOpenedAt: noon(0), state: 'awaiting_response' }),
    undefined,
    'await_me',
  )
  assert.equal(row.quickReply, true)
  assert.equal(row.dimmed, false)
  assert.equal(row.listOpened, '')
  assert.equal(row.openedHint, '')
})

test('我发的未回心在前；已回心段有弱分隔和回心时间；已打开只弱示', () => {
  const rows = mapViews(
    [
      post({
        id: 'done-new',
        isMine: true,
        recordAtMs: noon(0),
        state: 'responded',
        partnerStickerId: 'love',
        partnerRespondedAt: noon(0),
        canRespond: false,
      }),
      post({
        id: 'wait-old',
        isMine: true,
        recordAtMs: noon(3),
        state: 'awaiting_response',
        partnerOpenedAt: noon(3),
        canRespond: false,
      }),
      post({
        id: 'wait-mid',
        isMine: true,
        recordAtMs: noon(1),
        state: 'awaiting_response',
        canRespond: false,
      }),
    ],
    'mine',
  )
  assert.deepEqual(rows.map((row) => row.id), ['wait-mid', 'wait-old', 'done-new'])
  assert.equal(rows[0].listOpened, '')
  assert.equal(rows[0].repliedDivider, false)
  assert.equal(rows[0].day, '昨天')
  assert.equal(rows[1].listOpened, '对方已打开')
  assert.equal(rows[1].day !== '' && rows[1].day !== '今天' && rows[1].day !== '昨天', true)
  assert.equal(rows[2].repliedDivider, true)
  assert.equal(rows[2].showRespondedWhen, true)
  assert.equal(rows[2].dimmed, false)
  assert.equal(rows[2].quickReply, false)
  assert.equal(rows[2].day, '今天')
  assert.equal(rows[2].sticker.label, '爱你')
  assert.ok(rows[2].respondedWhen)
})

test('同一天里，已回心段仍单独带日期，而不是粘在上一段下面', () => {
  const rows = mapViews(
    [
      post({ id: 'wait', isMine: true, recordAtMs: noon(0), state: 'awaiting_response', canRespond: false }),
      post({
        id: 'done',
        isMine: true,
        recordAtMs: noon(0) - 60_000,
        state: 'responded',
        partnerStickerId: 'care',
        partnerRespondedAt: noon(0),
        canRespond: false,
      }),
    ],
    'mine',
  )
  assert.deepEqual(rows.map((row) => row.id), ['wait', 'done'])
  assert.equal(rows[0].day, '今天')
  assert.equal(rows[1].repliedDivider, true)
  assert.equal(rows[1].day, '今天')
})

test('全是已回心时不加「已回心」分隔', () => {
  const rows = mapViews(
    [
      post({ id: 'a', isMine: true, recordAtMs: noon(0), state: 'responded', partnerStickerId: 'ok', partnerRespondedAt: noon(0) }),
      post({ id: 'b', isMine: true, recordAtMs: noon(1), state: 'responded', partnerStickerId: 'seen', partnerRespondedAt: noon(1) }),
    ],
    'mine',
  )
  assert.deepEqual(
    rows.map((row) => row.repliedDivider),
    [false, false],
  )
})

test('详情保留全文和打开提示，不带列表分隔', () => {
  const row = views.reportView(
    post({
      isMine: true,
      body: '午餐\n面馆真好吃',
      partnerOpenedAt: noon(0),
      state: 'awaiting_response',
      canRespond: false,
    }),
    post({ id: 'prev' }),
    'detail',
  )
  assert.equal(row.headline, '午餐')
  assert.equal(row.rest, '面馆真好吃')
  assert.equal(row.day, '')
  assert.equal(row.openedHint, '对方已打开 · 暂未回心')
  assert.equal(row.listOpened, '')
  assert.equal(row.quickReply, false)
  assert.equal(row.repliedDivider, false)
  assert.match(row.time, /^今天 /)
})

test('列表模板不渲染正文、配图、标签和已打开长句', () => {
  const wxml = readFileSync(join(root, 'src/components/report-card/report-card.wxml'), 'utf8')
  const list = wxml.slice(wxml.indexOf('wx:else'))
  assert.ok(list.length > 0)
  assert.equal(list.includes('post.rest'), false)
  assert.equal(list.includes('image-grid'), false)
  assert.equal(list.includes('post.tags'), false)
  assert.equal(list.includes('openedHint'), false)
  assert.equal(list.includes('card--closed'), true)
  assert.equal(list.includes('待回应'), true)
  assert.equal(list.includes('已回心'), false)
  assert.equal(list.includes('post.quickReply'), true)
  assert.equal(list.includes('post.listOpened'), true)
  const detail = wxml.slice(0, wxml.indexOf('wx:else'))
  assert.equal(detail.includes('post.rest'), true)
  assert.equal(detail.includes('image-grid'), true)
  assert.equal(detail.includes('openedHint'), true)
})

test('共鸣页保留三段、按日分组、快捷贴和三栏空态', () => {
  const page = readFileSync(join(root, 'src/pages/resonance/resonance.wxml'), 'utf8')
  assert.equal((page.match(/class="tabs__item/g) || []).length, 3)
  assert.equal(page.includes('未阅'), false)
  assert.equal(page.includes('mo-day'), true)
  assert.equal(page.includes('已回心'), true)
  assert.equal(page.includes('class="mo-mask"'), true)
  assert.equal(page.includes('bind:tap="onCloseQuick"'), true)
  assert.equal(page.includes('bind:pick="onQuickSticker"'), true)
  assert.equal(page.includes('status="loading"'), true)
  assert.equal(page.includes('more-loading'), true)
  assert.equal(page.includes('都回完了'), false)
  const source = readFileSync(join(root, 'src/pages/resonance/resonance.ts'), 'utf8')
  assert.equal(source.includes("title: '都回完了'"), true)
  assert.equal(source.includes('对方的新报备会出现在这里；也可以去「全部」看看'), true)
  assert.equal(source.includes('记一件想告诉对方的小事吧'), true)
  assert.equal(source.includes('结伴后，你们的报备会出现在彼此的共鸣里'), true)
  assert.equal(source.includes('report.list'), true)
  assert.equal(source.includes('unread_first'), false)
  assert.equal(source.includes('reportRank'), true)
})

test('详情仍是一步贴纸，没有文字评价', () => {
  const wxml = readFileSync(join(root, 'src/subpackages/resonance/report-detail/report-detail.wxml'), 'utf8')
  assert.equal(wxml.includes('回一颗心'), true)
  assert.equal(wxml.includes('sticker-grid'), true)
  assert.equal(wxml.includes('status="loading"'), true)
  assert.equal(wxml.includes('status="error"'), true)
  assert.equal(wxml.includes('textarea'), false)
  assert.equal(wxml.includes('已阅'), false)
  const ts = readFileSync(join(root, 'src/subpackages/resonance/report-detail/report-detail.ts'), 'utf8')
  assert.equal(ts.includes('report.respond'), true)
  assert.equal(ts.includes('report.open'), true)
  assert.equal(ts.includes("reportView(post, undefined, 'detail')"), true)
})

test('贴纸文件是拍板后的 256 透明底，不是旧稿', () => {
  const ids = ['care', 'seen', 'eat', 'miss', 'ok', 'hug', 'proud', 'love']
  const ts = readFileSync(join(root, 'src/core/stickers.ts'), 'utf8')
  assert.deepEqual(
    [...ts.matchAll(/id: '([^']+)'/g)].map((m) => m[1]),
    ids,
  )
  assert.equal(ts.includes('收到啦'), true)
  assert.equal(ts.includes('爱你'), true)
  for (const id of ids) {
    const data = readFileSync(join(root, 'src/images/stickers', `${id}.png`))
    assert.equal(data.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
    assert.equal(data.readUInt32BE(16), 256)
    assert.equal(data.readUInt32BE(20), 256)
    assert.equal(data[25], 6)
    assert.ok(data.length > 20000, `${id} 仍是旧稿体积`)
  }
})
