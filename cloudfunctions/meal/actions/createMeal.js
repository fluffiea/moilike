async function createMeal(ctx) {
  const { event, db, mealsCol, usersCol, helpers, OPENID } = ctx
  const couple = await helpers.coupleOf(usersCol, OPENID)
  if (!couple.me) return { ok: false, error: '请先登录' }
  if (!couple.mutual) return { ok: false, error: '请先结伴' }

  const images = helpers.sanitizeImages(event.images, OPENID)
  if (!Array.isArray(event.images) || event.images.length === 0) {
    return { ok: false, error: '请先添加照片' }
  }
  if (images.length === 0) return { ok: false, error: '照片还没上传完成' }
  if (event.images.length > helpers.MAX_IMAGES) return { ok: false, error: '最多九张照片' }

  const slot = typeof event.slot === 'string' ? event.slot : ''
  if (helpers.SLOTS.indexOf(slot) < 0) return { ok: false, error: '餐次不正确' }

  const dayKey = typeof event.dayKey === 'string' ? event.dayKey : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return { ok: false, error: '日期不正确' }

  const recordAtMs = event.recordAtMs
  if (typeof recordAtMs !== 'number' || !Number.isFinite(recordAtMs) || recordAtMs < 1577836800000) {
    return { ok: false, error: '时间不正确' }
  }

  const text = helpers.cleanText(event.text, helpers.MAX_TEXT)
  const nick = typeof couple.me.nickName === 'string' ? couple.me.nickName : ''
  const avatar = typeof couple.me.avatarUrl === 'string' ? couple.me.avatarUrl : ''
  const now = db.serverDate()
  const added = await mealsCol.add({
    data: {
      authorOpenId: OPENID,
      partnerOpenId: couple.partnerId,
      authorNickName: nick,
      authorAvatarUrl: avatar,
      images: images,
      text: text,
      slot: slot,
      dayKey: dayKey,
      recordAt: new Date(recordAtMs),
      partnerReadAt: null,
      response: null,
      createdAt: now,
      updatedAt: now,
    },
  })
  const id = added._id
  const doc = await helpers.loadMeal(mealsCol, id)
  const meal = await helpers.toPublicMeal(doc || {}, id, OPENID, ctx.cloud, usersCol)
  return { ok: true, meal: meal }
}

module.exports = createMeal
