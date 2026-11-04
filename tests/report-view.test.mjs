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
  const isMine = !!patch.isMine
  return {
    id: 'p',
    isMine,
    author: { name: isMine ? '阿杏' : '阿桃', avatarUrl: 'https://example.test/avatars/a.png' },
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

function mapViews(items, mode = 'all') {
  return items.map((item, i) => views.reportView(item, items[i - 1], mode))
}

test('一条流按记录时间排，同一天只在第一条带日期；署名用头像和昵称', () => {
  const rows = mapViews([
    post({ id: 'today' }),
    post({ id: 'yesterday', recordAtMs: noon(1) }),
  ])
  assert.deepEqual(
    rows.map((row) => row.id),
    ['today', 'yesterday'],
  )
  assert.equal(rows[0].day, '今天')
  assert.equal(rows[0].authorName, '阿桃')
  assert.equal(rows[0].authorInitial, '阿')
  assert.equal(rows[0].clock, '12:00')
  assert.equal(rows[1].day, '昨天')
  assert.equal(views.reportView(post({ isMine: true }), undefined, 'all').authorName, '阿杏')
  const anonymous = views.reportView(post({ author: { name: '', avatarUrl: '' } }), undefined, 'all')
  assert.equal(anonymous.authorName, 'Ta')
  assert.equal(anonymous.authorInitial, 'T')
})

test('对方发的还没回心：等你的回声 + 回心入口', () => {
  const row = views.reportView(post(), undefined, 'all')
  assert.equal(row.echo.wait, '等你的回声')
  assert.equal(row.echo.action, true)
  assert.equal(row.echo.sticker, null)
  assert.equal(row.echo.meta, '')
  assert.equal(row.echo.label, '')
})

test('我发的还没回心：等 Ta 的回声；打开过就标 Ta 已打开', () => {
  const waiting = views.reportView(post({ isMine: true }), undefined, 'all')
  assert.equal(waiting.echo.wait, '等 Ta 的回声')
  assert.equal(waiting.echo.meta, '')
  assert.equal(waiting.echo.action, false)
  const opened = views.reportView(post({ isMine: true, partnerOpenedAt: noon(0) }), undefined, 'all')
  assert.equal(opened.echo.meta, 'Ta 已打开')
})

test('已回心：贴纸、谁回的心和相对时间', () => {
  const mine = views.reportView(
    post({ isMine: true, state: 'responded', partnerStickerId: 'hug', partnerRespondedAt: noon(0) }),
    undefined,
    'all',
  )
  assert.equal(mine.echo.sticker.id, 'hug')
  assert.equal(mine.echo.sticker.label, '抱抱')
  assert.equal(mine.echo.label, '抱抱')
  assert.match(mine.echo.meta, /^Ta 回心 · /)
  assert.ok(mine.echo.when)
  assert.equal(mine.echo.wait, '')
  assert.equal(mine.echo.action, false)

  const partner = views.reportView(
    post({ state: 'responded', partnerStickerId: 'seen', partnerRespondedAt: noon(1) }),
    undefined,
    'all',
  )
  assert.match(partner.echo.meta, /^我回心 · /)
})

test('旧数据只有文字评价时，回声槽给「已回心」兜底', () => {
  const row = views.reportView(
    post({ isMine: true, state: 'responded', partnerStickerId: '', partnerRespondedAt: noon(1) }),
    undefined,
    'all',
  )
  assert.equal(row.echo.sticker, null)
  assert.equal(row.echo.label, '已回心')
  assert.match(row.echo.meta, /^Ta 回心 · /)
})

test('列表正文压成一段，详情保留换行和完整日期', () => {
  const body = '午餐\n面馆真好吃\n下次再去'
  const list = views.reportView(post({ body }), undefined, 'all')
  assert.equal(list.preview, '午餐 面馆真好吃 下次再去')
  assert.equal(list.clock, '12:00')
  const detail = views.reportView(post({ body }), post({ id: 'prev' }), 'detail')
  assert.equal(detail.preview, body)
  assert.equal(detail.day, '')
  assert.match(detail.clock, /^今天 12:00$/)
})

test('列表只给首图封面和 +N；署名只放两个标签，余量折成 +N', () => {
  const images = [
    { id: 'a', thumb: 'thumb-a', url: 'url-a' },
    { id: 'b', thumb: 'thumb-b', url: 'url-b' },
  ]
  const row = views.reportView(post({ images, tags: ['干饭', '日常'] }), undefined, 'all')
  assert.equal(row.cover, 'thumb-a')
  assert.equal(row.moreShotsLabel, '+1')
  assert.deepEqual(row.tagChips, ['干饭', '日常'])
  assert.equal(row.tagMore, '')
  const single = views.reportView(post({ images: [images[0]] }), undefined, 'all')
  assert.equal(single.moreShotsLabel, '')
  const many = views.reportView(post({ tags: ['干饭', '日常', '想念', '下班'] }), undefined, 'all')
  assert.deepEqual(many.tagChips, ['干饭', '日常'])
  assert.equal(many.tagMore, '+2')
  assert.equal(views.reportView(post(), undefined, 'all').tagChips.length, 0)
})

test('已共鸣：按年月分组，卡片写「4日 21:04」，回声只写谁回的心', () => {
  const now = new Date()
  const thisMonth = `${now.getFullYear()}年${now.getMonth() + 1}月`
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 15, 12, 0, 0, 0)
  const lastMonth = `${lastMonthDate.getFullYear()}年${lastMonthDate.getMonth() + 1}月`
  const items = [
    post({ id: 'done-mine', isMine: true, state: 'responded', partnerStickerId: 'hug', partnerRespondedAt: noon(0), recordAtMs: noon(0) }),
    post({ id: 'done-partner', state: 'responded', partnerStickerId: 'seen', partnerRespondedAt: noon(1), recordAtMs: noon(1) }),
    post({
      id: 'old',
      isMine: true,
      state: 'responded',
      partnerStickerId: 'love',
      partnerRespondedAt: lastMonthDate.getTime(),
      recordAtMs: lastMonthDate.getTime(),
    }),
  ]
  const rows = items.map((item, i) => views.reportView(item, items[i - 1], 'archive'))
  assert.equal(rows[0].month, thisMonth)
  assert.equal(rows[1].month, '')
  assert.equal(rows[2].month, lastMonth)
  assert.equal(rows[0].day, '')
  assert.equal(rows[0].clock, `${new Date(noon(0)).getDate()}日 12:00`)
  assert.equal(rows[0].echo.meta, 'Ta 回心')
  assert.equal(rows[1].echo.meta, '我回心')
  assert.equal(rows[0].echo.sticker.id, 'hug')
  assert.equal(rows[0].echo.action, false)
  assert.equal(rows[1].echo.action, false)
  assert.equal(rows[0].preview, '午餐')
})

