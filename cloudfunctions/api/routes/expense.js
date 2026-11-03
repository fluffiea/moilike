const { fail, id, toMs, getDoc } = require('../lib/util')
const { pageByTime } = require('../lib/paging')
const { categoryById, resolveCategory, CATEGORIES } = require('../lib/categories')
const { monthKeyFromMs, monthStartMs, nextMonthStartMs, addMonths, currentMonthKey } = require('../lib/calendar')
const { ledgerVisibilityOf } = require('../lib/profile')

const PAGE_SIZE = 20
const MAX_NOTE = 50
const MAX_FEN = 99999999
const MIN_MS = monthStartMs('2000-01')

function readAmount(v) {
  if (typeof v !== 'number' || !Number.isInteger(v)) fail('INVALID', '金额不正确')
  if (v <= 0) fail('INVALID', '金额需大于 0')
  if (v > MAX_FEN) fail('INVALID', '金额过大')
  return v
}

function readNote(v) {
  if (v == null || v === '') return ''
  if (typeof v !== 'string') fail('INVALID', '备注格式不正确')
  const note = v.trim()
  if (note.length > MAX_NOTE) fail('INVALID', '备注最多 50 字')
  return note
}

function readTime(v) {
  const ms = Number(v)
  if (!Number.isFinite(ms) || ms <= 0) fail('INVALID', '请选择时间')
  const aligned = Math.floor(ms / 60000) * 60000
  if (aligned < MIN_MS) fail('INVALID', '时间太早了')
  if (aligned > Date.now() + 60000) fail('INVALID', '不能记录未来的时间')
  return aligned
}

function readMonth(v) {
  const key = typeof v === 'string' ? v : ''
  const start = monthStartMs(key)
  if (start == null) fail('INVALID', '请选择月份')
  return key
}

function readInput(e) {
  const pair = resolveCategory(id(e.l1), id(e.l2))
  if (!pair) fail('INVALID', '请选择分类')
  return {
    amountFen: readAmount(e.amountFen),
    l1: pair.l1.id,
    l2: pair.l2.id,
    note: readNote(e.note),
    occurredAt: new Date(readTime(e.occurredAtMs)),
  }
}

function toView(doc, openid) {
  const pair = resolveCategory(doc.l1, doc.l2)
  return {
    id: doc._id,
    amountFen: doc.amountFen,
    l1: doc.l1,
    l2: doc.l2,
    l1Name: pair ? pair.l1.name : doc.l1,
    l2Name: pair ? pair.l2.name : doc.l2,
    note: doc.note || '',
    occurredAtMs: toMs(doc.occurredAt),
    createdAtMs: toMs(doc.createdAt),
    updatedAtMs: toMs(doc.updatedAt),
    mine: doc.authorOpenId === openid,
  }
}

/** 只拿本人的一笔；别人的 id 与不存在都当作找不到，避免探出别人的账 */
async function own(ctx, rawId) {
  await ctx.viewer()
  const doc = await getDoc(ctx.col.expenses, id(rawId))
  if (!doc || doc.authorOpenId !== ctx.openid) fail('NOT_FOUND', '这笔支出不存在或已删除')
  return doc
}

function authorsWhere(_, openids, l1) {
  const where = openids.length === 1 ? { authorOpenId: openids[0] } : { authorOpenId: _.in(openids) }
  if (l1) where.l1 = l1
  return where
}

function readView(v) {
  if (v == null || v === '' || v === 'mine') return 'mine'
  if (v === 'partner' || v === 'us') return v
  fail('INVALID', '无效的视图')
}

/**
 * 读谁的账由云端决定，不信客户端传来的金额或明细。
 * openids：可以计入合计的人；listOpenids：可以返回流水的人。
 * 对方设为不可见时两者都空（「我们」则只剩自己）；仅汇总时合计含对方、流水不含对方。
 */
