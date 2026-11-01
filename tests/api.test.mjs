import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import Module, { createRequire } from 'node:module'
import { createFakeCloud } from './helpers/fake-cloud.mjs'

// 本地没有安装 wx-server-sdk：入口只在模块顶层调用 init，测试里用替身 cloud 调 handle
const originalLoad = Module._load
Module._load = function (request, ...rest) {
  if (request === 'wx-server-sdk') return { init() {}, DYNAMIC_CURRENT_ENV: 'test' }
  return originalLoad.call(this, request, ...rest)
}
const require = createRequire(import.meta.url)
const { handle } = require('../cloudfunctions/api/index.js')
const { monthStartMs, addMonths, currentMonthKey, monthKeyFromMs } = require('../cloudfunctions/api/lib/calendar.js')

/** 落在该北京时间月内、且不晚于现在的一个时刻 */
function at(month) {
  const start = monthStartMs(month)
  const end = monthStartMs(addMonths(month, 1))
  const now = Date.now()
  if (now >= start && now < end) return Math.max(start, now - 1000)
  return start + 12 * 3600 * 1000
}

function spend(who, patch = {}) {
  return ok(who, 'expense.create', {
    amountFen: 100,
    l1: 'food',
    l2: 'takeout',
    note: '',
    occurredAtMs: at(currentMonthKey()),
    ...patch,
  })
}

let cloud
const call = async (who, route, data = {}) => handle({ route, ...data }, cloud.as(who))
const ok = async (who, route, data) => {
  const r = await call(who, route, data)
  assert.equal(r.ok, true, `${route} 失败：${r.code} ${r.message}`)
  return r.data
}
const failsWith = async (code, who, route, data) => {
  const r = await call(who, route, data)
  assert.equal(r.ok, false, `${route} 应失败`)
  assert.equal(r.code, code, r.message)
}

async function register(who, nickName) {
  return ok(who, 'user.saveProfile', { nickName, avatarFileId: `cloud://env/avatars/${who}.jpg` })
}

async function bindCouple() {
  await register('A', '阿杏')
  await register('B', '阿桃')
  const { bindCode } = await ok('A', 'user.partnerPanel')
  await ok('B', 'user.requestBind', { bindCode })
  const panel = await ok('A', 'user.partnerPanel')
  assert.equal(panel.inbound.length, 1)
  assert.equal(panel.inbound[0].name, '阿桃')
  await ok('A', 'user.respondBind', { requestId: panel.inbound[0].id, accept: true })
}

beforeEach(() => {
  cloud = createFakeCloud()
})

test('未注册：me 返回 null，业务接口要求先完善资料', async () => {
  assert.deepEqual(await ok('A', 'user.me'), { user: null })
  await failsWith('NOT_REGISTERED', 'A', 'daily.list')
  await failsWith('UNKNOWN_ROUTE', 'A', 'daily.nope')
  await failsWith('UNKNOWN_ROUTE', 'A', 'user.constructor')
})

test('注册、结伴、纪念日：双方资料一致，头像为签名后的缩略图', async () => {
  await bindCouple()
  const { user } = await ok('B', 'user.me')
  assert.equal(user.partner.nickName, '阿杏')
  assert.match(user.partner.avatarUrl, /^https:\/\/tmp\.example\/.+imageMogr2\/thumbnail\/200x200$/)
  assert.equal(user.togetherSinceMs, null)

  const since = new Date(2024, 4, 20, 13, 14, 30).getTime()
  const saved = await ok('A', 'user.setTogetherSince', { togetherSinceMs: since })
  assert.equal(saved.user.togetherSinceMs, Math.floor(since / 60000) * 60000)
  assert.equal((await ok('B', 'user.me')).user.togetherSinceMs, saved.user.togetherSinceMs)

  await failsWith('ALREADY_BOUND', 'B', 'user.requestBind', { bindCode: 'ABCDEFGH' })
})

test('结伴事务：一方已被绑定时整体回滚并作废申请', async () => {
  await register('A', '阿杏')
  await register('B', '阿桃')
  await register('C', '阿李')
  const { bindCode } = await ok('A', 'user.partnerPanel')
  await ok('B', 'user.requestBind', { bindCode })
  // B 在 A 处理前已和 C 结伴（模拟并发）
  cloud.row('users', 'B').partnerOpenId = 'C'
  const panel = await ok('A', 'user.partnerPanel')
  await failsWith('ALREADY_BOUND', 'A', 'user.respondBind', { requestId: panel.inbound[0].id, accept: true })
  assert.equal(cloud.row('users', 'A').partnerOpenId, null)
  assert.equal(cloud.row('bind_requests', panel.inbound[0].id).status, 'voided')
})

