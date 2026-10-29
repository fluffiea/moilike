async function syncProfile(ctx) {
  const { event, db, usersCol, helpers, OPENID } = ctx
  const nickName = helpers.cleanText(event.nickName, 32)
  const avatarUrl = typeof event.avatarUrl === 'string' ? event.avatarUrl.trim().slice(0, 2048) : ''
  if (!nickName) return { ok: false, error: '请填写昵称' }

  let existing = null
  try {
    existing = await helpers.getUserDoc(usersCol, OPENID)
  } catch (err) {
    if (!helpers.isCollectionMissing(err)) throw err
  }

  const now = db.serverDate()
  if (!existing) {
    await usersCol.doc(OPENID).set({
      data: {
        openId: OPENID,
        _openid: OPENID,
        nickName: nickName,
        avatarUrl: avatarUrl,
        partnerOpenId: null,
        partner: null,
        createdAt: now,
        updatedAt: now,
      },
    })
  } else {
    await usersCol.doc(helpers.docIdOf(existing)).update({
      data: {
        nickName: nickName,
        avatarUrl: avatarUrl || (typeof existing.avatarUrl === 'string' ? existing.avatarUrl : ''),
        updatedAt: now,
      },
    })
  }

  let doc = await helpers.ensureUserFromLegacy(db, usersCol, OPENID)
  if (!doc) return { ok: false, error: '保存资料失败' }

  const pid = helpers.partnerIdOf(doc)
  if (pid) {
    const partnerDoc = await helpers.getUserDoc(usersCol, pid)
    if (partnerDoc && helpers.partnerIdOf(partnerDoc) === OPENID) {
      const snap = helpers.snapshotOf(doc, OPENID)
      snap.nickName = nickName
      if (avatarUrl) snap.avatarUrl = avatarUrl
      await usersCol.doc(helpers.docIdOf(partnerDoc)).update({
        data: { partner: snap, updatedAt: db.serverDate() },
      })
    }
  }

  doc = await helpers.getUserDoc(usersCol, OPENID)
  const user = await helpers.toPublicUser(usersCol, ctx.cloud, doc)
  if (!user) return { ok: false, error: '保存资料失败' }
  return { ok: true, user: user }
}

module.exports = syncProfile
