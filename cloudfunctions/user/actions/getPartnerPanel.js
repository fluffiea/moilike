/**
 * action: getPartnerPanel - 获取结伴面板（绑定码 + 收发申请）
 * @param {{ db: any, usersCol: any, bindReqCol: any, helpers: any }} ctx
 */
async function getPartnerPanel(ctx) {
  const { db, usersCol, bindReqCol, helpers } = ctx
  const { ensureUserBindCode, toPublicUser, formatRequestTimeLabel, isBindCollectionMissing } = helpers

  const ensured = await ensureUserBindCode(db, usersCol, ctx.OPENID)
  if (!ensured.ok) return { ok: false, error: ensured.error || '无法获取绑定码' }
  const user = toPublicUser(ensured.userDoc, ctx.OPENID)
  if (!user) return { ok: false, error: '读取用户失败' }

  let outboundPending = null
  try {
    const outPending = await bindReqCol.where({ fromOpenId: ctx.OPENID, status: 'pending' }).limit(1).get()
    if (outPending.data.length > 0) {
      const row = outPending.data[0]
      outboundPending = {
        id: row._id,
        toNickName: typeof row.toNickName === 'string' ? row.toNickName : '对方',
        ...(typeof row.toAvatarUrl === 'string' && row.toAvatarUrl ? { toAvatarUrl: row.toAvatarUrl } : {}),
        timeLabel: formatRequestTimeLabel(row.createdAt),
      }
    }
  } catch (e) {
    if (!isBindCollectionMissing(e)) throw e
  }

  let inbound = []
  try {
    const inRes = await bindReqCol.where({ toOpenId: ctx.OPENID, status: 'pending' }).limit(20).get()
    inbound = inRes.data
      .slice()
      .sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return tb - ta
      })
      .map((row) => ({
        id: row._id,
        fromOpenId: typeof row.fromOpenId === 'string' ? row.fromOpenId : '',
        fromNickName: typeof row.fromNickName === 'string' ? row.fromNickName : '用户',
        ...(typeof row.fromAvatarUrl === 'string' && row.fromAvatarUrl ? { fromAvatarUrl: row.fromAvatarUrl } : {}),
        timeLabel: formatRequestTimeLabel(row.createdAt),
      }))
  } catch (e) {
    if (!isBindCollectionMissing(e)) throw e
  }

  return { ok: true, user, myBindCode: ensured.bindCode, outboundPending, inbound }
}

module.exports = getPartnerPanel
