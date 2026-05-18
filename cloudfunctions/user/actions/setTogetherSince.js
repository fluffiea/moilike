/**
 * action: setTogetherSince - 设置在一起的时间
 * @param {{ event: Record<string, unknown>, db: any, usersCol: any, helpers: any }} ctx
 */
async function setTogetherSince(ctx) {
  const { event, db, usersCol, helpers } = ctx
  const { toPublicUser, usersDocUpdateTry } = helpers
  const { isDocNotFound } = require('../common/utils')

  const raw = event.togetherSinceMs
  let since = NaN
  if (typeof raw === 'number' && !Number.isNaN(raw)) {
    since = raw
  } else if (typeof raw === 'string') {
    since = parseInt(raw.trim(), 10)
  }
  if (!Number.isFinite(since)) return { ok: false, error: '时间无效' }
  since = Math.floor(since / 60000) * 60000

  let me
  try {
    me = (await usersCol.doc(ctx.OPENID).get()).data
  } catch (e) {
    if (isDocNotFound(e)) return { ok: false, error: '请先完善资料' }
    throw e
  }
  const pidRaw = me && typeof me.partnerOpenId === 'string' ? me.partnerOpenId.trim() : ''
  const rawP = me && me.partner != null && typeof me.partner === 'object' ? me.partner : null
  const pOid =
    rawP && typeof rawP.openId === 'string' && rawP.openId.trim() ? rawP.openId.trim() : ''
  if (!pidRaw || !pOid || pOid !== pidRaw) {
    return { ok: false, error: '仅结伴后可设置' }
  }

  const now = Date.now()
  if (since > now + 120000) return { ok: false, error: '不能选择未来时间' }
  const minMs = new Date(1970, 0, 2).getTime()
  if (since < minMs) return { ok: false, error: '日期太早了' }

  const t = db.serverDate()
  const patch = { togetherSinceMs: since, updatedAt: t }
  await usersDocUpdateTry(usersCol, ctx.OPENID, patch)
  await usersDocUpdateTry(usersCol, pidRaw, patch)

  const saved = await usersCol.doc(ctx.OPENID).get()
  const user = toPublicUser(saved.data, ctx.OPENID)
  if (!user) return { ok: false, error: '写入后读取用户失败' }
  return { ok: true, user }
}

module.exports = setTogetherSince