test('日常：发布、对方可见、评论摘要随增删改同步', async () => {
  await bindCouple()
  const { post } = await ok('A', 'daily.create', { text: '今天的晚霞', images: ['cloud://env/daily/A/1.jpg', 'https://evil'] })
  assert.equal(post.images.length, 1)
  assert.equal(post.isMine, true)

  cloud.stats.signCalls = 0
  const { items } = await ok('B', 'daily.list')
  assert.equal(cloud.stats.signCalls, 1, '列表的头像与配图应在一次签名里完成')
  assert.equal(items[0].author.name, '阿杏')
  assert.equal(items[0].isMine, false)
  assert.match(items[0].images[0].thumb, /imageMogr2\/thumbnail\/600x600$/)

  const c1 = await ok('B', 'daily.addComment', { postId: post.id, text: '好看' })
  assert.deepEqual(c1.summary, { commentCount: 1, firstComment: { name: '阿桃', text: '好看' } })
  const reply = await ok('A', 'daily.addComment', { postId: post.id, text: '下次一起看', parentId: c1.comment.id })
  assert.equal(reply.comment.depth, 1)
  await failsWith('INVALID', 'B', 'daily.addComment', { postId: post.id, text: '套娃', parentId: reply.comment.id })
  await failsWith('HAS_REPLIES', 'B', 'daily.updateComment', { postId: post.id, commentId: c1.comment.id, text: '改' })

  await ok('A', 'daily.removeComment', { postId: post.id, commentId: reply.comment.id })
  const edited = await ok('B', 'daily.updateComment', { postId: post.id, commentId: c1.comment.id, text: '真好看' })
  assert.equal(edited.summary.firstComment.text, '真好看')
  const removed = await ok('B', 'daily.removeComment', { postId: post.id, commentId: c1.comment.id })
  assert.deepEqual(removed.summary, { commentCount: 0, firstComment: null })

  const detail = await ok('B', 'daily.get', { id: post.id })
  assert.equal(detail.post.commentCount, 0)
  assert.deepEqual(detail.comments, [])

  await failsWith('FORBIDDEN', 'B', 'daily.remove', { id: post.id })
  await ok('B', 'daily.addComment', { postId: post.id, text: '留个言' })
  await ok('A', 'daily.remove', { id: post.id })
  assert.equal(cloud.tables.get('daily_comments').size, 0, '删除日常时一并删除评论')
})

test('日常：非结伴用户不可见；按日期筛选走服务端', async () => {
  await bindCouple()
  await register('C', '路人')
  const { post } = await ok('A', 'daily.create', { text: 'hi' })
  await failsWith('FORBIDDEN', 'C', 'daily.get', { id: post.id })
  assert.equal((await ok('C', 'daily.list')).items.length, 0)

  const old = new Date(2023, 0, 5, 10, 0)
  cloud.seed('daily_posts', { _id: 'old', authorOpenId: 'B', snippet: '很久以前', images: [], createdAt: old })
  const dayStart = new Date(2023, 0, 5).getTime()
  const { items } = await ok('A', 'daily.list', { dayStartMs: dayStart })
  assert.deepEqual(items.map((i) => i.id), ['old'])
})

test('日常：早期帖子缺评论摘要时读取即补算并写回', async () => {
  await bindCouple()
  const t = new Date()
  cloud.seed('daily_posts', { _id: 'legacy', authorOpenId: 'A', snippet: '旧帖', images: [], createdAt: t })
  cloud.seed('daily_comments', { _id: 'c', dailyPostId: 'legacy', authorOpenId: 'B', text: '旧评论', parentId: '', depth: 0, createdAt: t })
  const { items } = await ok('A', 'daily.list')
  assert.equal(items[0].commentCount, 1)
  assert.equal(items[0].firstComment.name, '阿桃')
  assert.equal(cloud.row('daily_posts', 'legacy').commentCount, 1)
})

