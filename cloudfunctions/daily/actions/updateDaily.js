/**
 * action: updateDaily - 编辑日常
 * @param {{ event: Record<string, unknown>, db: any, dailyCol: any, usersCol: any, helpers: any }} ctx
 */
async function updateDaily(ctx) {
  const { event, db, dailyCol, usersCol, helpers } = ctx
  const { sanitizeImages, getUserDocRow } = require('../common/utils')
  const { MAX_SNIPPET, toPublicDaily, nickAvatarForDailyAuthor } = helpers

  const id = typeof event.id === 'string' ? event.id : ''
  if (!id) return { ok: false, error: '缺少 id' }
  let existing
  try {
    const g = await dailyCol.doc(id).get()
    existing = g.data
  } catch {
    return { ok: false, error: '不存在' }
  }
  if (!existing) return { ok: false, error: '不存在' }
  const aid = typeof existing.authorOpenId === 'string' ? existing.authorOpenId : ''
  if (aid !== ctx.OPENID) {
    return { ok: false, error: '只能编辑自己的日常' }
  }

  const snippet =
    typeof event.snippet === 'string' ? event.snippet.trim().slice(0, MAX_SNIPPET) : ''
  const images = sanitizeImages(event.images)
  if (!snippet && images.length === 0) {
    return { ok: false, error: '内容不能为空' }
  }

  const ur = await getUserDocRow(usersCol, ctx.OPENID)
  const { nick, avatar } = nickAvatarForDailyAuthor(ur, {
    nick: typeof existing.authorNickName === 'string' ? existing.authorNickName : '',
    avatar: typeof existing.authorAvatarUrl === 'string' ? existing.authorAvatarUrl : '',
  })

  await dailyCol.doc(id).update({
    data: {
      snippet,
      images,
      authorNickName: nick,
      authorAvatarUrl: avatar,
      updatedAt: db.serverDate(),
    },
  })
  const got = await dailyCol.doc(id).get()
  const raw = got.data || {}
  return { ok: true, post: toPublicDaily({ ...raw, _id: id }, ctx.OPENID) }
}

module.exports = updateDaily