async function resolveLens(ctx, rawView) {
  const view = readView(rawView)
  if (view === 'mine') {
    await ctx.viewer()
    return { view, openids: [ctx.openid], listOpenids: [ctx.openid], scope: 'detail', includesPartner: false }
  }
  const { partnerId } = await ctx.requirePartner()
  const partner = await ctx.partner()
  const scope = partner ? ledgerVisibilityOf(partner).scope : 'none'
  if (view === 'partner') {
    return {
      view,
      openids: scope === 'none' ? [] : [partnerId],
      listOpenids: scope === 'detail' ? [partnerId] : [],
      scope,
      includesPartner: scope !== 'none',
    }
  }
  const includesPartner = scope !== 'none'
  return {
    view,
    openids: includesPartner ? [ctx.openid, partnerId] : [ctx.openid],
    listOpenids: scope === 'detail' ? [ctx.openid, partnerId] : [ctx.openid],
    scope,
    includesPartner,
  }
}

function accessOf(lens) {
  return { view: lens.view, scope: lens.scope, includesPartner: lens.includesPartner }
}

/** 闭区间 [from, to] 内的全部支出，按发生时间倒序捞完 */
async function collect(ctx, where, from, to) {
  const out = []
  let cursor = ''
  for (let i = 0; i < 100; i++) {
    const page = await pageByTime({
      col: ctx.col.expenses,
      _: ctx._,
      where,
      field: 'occurredAt',
      cursor,
      size: 100,
      from,
      to,
    })
    out.push(...page.docs)
    if (!page.nextCursor) return out
    cursor = page.nextCursor
  }
  return out
}

function sumFen(docs) {
  let n = 0
  for (const doc of docs) {
    if (Number.isInteger(doc.amountFen) && doc.amountFen > 0) n += doc.amountFen
  }
  return n
}

function momText(current, prev) {
  if (prev <= 0) return '—'
  const p = Math.round(((current - prev) / prev) * 100)
  return p > 0 ? `+${p}%` : `${p}%`
}

/** 已结束自然月里，有支出的月份的算术平均；没有这样的月份则为 null */
function averageFen(docs) {
  const byMonth = new Map()
  for (const doc of docs) {
    if (!Number.isInteger(doc.amountFen) || doc.amountFen <= 0) continue
    const key = monthKeyFromMs(toMs(doc.occurredAt))
    byMonth.set(key, (byMonth.get(key) || 0) + doc.amountFen)
  }
  if (byMonth.size === 0) return null
  let sum = 0
  for (const v of byMonth.values()) sum += v
  return Math.round(sum / byMonth.size)
}

function rankL1(docs) {
  const sums = new Map()
  for (const doc of docs) {
    if (!Number.isInteger(doc.amountFen) || doc.amountFen <= 0) continue
    sums.set(doc.l1, (sums.get(doc.l1) || 0) + doc.amountFen)
  }
  const rows = CATEGORIES.map((c, index) => ({ l1: c.id, name: c.name, amountFen: sums.get(c.id) || 0, index }))
  const known = new Set(CATEGORIES.map((c) => c.id))
  let extra = CATEGORIES.length
  for (const [l1, amountFen] of sums) {
    if (!known.has(l1)) rows.push({ l1, name: l1, amountFen, index: extra++ })
  }
  return rows
    .filter((row) => row.amountFen > 0)
    .sort((a, b) => b.amountFen - a.amountFen || a.index - b.index)
    .map(({ l1, name, amountFen }) => ({ l1, name, amountFen }))
}

function breakdownOf(l1, docs) {
  const cat = categoryById(l1)
  if (!cat) return null
  const mine = docs.filter((doc) => doc.l1 === l1)
  const sums = new Map()
  for (const doc of mine) {
    if (!Number.isInteger(doc.amountFen) || doc.amountFen <= 0) continue
    sums.set(doc.l2, (sums.get(doc.l2) || 0) + doc.amountFen)
  }
  const known = new Set(cat.children.map((c) => c.id))
  const items = cat.children
    .map((c) => ({ l2: c.id, name: c.name, amountFen: sums.get(c.id) || 0 }))
    .filter((row) => row.amountFen > 0)
  for (const [l2, amountFen] of sums) {
    if (!known.has(l2)) items.push({ l2, name: l2, amountFen })
  }
  items.sort((a, b) => b.amountFen - a.amountFen)
  return { l1: cat.id, name: cat.name, totalFen: sumFen(mine), items }
}

function monthBounds(month) {
  const start = monthStartMs(month)
  const end = nextMonthStartMs(month)
  if (start == null || end == null) fail('INVALID', '请选择月份')
  return { start, end }
}