test('已共鸣入口与档案页：只读、按年月、不能回心', () => {
  const app = JSON.parse(readFileSync(join(root, 'src/app.json'), 'utf8'))
  const pack = app.subpackages.find((p) => p.root === 'subpackages/resonance')
  assert.equal(pack.pages.includes('report-echoes/report-echoes'), true)
  const page = readFileSync(join(root, 'src/subpackages/resonance/report-echoes/report-echoes.wxml'), 'utf8')
  assert.equal(page.includes('已共鸣'), true)
  assert.equal(page.includes('item.month'), true)
  assert.equal(page.includes('book'), true)
  assert.equal(page.includes('onQuickSticker'), false)
  assert.equal(page.includes('写报备'), false)
  const pageTs = readFileSync(join(root, 'src/subpackages/resonance/report-echoes/report-echoes.ts'), 'utf8')
  assert.equal(pageTs.includes("filter: 'echoed'"), true)
  assert.equal(pageTs.includes("'archive'"), true)
  assert.equal(pageTs.includes('sortKey'), true)
  const card = readFileSync(join(root, 'src/components/report-card/report-card.wxml'), 'utf8')
  assert.equal(card.includes('post.isMine && !book'), true)
  const cardTs = readFileSync(join(root, 'src/components/report-card/report-card.ts'), 'utf8')
  assert.equal(cardTs.includes('if (this.data.book) return'), true)
  const list = readFileSync(join(root, 'src/pages/resonance/resonance.wxml'), 'utf8')
  assert.equal(list.includes('onEchoes'), true)
  assert.equal(list.includes('已共鸣'), true)
  const paths = readFileSync(join(root, 'src/core/paths.ts'), 'utf8')
  assert.equal(paths.includes('PAGE_REPORT_ECHOES'), true)
})

