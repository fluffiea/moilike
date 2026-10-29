async function refreshInvite(ctx) {
  const { db, usersCol, helpers, OPENID } = ctx
  const doc = await helpers.getUserDoc(usersCol, OPENID)
  if (!doc) return { ok: false, error: '请先登录' }
  if (helpers.partnerIdOf(doc)) return { ok: false, error: '已结伴，不能刷新邀请码' }
  const code = await helpers.assignInviteCode(db, usersCol, doc)
  if (!code) return { ok: false, error: '生成邀请码失败' }
  return { ok: true, inviteCode: code, paired: false }
}

module.exports = refreshInvite
