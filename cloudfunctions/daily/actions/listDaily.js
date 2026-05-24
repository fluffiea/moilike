/**
 * action: listDaily - 日常列表（分页）
 * @param {{ event: Record<string, unknown>, db: any, _: any, dailyCol: any, usersCol: any, helpers: any }} ctx
 */
async function listDaily(ctx) {
  const { event, db, _, dailyCol, usersCol, helpers } = ctx
  const { getMutualPartnerOpenId, coupleAuthorOpenIds, getUserRowsByOpenIds } = require('../common/utils')
  const { toPublicDaily, viewerDailyAuthorFromUser, attachDailyListCommentSummaries, PAGE_SIZE } = helpers

  const offset = Math.max(0, parseInt(String(event.offset || 0), 10) || 0)
  const partner = await getMutualPartnerOpenId(usersCol, ctx.OPENID)
  const authors = coupleAuthorOpenIds(ctx.OPENID, partner)
  const res = await dailyCol
    .where({ authorOpenId: _.in(authors) })
    .orderBy('createdAt', 'desc')
    .skip(offset)
    .limit(PAGE_SIZE)
    .get()
  const rawList = res.data || []
  const filtered = rawList.filter((doc) => {
    const aid = typeof doc.authorOpenId === 'string' ? doc.authorOpenId : ''
    return authors.includes(aid)
  })
  const authorIds = filtered.map((doc) =>
    typeof doc.authorOpenId === 'string' ? doc.authorOpenId : '',
  )
  const userMap = await getUserRowsByOpenIds(usersCol, authorIds)
  const list = filtered.map((doc) => {
    const aid = typeof doc.authorOpenId === 'string' ? doc.authorOpenId.trim() : ''
    const row = aid ? userMap.get(aid) : null
    const fields = viewerDailyAuthorFromUser(row || null, doc)
    return toPublicDaily({ ...doc, ...fields }, ctx.OPENID)
  })
  const listWithComments = await attachDailyListCommentSummaries(db, _, usersCol, list)
  const rawLen = rawList.length
  const hasMore = rawLen === PAGE_SIZE
  const nextOffset = offset + rawLen

  return { ok: true, list: listWithComments, hasMore, nextOffset }
}

module.exports = listDaily
