async function getMeal(ctx) {
  const { event, db, mealsCol, usersCol, helpers, OPENID } = ctx
  const id = typeof event.id === 'string' ? event.id.trim() : ''
  if (!id) return { ok: false, error: '缺少报备' }

  const doc = await helpers.loadMeal(mealsCol, id)
  if (!doc) return { ok: false, error: '这条报备不在了' }

  const couple = await helpers.coupleOf(usersCol, OPENID)
  if (!couple.me) return { ok: false, error: '请先登录' }
  if (!helpers.canView(doc, OPENID, couple.partnerId, couple.mutual)) {
    return { ok: false, error: '无权查看' }
  }

  const isMine = doc.authorOpenId === OPENID
  if (!isMine && !helpers.toMs(doc.partnerReadAt)) {
    await mealsCol.doc(id).update({
      data: { partnerReadAt: db.serverDate() },
    })
    doc.partnerReadAt = new Date()
  }

  const meal = await helpers.toPublicMeal(doc, id, OPENID, ctx.cloud, usersCol)
  return { ok: true, meal: meal }
}

module.exports = getMeal
