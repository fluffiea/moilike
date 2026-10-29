async function getInvite(ctx) {
  const { db, usersCol, helpers, OPENID } = ctx
  const doc = await helpers.ensureUserFromLegacy(db, usersCol, OPENID)
  if (!doc) return { ok: false, error: '请先登录' }
  let code = typeof doc.inviteCode === 'string' ? doc.inviteCode : ''
  if (!/^\d{6}$/.test(code)) {
    code = await helpers.assignInviteCode(db, usersCol, doc)
  }
  if (!code) return { ok: false, error: '生成邀请码失败' }
  return { ok: true, inviteCode: code, paired: !!helpers.partnerIdOf(doc) }
}

module.exports = getInvite
