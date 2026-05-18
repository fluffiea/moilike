/**
 * action: listDailyComments - 日常评论列表
 * @param {{ event: Record<string, unknown>, db: any, dailyCol: any, usersCol: any, helpers: any }} ctx
 */
async function listDailyComments(ctx) {
  const { event, db, dailyCol, usersCol, helpers } = ctx
  const { getUserRowsByOpenIds } = require('../common/utils')
  const { DAILY_COMMENTS, toPublicComment, getDailyPostDocForViewer } = helpers

  const postId = typeof event.postId === 'string' ? event.postId.trim() : ''
  if (!postId) return { ok: false, error: '缺少 postId' }
  const vr = await getDailyPostDocForViewer(dailyCol, usersCol, ctx.OPENID, postId)
  if (!vr.ok) return vr

  const commentsCol = db.collection(DAILY_COMMENTS)
  const res = await commentsCol
    .where({ dailyPostId: postId })
    .orderBy('createdAt', 'asc')
    .limit(200)
    .get()
  const rawList = res.data || []
  const authorIds = rawList.map((c) =>
    typeof c.authorOpenId === 'string' ? c.authorOpenId : '',
  )
  const userMap = await getUserRowsByOpenIds(usersCol, authorIds)
  const list = rawList.map((c) => {
    const oid = typeof c.authorOpenId === 'string' ? c.authorOpenId.trim() : ''
    const row = oid ? userMap.get(oid) : null
    const stored = typeof c.authorNickName === 'string' ? c.authorNickName : ''
    let authorNickName = stored
    if (row && typeof row.nickName === 'string') {
      const t = row.nickName.trim()
      if (t) authorNickName = t
    }
    return toPublicComment({ ...c, authorNickName }, ctx.OPENID)
  })
  return { ok: true, list }
}

module.exports = listDailyComments