test('游标分页：同一时刻多条也不重复不遗漏', async () => {
  await bindCouple()
  const same = new Date(2025, 1, 14, 20, 0)
  for (let i = 0; i < 23; i++) {
    cloud.seed('report_posts', { _id: `r${i}`, authorOpenId: i % 2 ? 'A' : 'B', body: `#${i}`, tags: [], images: [], recordAt: same, createdAt: same, partnerReadAt: null, partnerEvaluatedAt: null })
  }
  const seen = []
  let cursor = ''
  do {
    const page = await ok('A', 'report.list', { filter: 'all', cursor })
    seen.push(...page.items.map((i) => i.id))
    cursor = page.nextCursor
  } while (cursor)
  assert.equal(seen.length, 23)
  assert.equal(new Set(seen).size, 23)
})

test('报备：对方已阅、评价、改评价；状态与权限校验', async () => {
  await bindCouple()
  const { post } = await ok('A', 'report.create', { body: '吃了火锅', tags: ['干饭', '干饭', '聚餐'], recordAtMs: Date.now() })
  assert.deepEqual(post.tags, ['干饭', '聚餐'])
  assert.equal(post.state, 'pending_read')

  const todo = await ok('B', 'report.list', { filter: 'action_needed' })
  assert.equal(todo.items[0].canMarkRead, true)
  await failsWith('FORBIDDEN', 'A', 'report.markRead', { id: post.id })
  await failsWith('STATE', 'B', 'report.evaluate', { id: post.id, text: '先评价' })

  const read = await ok('B', 'report.markRead', { id: post.id })
  assert.equal(read.post.state, 'read')
  assert.equal(read.post.canEvaluate, true)
  const evaluated = await ok('B', 'report.evaluate', { id: post.id, text: '下次带我' })
  assert.equal(evaluated.post.state, 'evaluated')
  assert.equal((await ok('B', 'report.evaluate', { id: post.id, text: '改一下' })).post.evalText, '改一下')
  assert.equal((await ok('B', 'report.list', { filter: 'action_needed' })).items.length, 0)
  assert.equal((await ok('A', 'report.list', { filter: 'mine' })).items[0].evalText, '改一下')
})

test('报备标签：默认标签恒在首位且不可删', async () => {
  await register('A', '阿杏')
  assert.deepEqual((await ok('A', 'report.tags')).tags, ['干饭'])
  assert.deepEqual((await ok('A', 'report.addTag', { tag: '奶茶' })).tags, ['干饭', '奶茶'])
  assert.deepEqual((await ok('A', 'report.addTag', { tag: '奶茶' })).tags, ['干饭', '奶茶'])
  await failsWith('INVALID', 'A', 'report.removeTag', { tag: '干饭' })
  assert.deepEqual((await ok('A', 'report.removeTag', { tag: '奶茶' })).tags, ['干饭'])
})

test('信件：收件人由服务端决定；列表只带摘要与缩略图；仅寄信人可删', async () => {
  await bindCouple()
  const { letter } = await ok('A', 'letters.create', {
    title: '给你',
    content: '很长的信'.repeat(50),
    type: 'whisper',
    images: ['cloud://env/letters/A/1.jpg'],
    receiverId: 'someone-else',
  })
  assert.equal(cloud.row('letters', letter.id).receiverId, 'B')

  const { items } = await ok('B', 'letters.list')
  assert.equal(items[0].isMine, false)
  assert.ok(items[0].preview.length <= 120)
  assert.equal(items[0].thumbs.length, 1)
  assert.equal((await ok('B', 'letters.get', { id: letter.id })).letter.fromName, '阿杏')

  const home = await ok('B', 'home.summary')
  assert.equal(home.letters.total, 1)
  assert.deepEqual(home.letters.recent, [{ id: letter.id, title: '给你' }])

  await failsWith('FORBIDDEN', 'B', 'letters.remove', { id: letter.id })
  await ok('A', 'letters.remove', { id: letter.id })
  await register('C', '路人')
  await failsWith('NO_PARTNER', 'C', 'letters.create', { content: 'hi' })
})

