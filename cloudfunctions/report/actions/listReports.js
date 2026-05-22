/**
 * action: listReports - 报备列表
 * @param {{ event: Record<string, unknown>, _: any, reportCol: any, usersCol: any, helpers: any }} ctx
 */
async function listReports(ctx) {
  const { event, _, reportCol, usersCol, helpers } = ctx
  const { getMutualPartnerOpenId, coupleAuthorOpenIds } = require('../common/utils')
  const { toPublicReport, PAGE_SIZE } = helpers

  const offset = Math.max(0, parseInt(String(event.offset || 0), 10) || 0)
  const filter = typeof event.filter === 'string' ? event.filter : 'all'
  const partner = await getMutualPartnerOpenId(usersCol, ctx.OPENID)
  const authors = coupleAuthorOpenIds(ctx.OPENID, partner)

  let q = reportCol.where({ authorOpenId: _.in(authors) })
  if (filter === 'action_needed') {
    if (!partner) {
      return { ok: true, list: [], hasMore: false, nextOffset: offset }
    }
    q = reportCol.where({ authorOpenId: partner, partnerEvaluatedAt: _.eq(null) })
  } else if (filter === 'mine') {
    q = reportCol.where({ authorOpenId: ctx.OPENID })
  }

  const res = await q.orderBy('recordAt', 'desc').skip(offset).limit(PAGE_SIZE).get()
  const rawList = res.data || []
  const filtered = rawList.filter((doc) => {
    const aid = typeof doc.authorOpenId === 'string' ? doc.authorOpenId : ''
    if (filter === 'action_needed') return aid === partner
    if (filter === 'mine') return aid === ctx.OPENID
    return authors.includes(aid)
  })
  const list = filtered.map((doc) => toPublicReport(doc, doc._id, ctx.OPENID, partner))
  const rawLen = rawList.length
  return { ok: true, list, hasMore: rawLen === PAGE_SIZE, nextOffset: offset + rawLen }
}

module.exports = listReports
