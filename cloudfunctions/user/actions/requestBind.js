/**
 * action: requestBind - 发起结伴申请
 * @param {{ event: Record<string, unknown>, db: any, usersCol: any, bindReqCol: any, helpers: any }} ctx
 */
async function requestBind(ctx) {
  const { event, db, usersCol, bindReqCol, helpers } = ctx
  const { normalizeBindCodeInput, isBindCollectionMissing } = helpers
  const { isDocNotFound } = require('../../common/utils')

  const code = normalizeBindCodeInput(typeof event.bindCode === 'string' ? event.bindCode : '')
  if (code.length < 6) return { ok: false, error: '请输入对方绑定码' }

  let me
  try {
    me = (await usersCol.doc(ctx.OPENID).get()).data
  } catch (e) {
    if (isDocNotFound(e)) return { ok: false, error: '请先完善资料' }
    throw e
  }
  if (me.partnerOpenId) return { ok: false, error: '你已有对象，无法发起申请' }

  let pendingOutTotal = 0
  try {
    pendingOutTotal = (await bindReqCol.where({ fromOpenId: ctx.OPENID, status: 'pending' }).count()).total
  } catch (e) {
    if (!isBindCollectionMissing(e)) throw e
  }
  if (pendingOutTotal > 0) return { ok: false, error: '你已发出待处理的申请，请等待对方回复' }

  const hit = await usersCol.where({ bindCode: code }).limit(2).get()
  if (hit.data.length === 0) return { ok: false, error: '未找到该绑定码' }
  if (hit.data.length > 1) return { ok: false, error: '绑定码异常，请联系管理员' }
  const target = hit.data[0]
  const targetOpenId = typeof target.openId === 'string' ? target.openId : ''
  if (!targetOpenId || targetOpenId === ctx.OPENID) {
    return { ok: false, error: '不能向自己发起绑定' }
  }
  if (target.partnerOpenId) return { ok: false, error: '对方已有对象，暂时无法接收申请' }

  let dupTotal = 0
  try {
    dupTotal = (
      await bindReqCol.where({ fromOpenId: ctx.OPENID, toOpenId: targetOpenId, status: 'pending' }).count()
    ).total
  } catch (e) {
    if (!isBindCollectionMissing(e)) throw e
  }
  if (dupTotal > 0) return { ok: false, error: '已向对方发送过申请' }

  const fromNickName = typeof me.nickName === 'string' ? me.nickName : ''
  const fromAvatarUrl = typeof me.avatarUrl === 'string' ? me.avatarUrl : ''
  const toNickName = typeof target.nickName === 'string' ? target.nickName : ''
  const toAvatarUrl = typeof target.avatarUrl === 'string' ? target.avatarUrl : ''

  await bindReqCol.add({
    data: {
      fromOpenId: ctx.OPENID,
      toOpenId: targetOpenId,
      fromNickName: fromNickName || '未命名',
      fromAvatarUrl,
      toNickName: toNickName || '未命名',
      toAvatarUrl,
      status: 'pending',
      createdAt: db.serverDate(),
    },
  })

  return { ok: true }
}

module.exports = requestBind
