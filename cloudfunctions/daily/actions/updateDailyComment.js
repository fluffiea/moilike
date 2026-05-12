/**
 * action: updateDailyComment - 编辑评论
 * @param {{ event: Record<string, unknown>, db: any, dailyCol: any, usersCol: any, helpers: any }} ctx
 */
async function updateDailyComment(ctx) {
  const { event, db, dailyCol, usersCol, helpers } = ctx
  const { getUserDocRow } = require('../../common/utils')
  const { DAILY_COMMENTS, MAX_COMMENT_TEXT, toPublicComment, getDailyPostDocForViewer, nickAvatarForDailyAuthor, countDirectReplies } = helpers

  const postId = typeof event.postId === 'string' ? event.postId.trim() : ''
  const commentId = typeof event.commentId === 'string' ? event.commentId.trim() : ''
  const rawText = typeof event.text === 'string' ? event.text : ''
  const text = rawText.trim().slice(0, MAX_COMMENT_TEXT)
  if (!postId || !commentId) return { ok: false, error: '缺少参数' }
  if (!text) return { ok: false, error: '评论不能为空' }
  const vr = await getDailyPostDocForViewer(dailyCol, usersCol, ctx.OPENID, postId)
  if (!vr.ok) return vr

  const commentsCol = db.collection(DAILY_COMMENTS)
  let existing
  try {
    const g = await commentsCol.doc(commentId).get()
    existing = g.data
  } catch {
    return { ok: false, error: '评论不存在' }
  }
  if (!existing || typeof existing !== 'object') {
    return { ok: false, error: '评论不存在' }
  }
  if (existing.dailyPostId !== postId) {
    return { ok: false, error: '评论不存在' }
  }
  const aid = typeof existing.authorOpenId === 'string' ? existing.authorOpenId : ''
  if (aid !== ctx.OPENID) {
    return { ok: false, error: '只能编辑自己的评论' }
  }
  const replies = await countDirectReplies(commentsCol, postId, commentId)
  if (replies > 0) {
    return { ok: false, error: '已有回复，不能编辑' }
  }

  const ur = await getUserDocRow(usersCol, ctx.OPENID)
  const nick = nickAvatarForDailyAuthor(ur, { nick: '', avatar: '' }).nick

  await commentsCol.doc(commentId).update({
    data: { text, authorNickName: nick },
  })
  const got = await commentsCol.doc(commentId).get()
  const raw = got.data || {}
  return { ok: true, comment: toPublicComment({ ...raw, _id: commentId }, ctx.OPENID) }
}

module.exports = updateDailyComment
