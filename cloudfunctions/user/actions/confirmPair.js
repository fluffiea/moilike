function digits(raw) {
  if (typeof raw !== 'string') return ''
  return raw.replace(/\D/g, '').slice(0, 6)
}

async function confirmPair(ctx) {
  const { event, db, usersCol, helpers, OPENID, cloud } = ctx
  const code = digits(event.inviteCode)
  if (code.length !== 6) return { ok: false, error: '请输入 6 位邀请码' }

  const me = await helpers.getUserDoc(usersCol, OPENID)
  if (!me) return { ok: false, error: '请先登录' }
  if (helpers.partnerIdOf(me)) return { ok: false, error: '你已结伴' }
  if (me.inviteCode === code) return { ok: false, error: '不能和自己结伴' }

  const hit = await usersCol.where({ inviteCode: code }).limit(2).get()
  const rows = hit.data || []
  if (rows.length === 0) return { ok: false, error: '未找到该邀请码' }
  if (rows.length > 1) return { ok: false, error: '邀请码异常' }
  const target = rows[0]
  const targetOpenId = typeof target.openId === 'string' && target.openId.trim() ? target.openId.trim() : String(target._id || '')
  if (!targetOpenId || targetOpenId === OPENID) return { ok: false, error: '不能和自己结伴' }

  const paired = await helpers.applyPair(db, usersCol, OPENID, targetOpenId)
  if (!paired.ok) return paired

  const doc = await helpers.getUserDoc(usersCol, OPENID)
  const user = await helpers.toPublicUser(usersCol, cloud, doc)
  return { ok: true, user: user }
}

module.exports = confirmPair
