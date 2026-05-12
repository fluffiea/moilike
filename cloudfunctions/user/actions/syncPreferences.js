/**
 * action: syncPreferences - 同步用户偏好设置
 * @param {{ event: Record<string, unknown>, db: any, usersCol: any, helpers: any }} ctx
 */
async function syncPreferences(ctx) {
  const { event, db, usersCol, helpers } = ctx
  const { mergePreferences, toPublicUser } = helpers
  const { isDocNotFound } = require('../../common/utils')

  const incoming =
    event.preferences && typeof event.preferences === 'object' ? event.preferences : {}

  let existing = null
  try {
    const r = await usersCol.doc(ctx.OPENID).get()
    existing = r.data
  } catch (e) {
    if (!isDocNotFound(e)) throw e
  }

  const merged = mergePreferences(
    incoming,
    existing && existing.preferences && typeof existing.preferences === 'object'
      ? existing.preferences
      : undefined,
  )

  const patch = { preferences: merged, updatedAt: db.serverDate() }

  if (existing) {
    await usersCol.doc(ctx.OPENID).update({ data: patch })
  } else {
    await usersCol.doc(ctx.OPENID).set({
      data: {
        _openid: ctx.OPENID,
        openId: ctx.OPENID,
        nickName: '',
        signature: '',
        avatarUrl: '',
        partnerOpenId: null,
        partner: null,
        ...patch,
        createdAt: db.serverDate(),
      },
    })
  }

  const saved = await usersCol.doc(ctx.OPENID).get()
  const user = toPublicUser(saved.data, ctx.OPENID)
  if (!user) return { ok: false, error: '写入后读取用户失败' }
  return { ok: true, user }
}

module.exports = syncPreferences