test('详情不给快捷回心；列表两种筛选都给', () => {
  assert.equal(views.reportView(post(), undefined, 'detail').echo.action, false)
  assert.equal(views.reportView(post(), undefined, 'all').echo.action, true)
  assert.equal(views.reportView(post(), undefined, 'await_me').echo.action, true)
  assert.equal(views.reportView(post({ isMine: true }), undefined, 'await_me').echo.action, false)
})

test('共鸣模板：两条文字筛选、单条流、回声槽和未结伴引导', () => {
  const page = readFileSync(join(root, 'src/pages/resonance/resonance.wxml'), 'utf8')
  assert.equal((page.match(/aria-role="tab"/g) || []).length, 2)
  assert.equal(page.includes('全部'), true)
  assert.equal(page.includes('等我回声'), true)
  assert.equal(page.includes('report-card'), true)
  assert.equal(page.includes('onQuickSticker'), true)
  assert.equal(page.includes('mo-guide'), true)
  assert.equal(page.includes('swiper'), false)
  assert.equal(page.includes('tabs'), false)
  assert.equal(page.includes('我发的'), false)
  assert.equal(page.includes('待我回应'), false)
  const source = readFileSync(join(root, 'src/pages/resonance/resonance.ts'), 'utf8')
  assert.equal(source.includes('report.list'), true)
  assert.equal(source.includes("pageErrorIfEmpty: filter === 'await_me'"), true)
  assert.equal(source.includes('orderMineUnreadFirst'), false)
  assert.equal(source.includes('unread_first'), false)
  assert.equal(source.includes('disposeFeed'), true)
})

test('报备卡：照片刊头 + 真人署名 + 页脚回声带，详情用整组图片', () => {
  const wxml = readFileSync(join(root, 'src/components/report-card/report-card.wxml'), 'utf8')
  const listStart = wxml.indexOf('<view wx:else class="card')
  assert.ok(listStart > 0)
  const list = wxml.slice(listStart)
  assert.ok(list.length > 0)
  assert.equal(list.includes('image-grid'), false)
  assert.equal(list.includes('post.cover'), true)
  assert.equal(list.includes('photo__img'), true)
  assert.equal(list.includes('post.moreShotsLabel'), true)
  assert.equal(list.includes('photo__count'), true)
  assert.equal(list.includes('post.preview'), true)
  assert.equal(list.includes('max-lines="4"'), true)
  assert.equal(list.includes('post.author.avatarUrl'), true)
  assert.equal(list.includes('post.authorName'), true)
  assert.equal(list.includes('post.tagChips'), true)
  assert.equal(list.includes('post.echo.wait'), true)
  assert.equal(list.includes('post.echo.action'), true)
  assert.equal(list.includes('post.echo.label'), true)
  assert.equal(list.includes('post.echo.meta'), true)
  assert.equal(list.includes('byline__ava'), true)
  assert.equal(list.includes('回心'), true)
  assert.equal(list.includes('post.rest'), false)
  assert.equal(list.includes('dimmed'), false)
  assert.equal(list.includes('post.who'), false)
  assert.equal(list.includes('post.tagLine'), false)
  const detail = wxml.slice(0, listStart)
  assert.equal(detail.includes('image-grid'), true)
  assert.equal(detail.includes('post.preview'), true)
  assert.equal(detail.includes('post.author.avatarUrl'), true)
  assert.equal(detail.includes('post.tagChips'), true)
  assert.equal(detail.includes('post.echo'), true)
  assert.equal(detail.includes('post.echo.action'), false)
})

