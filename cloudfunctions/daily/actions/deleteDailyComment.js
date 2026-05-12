/**
 * action: deleteDailyComment - 删除评论
 * @param {{ event: Record<string, unknown>, db: any, dailyCol: any, usersCol: any, helpers: any }} ctx
 */
async function deleteDailyComment(ctx) {
  const { event, db, dailyCol, usersCol, helpers } = ctx
  const { DAILY_COMMENTS, getDailyPostDocForViewer, countDirectReplies } = helpers

  const postId = typeof event.postId === 'string' ? event.postId.trim() : ''
  const commentId = typeof event.commentId === 'string' ? event.commentId.trim() : ''
  if (!postId || !commentId) return { ok: false, error: '缺少参数' }
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
    return { ok: false, error: '只能删除自己的评论' }
  }
  const replies = await countDirectReplies(commentsCol, postId, commentId)
  if (replies > 0) {
    return { ok: false, error: '已有回复，不能删除' }
  }
  await commentsCol.doc(commentId).remove()
  return { ok: true }
}

module.exports = deleteDailyComment
