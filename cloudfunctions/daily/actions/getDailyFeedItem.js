/**
 * action: getDailyFeedItem - 单条列表卡（帖子+首评摘要）
 * @param {{ event: Record<string, unknown>, db: any, _: any, dailyCol: any, usersCol: any, helpers: any }} ctx
 */
async function getDailyFeedItem(ctx) {
  const { event, db, _, dailyCol, usersCol, helpers } = ctx
  let rawId = ''
  if (typeof event.id === 'string') rawId = event.id
  else if (typeof event.postId === 'string') rawId = event.postId
  const id = rawId.trim()
  if (!id) return { ok: false, error: '缺少 id' }
  const base = await helpers.buildPublicDailyForViewer(dailyCol, usersCol, ctx.OPENID, id)
  if (!base.ok) return base
  const post = await helpers.attachOnePostCommentSummary(db, _, usersCol, base.post)
  return { ok: true, post }
}

module.exports = getDailyFeedItem