test('详情仍是一步贴纸，可以换一颗心，没有文字评价', () => {
  const wxml = readFileSync(join(root, 'src/subpackages/resonance/report-detail/report-detail.wxml'), 'utf8')
  assert.equal(wxml.includes('{{respondTitle}}'), true)
  assert.equal(wxml.includes('{{currentLine}}'), true)
  assert.equal(wxml.includes('sticker-grid'), true)
  assert.equal(wxml.includes('current-id="{{post.partnerStickerId}}"'), true)
  assert.equal(wxml.includes('status="loading"'), true)
  assert.equal(wxml.includes('status="error"'), true)
  assert.equal(wxml.includes('textarea'), false)
  assert.equal(wxml.includes('已阅'), false)
  const ts = readFileSync(join(root, 'src/subpackages/resonance/report-detail/report-detail.ts'), 'utf8')
  assert.equal(ts.includes('report.respond'), true)
  assert.equal(ts.includes('report.open'), true)
  assert.equal(ts.includes("reportView(post, undefined, 'detail')"), true)
  assert.equal(ts.includes('RESPOND_AGAIN_TITLE'), true)
})

test('写报备：标签不再默认选中，记录时间并成一行', () => {
  const wxml = readFileSync(join(root, 'src/subpackages/resonance/report-compose/report-compose.wxml'), 'utf8')
  assert.equal(wxml.includes('记一件想告诉 Ta 的小事…'), true)
  assert.equal(wxml.includes('记录时间'), true)
  const ts = readFileSync(join(root, 'src/subpackages/resonance/report-compose/report-compose.ts'), 'utf8')
  assert.equal(ts.includes('this.selected = []'), true)
  assert.equal(ts.includes('this.selected = [DEFAULT_TAG]'), false)
})

test('偏好设置只剩全部 / 等我回声，旧「我发的」按全部处理', () => {
  const ts = readFileSync(join(root, 'src/subpackages/user/preferences/preferences.ts'), 'utf8')
  assert.equal(ts.includes("value: 'mine'"), false)
  assert.equal(ts.includes('等我回声'), true)
  assert.equal((ts.match(/value: '/g) || []).length, 2)
  const text = readFileSync(join(root, 'src/subpackages/user/preferences/preferences.wxml'), 'utf8')
  assert.equal(text.includes('页面上方切换'), true)
  const format = readFileSync(join(root, 'src/core/format.ts'), 'utf8')
  assert.equal(format.includes("if (raw === 'mine') return 'all'"), true)
  assert.equal(format.includes("raw === 'action_needed'"), true)
  const profile = readFileSync(join(root, 'cloudfunctions/api/lib/profile.js'), 'utf8')
  assert.equal(profile.includes(": 'all' }"), true)
  const compose = readFileSync(join(root, 'src/subpackages/resonance/report-compose/report-compose.ts'), 'utf8')
  assert.equal(compose.includes('不能记录未来的时间'), true)
  const reportRoute = readFileSync(join(root, 'cloudfunctions/api/routes/report.js'), 'utf8')
  assert.equal(reportRoute.includes('不能记录未来的时间'), true)
})

test('贴纸沿用改版前的 256 透明底线稿', () => {
  const sizes = {
    care: 11959,
    seen: 11744,
    eat: 8111,
    miss: 4491,
    ok: 7248,
    hug: 7055,
    proud: 8341,
    love: 4299,
  }
  const ts = readFileSync(join(root, 'src/core/stickers.ts'), 'utf8')
  assert.deepEqual(
    [...ts.matchAll(/id: '([^']+)'/g)].map((m) => m[1]),
    Object.keys(sizes),
  )
  assert.equal(ts.includes('收到啦'), true)
  assert.equal(ts.includes('爱你'), true)
  assert.equal(ts.includes("RESPOND_TITLE = '回一颗心'"), true)
  assert.equal(ts.includes("RESPOND_AGAIN_TITLE = '换一颗心'"), true)
  assert.equal(ts.includes('点一个贴纸，就是给 Ta 的回声。'), true)
  for (const [id, size] of Object.entries(sizes)) {
    const data = readFileSync(join(root, 'src/images/stickers', `${id}.png`))
    assert.equal(data.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
    assert.equal(data.readUInt32BE(16), 256)
    assert.equal(data.readUInt32BE(20), 256)
    assert.equal(data[25], 6)
    assert.equal(data.length, size, id)
  }
})
