/**
 * 按时间字段倒序的游标分页。
 *
 * 游标 = 上一页最后一条的时间 + 该时刻已返回的文档 id。报备的记录时间精确到分钟，
 * 同一时刻可能有多条，只用时间做游标会在翻页边界漏数据，所以带上同刻 id 去重。
 */

const { toMs } = require('./util')

/** @param {unknown} raw @returns {{ t: number, ids: string[] } | null} */
function decode(raw) {
  if (typeof raw !== 'string' || !raw) return null
  const [t, ids] = raw.split('|')
  const ms = Number(t)
  if (!Number.isFinite(ms) || ms <= 0) return null
  return { t: ms, ids: ids ? ids.split(',').filter(Boolean) : [] }
}

/**
 * @param {{
 *   col: any, _: any, where: Record<string, unknown> | null, or?: Record<string, unknown>[],
 *   field: string, cursor: unknown, size: number, from?: number, to?: number,
 * }} q from/to 为闭区间毫秒，可选
 * @returns {Promise<{ docs: Record<string, any>[], nextCursor: string }>}
 */
async function pageByTime(q) {
  const { col, _, field, size } = q
  const c = decode(q.cursor)
  let upper = q.to
  if (c) upper = upper != null ? Math.min(upper, c.t) : c.t
  let range = null
  if (q.from != null && upper != null) range = _.gte(new Date(q.from)).and(_.lte(new Date(upper)))
  else if (q.from != null) range = _.gte(new Date(q.from))
  else if (upper != null) range = _.lte(new Date(upper))

  const parts = []
  if (q.where) parts.push(q.where)
  if (q.or) parts.push(_.or(q.or))
  if (range) parts.push({ [field]: range })
  const cond = parts.length === 1 ? parts[0] : _.and(parts)

  const skipIds = c ? c.ids : []
  const res = await col
    .where(cond)
    .orderBy(field, 'desc')
    .limit(size + 1 + skipIds.length)
    .get()
  const fresh = (res.data || []).filter((d) => !(c && toMs(d[field]) === c.t && skipIds.includes(d._id)))
  const docs = fresh.slice(0, size)
  if (fresh.length <= size || docs.length === 0) return { docs, nextCursor: '' }

  const lastT = toMs(docs[docs.length - 1][field])
  const sameT = docs.filter((d) => toMs(d[field]) === lastT).map((d) => d._id)
  const carried = c && c.t === lastT ? skipIds : []
  return { docs, nextCursor: `${lastT}|${[...carried, ...sameT].join(',')}` }
}

module.exports = { pageByTime, decode }