async function list(ctx, e) {
  const lens = await resolveLens(ctx, e.view)
  const month = readMonth(e.month)
  const { start, end } = monthBounds(month)
  let l1 = ''
  if (e.l1) {
    l1 = id(e.l1)
    if (!categoryById(l1)) fail('INVALID', '请选择分类')
  }
  const access = accessOf(lens)
  if (lens.listOpenids.length === 0) return { items: [], nextCursor: '', ...access }
  const { docs, nextCursor } = await pageByTime({
    col: ctx.col.expenses,
    _: ctx._,
    where: authorsWhere(ctx._, lens.listOpenids, l1),
    field: 'occurredAt',
    cursor: e.cursor,
    size: PAGE_SIZE,
    from: start,
    to: end - 1,
  })
  return { items: docs.map((doc) => toView(doc, ctx.openid)), nextCursor, ...access }
}

async function get(ctx, e) {
  const { partnerId } = await ctx.viewer()
  const doc = await getDoc(ctx.col.expenses, id(e.id))
  if (!doc) fail('NOT_FOUND', '这笔支出不存在或已删除')
  if (doc.authorOpenId === ctx.openid) return { expense: toView(doc, ctx.openid) }
  if (!partnerId || doc.authorOpenId !== partnerId) fail('NOT_FOUND', '这笔支出不存在或已删除')
  const partner = await ctx.partner()
  if (!partner || ledgerVisibilityOf(partner).scope !== 'detail') fail('NOT_FOUND', '这笔支出不存在或已删除')
  return { expense: toView(doc, ctx.openid) }
}

async function create(ctx, e) {
  await ctx.viewer()
  const input = readInput(e)
  const now = new Date()
  const data = { authorOpenId: ctx.openid, ...input, createdAt: now, updatedAt: now }
  const res = await ctx.col.expenses.add({ data })
  return { expense: toView({ ...data, _id: res._id }, ctx.openid) }
}

async function update(ctx, e) {
  const doc = await own(ctx, e.id)
  const input = readInput(e)
  const updatedAt = new Date()
  await ctx.col.expenses.doc(doc._id).update({ data: { ...input, updatedAt: ctx.db.serverDate() } })
  return { expense: toView({ ...doc, ...input, updatedAt }, ctx.openid) }
}

async function remove(ctx, e) {
  const doc = await own(ctx, e.id)
  await ctx.col.expenses.doc(doc._id).remove()
  return null
}

async function monthSummary(ctx, e) {
  const lens = await resolveLens(ctx, e.view)
  const month = readMonth(e.month)
  const { start, end } = monthBounds(month)
  const brief = e.scope === 'total'
  let l1 = ''
  if (!brief && e.l1) {
    l1 = id(e.l1)
    if (!categoryById(l1)) fail('INVALID', '请选择分类')
  }

  const nowKey = currentMonthKey()
  const access = accessOf(lens)
  const base = {
    month,
    totalFen: 0,
    count: 0,
    open: month === nowKey,
    mom: '—',
    avgFen: null,
    top: [],
    categories: [],
    breakdown: null,
    ...access,
  }
  if (lens.openids.length === 0) return base

  const where = authorsWhere(ctx._, lens.openids, '')
  const monthDocs = await collect(ctx, where, start, end - 1)
  const totalFen = sumFen(monthDocs)
  const visibleDocs = lens.listOpenids.length === lens.openids.length
    ? monthDocs
    : monthDocs.filter((doc) => lens.listOpenids.includes(doc.authorOpenId))
  const filled = { ...base, totalFen, count: visibleDocs.length }
  if (brief) return filled

  const prevStart = monthStartMs(addMonths(month, -1))
  const prevDocs = prevStart == null ? [] : await collect(ctx, where, prevStart, start - 1)
  const currentStart = monthStartMs(nowKey)
  const history = await collect(ctx, where, undefined, currentStart - 1)
  const ranked = rankL1(monthDocs)
  let breakdown = null
  if (l1 && lens.listOpenids.length > 0) breakdown = breakdownOf(l1, visibleDocs)
  return {
    ...filled,
    mom: momText(totalFen, sumFen(prevDocs)),
    avgFen: averageFen(history),
    top: ranked.slice(0, 3),
    categories: ranked,
    breakdown,
  }
}

module.exports = { list, get, create, update, remove, monthSummary }
