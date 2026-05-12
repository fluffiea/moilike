/**
 * action: createDaily - 新建日常
 * @param {{ event: Record<string, unknown>, db: any, dailyCol: any, usersCol: any, helpers: any }} ctx
 */
async function createDaily(ctx) {
  const { event, db, dailyCol, usersCol, helpers } = ctx
  const { sanitizeImages, getUserDocRow } = require('../../common/utils')
  const { MAX_SNIPPET, toPublicDaily, nickAvatarForDailyAuthor } = helpers

  const snippet =
    typeof event.snippet === 'string' ? event.snippet.trim().slice(0, MAX_SNIPPET) : ''
  const images = sanitizeImages(event.images)
  if (!snippet && images.length === 0) {
    return { ok: false, error: '内容不能为空' }
  }

  const ur = await getUserDocRow(usersCol, ctx.OPENID)
  const { nick, avatar } = nickAvatarForDailyAuthor(ur, { nick: '', avatar: '' })

  const addRes = await dailyCol.add({
    data: {
      authorOpenId: ctx.OPENID,
      snippet,
      images,
      authorNickName: nick,
      authorAvatarUrl: avatar,
      createdAt: db.serverDate(),
      updatedAt: db.serverDate(),
    },
  })
  const newId = addRes._id
  const got = await dailyCol.doc(newId).get()
  const raw = got.data || {}
  return { ok: true, post: toPublicDaily({ ...raw, _id: newId }, ctx.OPENID) }
}

module.exports = createDaily
