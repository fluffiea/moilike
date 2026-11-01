const { fail, id, toMs, getDoc } = require('../lib/util')
const { pageByTime } = require('../lib/paging')
const { categoryById, resolveCategory, CATEGORIES } = require('../lib/categories')
const { monthKeyFromMs, monthStartMs, addMonths, currentMonthKey } = require('../lib/calendar')

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

function toView(doc) {
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
  }
}

/** 只拿本人的一笔；别人的 id 与不存在都当作找不到，避免探出别人的账 */
async function own(ctx, rawId) {
  await ctx.viewer()
  const doc = await getDoc(ctx.col.expenses, id(rawId))
  if (!doc || doc.authorOpenId !== ctx.openid) fail('NOT_FOUND', '这笔支出不存在或已删除')
  return doc
}

function authorWhere(openid, l1) {
  const where = { authorOpenId: openid }
  if (l1) where.l1 = l1
  return where
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
  return CATEGORIES.map((c, index) => ({ l1: c.id, name: c.name, amountFen: sums.get(c.id) || 0, index }))
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

async function list(ctx, e) {
  await ctx.viewer()
  const month = readMonth(e.month)
  const start = monthStartMs(month)
  const end = monthStartMs(addMonths(month, 1))
  let l1 = ''
  if (e.l1) {
    l1 = id(e.l1)
    if (!categoryById(l1)) fail('INVALID', '请选择分类')
  }
  const { docs, nextCursor } = await pageByTime({
    col: ctx.col.expenses,
    _: ctx._,
    where: authorWhere(ctx.openid, l1),
    field: 'occurredAt',
    cursor: e.cursor,
    size: PAGE_SIZE,
    from: start,
    to: end - 1,
  })
  return { items: docs.map(toView), nextCursor }
}

async function get(ctx, e) {
  return { expense: toView(await own(ctx, e.id)) }
}

async function create(ctx, e) {
  await ctx.viewer()
  const input = readInput(e)
  const now = new Date()
  const data = { authorOpenId: ctx.openid, ...input, createdAt: now, updatedAt: now }
  const res = await ctx.col.expenses.add({ data })
  return { expense: toView({ ...data, _id: res._id }) }
}

async function update(ctx, e) {
  const doc = await own(ctx, e.id)
  const input = readInput(e)
  const updatedAt = new Date()
  await ctx.col.expenses.doc(doc._id).update({ data: { ...input, updatedAt: ctx.db.serverDate() } })
  return { expense: toView({ ...doc, ...input, updatedAt }) }
}

async function remove(ctx, e) {
  const doc = await own(ctx, e.id)
  await ctx.col.expenses.doc(doc._id).remove()
  return null
}

async function monthSummary(ctx, e) {
  await ctx.viewer()
  const month = readMonth(e.month)
  const start = monthStartMs(month)
  const end = monthStartMs(addMonths(month, 1))
  const brief = e.scope === 'total'
  let l1 = ''
  if (!brief && e.l1) {
    l1 = id(e.l1)
    if (!categoryById(l1)) fail('INVALID', '请选择分类')
  }

  const monthDocs = await collect(ctx, authorWhere(ctx.openid, ''), start, end - 1)
  const totalFen = sumFen(monthDocs)
  const nowKey = currentMonthKey()
  const base = {
    month,
    totalFen,
    count: monthDocs.length,
    open: month === nowKey,
    mom: '—',
    avgFen: null,
    top: [],
    categories: [],
    breakdown: null,
  }
  if (brief) return base

  const prevStart = monthStartMs(addMonths(month, -1))
  const prevDocs = prevStart == null ? [] : await collect(ctx, authorWhere(ctx.openid, ''), prevStart, start - 1)
  const currentStart = monthStartMs(nowKey)
  const history = await collect(ctx, authorWhere(ctx.openid, ''), undefined, currentStart - 1)
  const ranked = rankL1(monthDocs)
  return {
    ...base,
    mom: momText(totalFen, sumFen(prevDocs)),
    avgFen: averageFen(history),
    top: ranked.slice(0, 3),
    categories: ranked,
    breakdown: l1 ? breakdownOf(l1, monthDocs) : null,
  }
}

module.exports = { list, get, create, update, remove, monthSummary }
