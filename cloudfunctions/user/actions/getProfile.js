/**
 * action: getProfile - 获取个人资料
 * @param {{ usersCol: any, helpers: any }} ctx
 */
async function getProfile(ctx) {
  const { usersCol, helpers } = ctx
  const { toPublicUser } = helpers
  const { isDocNotFound } = require('../common/utils')

  try {
    const res = await usersCol.doc(ctx.OPENID).get()
    return { ok: true, user: toPublicUser(res.data, ctx.OPENID) }
  } catch (e) {
    if (isDocNotFound(e)) return { ok: true, user: null }
    throw e
  }
}

module.exports = getProfile