test('记账分类表前后端一致，月份按北京时间切分', () => {
  const pair = (src) => [...src.matchAll(/id:\s*'([^']+)',\s*name:\s*'([^']+)'/g)].map((m) => `${m[1]}:${m[2]}`)
  const js = readFileSync(new URL('../cloudfunctions/api/lib/categories.js', import.meta.url), 'utf8')
  const ts = readFileSync(new URL('../src/core/expense-categories.ts', import.meta.url), 'utf8')
  const pairs = pair(js)
  assert.deepEqual(pairs, pair(ts))
  assert.equal(pairs.length, 34)
  assert.equal(pairs[0], 'food:餐饮')
  assert.ok(pairs.includes('takeout:外卖'))
  assert.ok(pairs.includes('living:居住'))

  const nov1 = Date.UTC(2026, 10, 1) - 8 * 3600 * 1000
  assert.equal(monthKeyFromMs(nov1), '2026-11')
  assert.equal(monthKeyFromMs(nov1 - 1), '2026-10')
  assert.equal(monthStartMs('2026-11'), nov1)
  assert.equal(addMonths('2026-12', 1), '2027-01')
  assert.equal(monthStartMs('1999-12'), null)
})

test('记账：未结伴可写，只有本人可见，金额分类时间和备注都要合法', async () => {
  const cur = currentMonthKey()
  await failsWith('NOT_REGISTERED', 'A', 'expense.list', { month: cur })
  await register('A', '阿杏')

  const raw = at(cur) + 5000
  const { expense } = await spend('A', { amountFen: 8600, note: '  午餐  ', occurredAtMs: raw })
  assert.equal(expense.l1Name, '餐饮')
  assert.equal(expense.l2Name, '外卖')
  assert.equal(expense.note, '午餐')
  assert.equal(expense.amountFen, 8600)
  assert.equal(expense.occurredAtMs, Math.floor(raw / 60000) * 60000)
  assert.equal(cloud.row('expenses', expense.id).authorOpenId, 'A')

  await register('B', '阿桃')
  assert.equal((await ok('B', 'expense.list', { month: cur })).items.length, 0)
  assert.equal((await ok('B', 'expense.monthSummary', { month: cur })).totalFen, 0)
  await failsWith('NOT_FOUND', 'B', 'expense.get', { id: expense.id })
  await failsWith('NOT_FOUND', 'B', 'expense.update', { id: expense.id, amountFen: 1, l1: 'food', l2: 'meal', occurredAtMs: at(cur) })
  await failsWith('NOT_FOUND', 'B', 'expense.remove', { id: expense.id })

  const bad = { amountFen: 100, l1: 'food', l2: 'takeout', occurredAtMs: at(cur) }
  await failsWith('INVALID', 'A', 'expense.create', { ...bad, amountFen: 0 })
  await failsWith('INVALID', 'A', 'expense.create', { ...bad, amountFen: 1.5 })
  await failsWith('INVALID', 'A', 'expense.create', { ...bad, amountFen: 100000000 })
  await failsWith('INVALID', 'A', 'expense.create', { ...bad, l2: 'metro' })
  await failsWith('INVALID', 'A', 'expense.create', { ...bad, occurredAtMs: Date.now() + 10 * 60 * 1000 })
  await failsWith('INVALID', 'A', 'expense.create', { ...bad, note: '字'.repeat(51) })
  await failsWith('INVALID', 'A', 'expense.list', { month: '2026-13' })
  assert.equal((await spend('A', { note: '字'.repeat(50) })).expense.note.length, 50)
})

