/**
 * action: respondBind - 回应结伴申请（接受/拒绝）
 * @param {{ event: Record<string, unknown>, db: any, usersCol: any, bindReqCol: any, helpers: any }} ctx
 */
async function respondBind(ctx) {
  const { event, db, usersCol, bindReqCol, helpers } = ctx
  const {
    isBindCollectionMissing,
    getUserDocData,
    partnerSnapshotFromUserDoc,
    cloneForDb,
    applyUserPartnerPatchForDoc,
    humanizeUserDbWriteError,
    voidPendingBindRequestsForPair,
    clearTogetherSinceForPair,
  } = helpers
  const { isDocNotFound } = require('../common/utils')

  const requestId = typeof event.requestId === 'string' ? event.requestId.trim() : ''
  const accept = event.accept === true
  if (!requestId) return { ok: false, error: '缺少申请' }

  let row
  try {
    row = (await bindReqCol.doc(requestId).get()).data
  } catch (e) {
    if (isBindCollectionMissing(e)) {
      return { ok: false, error: '绑定数据表尚未就绪，请对方先发一次申请或稍后再试' }
    }
    if (isDocNotFound(e)) return { ok: false, error: '申请不存在或已失效' }
    throw e
  }
  if (row.status !== 'pending') return { ok: false, error: '该申请已处理' }
  if (row.toOpenId !== ctx.OPENID) return { ok: false, error: '无权处理该申请' }

  const fromIdRaw = typeof row.fromOpenId === 'string' ? row.fromOpenId : ''
  const fromId = fromIdRaw.trim()
  if (!fromId) return { ok: false, error: '申请数据无效' }

  if (!accept) {
    try {
      await bindReqCol.doc(requestId).update({
        data: { status: 'rejected', respondedAt: db.serverDate() },
      })
    } catch (e) {
      console.error('respondBind reject update', requestId, e)
      return { ok: false, error: '拒绝失败，请稍后重试' }
    }
    return { ok: true }
  }

  let fromDoc
  let toDoc
  try {
    fromDoc = await getUserDocData(usersCol, fromId)
    toDoc = await getUserDocData(usersCol, ctx.OPENID)
  } catch (e) {
    console.error('respondBind getUserDocData', e)
    return { ok: false, error: '读取用户资料失败' }
  }
  if (!fromDoc || !toDoc) return { ok: false, error: '用户资料不存在' }
  if (fromDoc.partnerOpenId || toDoc.partnerOpenId) {
    try {
      await bindReqCol.doc(requestId).update({
        data: { status: 'voided', closedAt: db.serverDate() },
      })
    } catch (e) {
      console.error('respondBind void stale request', requestId, e)
    }
    return { ok: false, error: '对方状态已变化，无法接受' }
  }

  const pForReceiver = partnerSnapshotFromUserDoc(fromDoc)
  const pForSender = partnerSnapshotFromUserDoc(toDoc)
  if (!pForReceiver || !pForSender) return { ok: false, error: '资料不完整，无法接受' }

  let pR, pS
  try {
    pR = cloneForDb(pForReceiver)
    pS = cloneForDb(pForSender)
  } catch {
    return { ok: false, error: '资料序列化失败' }
  }

  try {
    await applyUserPartnerPatchForDoc(db, usersCol, fromDoc, {
      partnerOpenId: ctx.OPENID,
      partner: pS,
      updatedAt: db.serverDate(),
    })
  } catch (e) {
    console.error('respondBind applyUserPartnerPatchForDoc applicant', fromDoc && fromDoc._id, fromId, e)
    return { ok: false, error: humanizeUserDbWriteError(e, '写入对方资料') }
  }

  try {
    await applyUserPartnerPatchForDoc(db, usersCol, toDoc, {
      partnerOpenId: fromId,
      partner: pR,
      updatedAt: db.serverDate(),
    })
  } catch (e) {
    console.error('respondBind applyUserPartnerPatchForDoc self', toDoc && toDoc._id, ctx.OPENID, e)
    try {
      await applyUserPartnerPatchForDoc(db, usersCol, fromDoc, {
        partnerOpenId: null,
        partner: null,
        updatedAt: db.serverDate(),
      })
    } catch (e2) {
      console.error('respondBind rollback applicant failed', fromId, e2)
    }
    return { ok: false, error: humanizeUserDbWriteError(e, '写入本人资料') }
  }

  try {
    await bindReqCol.doc(requestId).update({
      data: { status: 'accepted', respondedAt: db.serverDate() },
    })
  } catch (e) {
    console.error('respondBind accept mark request', requestId, e)
    try {
      await applyUserPartnerPatchForDoc(db, usersCol, fromDoc, {
        partnerOpenId: null,
        partner: null,
        updatedAt: db.serverDate(),
      })
    } catch (e2) {
      console.error('respondBind rollback applicant after accept mark fail', e2)
    }
    try {
      await applyUserPartnerPatchForDoc(db, usersCol, toDoc, {
        partnerOpenId: null,
        partner: null,
        updatedAt: db.serverDate(),
      })
    } catch (e3) {
      console.error('respondBind rollback self after accept mark fail', e3)
    }
    return { ok: false, error: '更新申请状态失败，请稍后重试' }
  }

  await voidPendingBindRequestsForPair(db, bindReqCol, fromId, ctx.OPENID)

  try {
    await clearTogetherSinceForPair(usersCol, db, fromDoc, toDoc)
  } catch (eClear) {
    console.error('respondBind clearTogetherSince', eClear)
  }

  return { ok: true }
}

module.exports = respondBind
