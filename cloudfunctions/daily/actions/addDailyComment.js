/**
 * action: addDailyComment - 添加评论
 * @param {{ event: Record<string, unknown>, db: any, dailyCol: any, usersCol: any, helpers: any }} ctx
 */
async function addDailyComment(ctx) {
  const { event, db, dailyCol, usersCol, helpers } = ctx
  const { getUserDocRow } = require('../common/utils')
  const { DAILY_COMMENTS, MAX_COMMENT_TEXT, MAX_COMMENT_DEPTH, toPublicComment, getDailyPostDocForViewer, nickAvatarForDailyAuthor } = helpers

  const postId = typeof event.postId === 'string' ? event.postId.trim() : ''
  const rawText = typeof event.text === 'string' ? event.text : ''
  const text = rawText.trim().slice(0, MAX_COMMENT_TEXT)
  const parentRaw =
    typeof event.parentCommentId === 'string' ? event.parentCommentId.trim() : ''
  if (!postId) return { ok: false, error: '缺少 postId' }
  if (!text) return { ok: false, error: '评论不能为空' }
  const vr = await getDailyPostDocForViewer(dailyCol, usersCol, ctx.OPENID, postId)
  if (!vr.ok) return vr

  const commentsCol = db.collection(DAILY_COMMENTS)
  let depth = 0
  let parentId = ''
  if (parentRaw) {
    let pdoc
    try {
      const pg = await commentsCol.doc(parentRaw).get()
      pdoc = pg.data
    } catch {
      return { ok: false, error: '原评论不存在' }
    }
    if (!pdoc || typeof pdoc !== 'object') {
      return { ok: false, error: '原评论不存在' }
    }
    if (pdoc.dailyPostId !== postId) {
      return { ok: false, error: '原评论不存在' }
    }
    const pd =
      typeof pdoc.depth === 'number' && pdoc.depth >= 0 ? pdoc.depth : 0
    if (pd >= MAX_COMMENT_DEPTH) {
      return { ok: false, error: '回复层级已达上限' }
    }
    depth = pd + 1
    parentId = parentRaw
  }

  const ur = await getUserDocRow(usersCol, ctx.OPENID)
  const nick = nickAvatarForDailyAuthor(ur, { nick: '', avatar: '' }).nick

  const addRes = await commentsCol.add({
    data: {
      dailyPostId: postId,
      authorOpenId: ctx.OPENID,
      authorNickName: nick,
      text,
      parentId: parentId || '',
      depth,
      createdAt: db.serverDate(),
    },
  })
  const newId = addRes._id
  const got = await commentsCol.doc(newId).get()
  const raw = got.data || {}
  return { ok: true, comment: toPublicComment({ ...raw, _id: newId }, ctx.OPENID) }
}

module.exports = addDailyComment