test('记账：按月倒序分页，改时间会离开原月份，删除后不可再读', async () => {
  await register('A', '阿杏')
  const cur = currentMonthKey()
  const prev = addMonths(cur, -1)
  const early = monthStartMs(prev) + 8 * 3600 * 1000
  const late = monthStartMs(prev) + 20 * 3600 * 1000
  const first = await spend('A', { amountFen: 100, occurredAtMs: early, note: '早' })
  const second = await spend('A', { amountFen: 250, l1: 'transit', l2: 'metro', occurredAtMs: late, note: '晚' })
  await spend('A', { amountFen: 999, occurredAtMs: at(cur), note: '这个月' })

  const page = await ok('A', 'expense.list', { month: prev })
  assert.deepEqual(page.items.map((item) => item.id), [second.expense.id, first.expense.id])
  assert.equal((await ok('A', 'expense.list', { month: cur })).items.length, 1)

  const stamp = early
  for (let i = 0; i < 25; i++) await spend('A', { amountFen: 100 + i, l2: 'snack', occurredAtMs: stamp })
  const seen = []
  let cursor = ''
  do {
    const next = await ok('A', 'expense.list', { month: prev, l1: 'food', cursor })
    seen.push(...next.items.map((item) => item.id))
    cursor = next.nextCursor
  } while (cursor)
  assert.equal(seen.length, 26)
  assert.equal(new Set(seen).size, 26)
  assert.equal((await ok('A', 'expense.list', { month: prev, l1: 'transit' })).items.length, 1)

  const moved = await ok('A', 'expense.update', {
    id: second.expense.id,
    amountFen: 888,
    l1: 'health',
    l2: 'drug',
    note: '  感冒药  ',
    occurredAtMs: at(cur),
  })
  assert.equal(moved.expense.amountFen, 888)
  assert.equal(moved.expense.l1Name, '医疗')
  assert.equal(moved.expense.note, '感冒药')
  const curIds = (await ok('A', 'expense.list', { month: cur })).items.map((item) => item.id)
  assert.ok(curIds.includes(second.expense.id))
  assert.equal((await ok('A', 'expense.list', { month: prev, l1: 'transit' })).items.length, 0)

  await ok('A', 'expense.remove', { id: first.expense.id })
  await failsWith('NOT_FOUND', 'A', 'expense.get', { id: first.expense.id })
})

test('记账月报：TOP3、环比、不含本月的月均、未结束标记', async () => {
  await register('A', '阿杏')
  const cur = currentMonthKey()
  const prev = addMonths(cur, -1)
  const older = addMonths(cur, -2)
  await spend('A', { amountFen: 10000, occurredAtMs: at(older) })
  await spend('A', { amountFen: 30000, l1: 'transit', l2: 'metro', occurredAtMs: at(prev) })
  await spend('A', { amountFen: 20000, l2: 'takeout', occurredAtMs: at(cur) })
  await spend('A', { amountFen: 15000, l2: 'meal', occurredAtMs: at(cur) })
  await spend('A', { amountFen: 10000, l1: 'shopping', l2: 'market', occurredAtMs: at(cur) })
  await spend('A', { amountFen: 5000, l1: 'living', l2: 'rent', occurredAtMs: at(cur) })

  const summary = await ok('A', 'expense.monthSummary', { month: cur, l1: 'food' })
  assert.equal(summary.totalFen, 50000)
  assert.equal(summary.count, 4)
  assert.equal(summary.open, true)
  assert.equal(summary.mom, '+67%')
  assert.equal(summary.avgFen, 20000)
  assert.deepEqual(summary.top.map((row) => row.l1), ['food', 'shopping', 'living'])
  assert.equal(summary.categories.length, 3)
  assert.equal(summary.breakdown.totalFen, 35000)
  assert.deepEqual(
    summary.breakdown.items.map((row) => [row.l2, row.amountFen]),
    [
      ['takeout', 20000],
      ['meal', 15000],
    ],
  )

  const past = await ok('A', 'expense.monthSummary', { month: prev })
  assert.equal(past.totalFen, 30000)
  assert.equal(past.open, false)
  assert.equal(past.mom, '+200%')
  assert.equal(past.avgFen, 20000)
  assert.equal(past.breakdown, null)

  const first = await ok('A', 'expense.monthSummary', { month: older })
  assert.equal(first.mom, '—')

  const brief = await ok('A', 'expense.monthSummary', { month: cur, scope: 'total' })
  assert.equal(brief.totalFen, 50000)
  assert.equal(brief.avgFen, null)
  assert.deepEqual(brief.top, [])
  assert.equal(brief.breakdown, null)

  await register('C', '路人')
  const empty = await ok('C', 'expense.monthSummary', { month: cur })
  assert.equal(empty.totalFen, 0)
  assert.equal(empty.mom, '—')
  assert.equal(empty.avgFen, null)
  assert.equal(empty.open, true)
})

test('请求成本：列表只读本人 + 伴侣 + 业务查询各一次', async () => {
  await bindCouple()
  for (let i = 0; i < 3; i++) await ok('A', 'daily.create', { text: `#${i}`, images: [`cloud://env/daily/A/${i}.jpg`] })
  cloud.stats.reads = 0
  cloud.stats.signCalls = 0
  await ok('B', 'daily.list')
  assert.equal(cloud.stats.reads, 3)
  assert.equal(cloud.stats.signCalls, 1)
})
