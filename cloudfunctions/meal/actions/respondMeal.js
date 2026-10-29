async function respondMeal(ctx) {
  const { event, db, mealsCol, usersCol, helpers, OPENID } = ctx
  const id = typeof event.id === 'string' ? event.id.trim() : ''
  if (!id) return { ok: false, error: '缺少报备' }

  const sticker = typeof event.sticker === 'string' ? event.sticker : ''
  if (helpers.STICKERS.indexOf(sticker) < 0) return { ok: false, error: '请选择心意' }
  const note = helpers.cleanText(event.note, helpers.MAX_NOTE)

  const doc = await helpers.loadMeal(mealsCol, id)
  if (!doc) return { ok: false, error: '这条报备不在了' }

  const couple = await helpers.coupleOf(usersCol, OPENID)
  if (!couple.mutual) return { ok: false, error: '请先结伴' }
  if (doc.authorOpenId === OPENID) return { ok: false, error: '只能由对方回应' }
  if (doc.authorOpenId !== couple.partnerId) return { ok: false, error: '无权回应' }

  const now = db.serverDate()
  const patch = {
    response: { sticker: sticker, note: note, updatedAt: now },
    updatedAt: now,
  }
  if (!helpers.toMs(doc.partnerReadAt)) patch.partnerReadAt = now
  await mealsCol.doc(id).update({ data: patch })

  const fresh = await helpers.loadMeal(mealsCol, id)
  const meal = await helpers.toPublicMeal(fresh || doc, id, OPENID, ctx.cloud, usersCol)
  return { ok: true, meal: meal }
}

module.exports = respondMeal
