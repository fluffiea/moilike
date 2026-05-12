/**
 * action: syncProfile - 同步个人资料
 * @param {{ event: Record<string, unknown>, db: any, usersCol: any, helpers: any }} ctx
 */
async function syncProfile(ctx) {
  const { event, db, usersCol, helpers } = ctx
  const { toPublicUser } = helpers
  const { isDocNotFound } = require('../../common/utils')

  const nickName = typeof event.nickName === 'string' ? event.nickName.trim() : ''
  const signature = typeof event.signature === 'string' ? event.signature.trim() : ''
  const avatarUrl = typeof event.avatarUrl === 'string' ? event.avatarUrl.trim() : ''

  let existing = null
  try {
    const r = await usersCol.doc(ctx.OPENID).get()
    existing = r.data
  } catch (e) {
    if (!isDocNotFound(e)) throw e
  }

  const patch = {
    nickName: nickName || (existing && existing.nickName) || '',
    signature: signature || (existing && existing.signature) || '',
    avatarUrl: avatarUrl || (existing && existing.avatarUrl) || '',
    updatedAt: db.serverDate(),
  }

  if (existing) {
    await usersCol.doc(ctx.OPENID).update({ data: patch })
  } else {
    await usersCol.doc(ctx.OPENID).set({
      data: {
        _openid: ctx.OPENID,
        openId: ctx.OPENID,
        ...patch,
        partnerOpenId: null,
        partner: null,
        createdAt: db.serverDate(),
      },
    })
  }

  const saved = await usersCol.doc(ctx.OPENID).get()
  const user = toPublicUser(saved.data, ctx.OPENID)
  if (!user) return { ok: false, error: '写入后读取用户失败' }
  return { ok: true, user }
}

module.exports = syncProfile
