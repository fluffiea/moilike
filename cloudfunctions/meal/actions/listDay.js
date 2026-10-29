async function listDay(ctx) {
  const { event, db, mealsCol, usersCol, helpers, OPENID } = ctx
  const dayKey = typeof event.dayKey === 'string' ? event.dayKey : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return { ok: false, error: '日期不正确' }

  const couple = await helpers.coupleOf(usersCol, OPENID)
  if (!couple.me) return { ok: false, error: '请先登录' }
  const authors = [OPENID]
  if (couple.mutual && couple.partnerId) authors.push(couple.partnerId)

  const _ = db.command
  let rows = []
  try {
    const where = { dayKey: dayKey }
    if (authors.length === 1) where.authorOpenId = authors[0]
    else where.authorOpenId = _.in(authors)
    const res = await mealsCol.where(where).limit(100).get()
    rows = res.data || []
  } catch (err) {
    if (helpers.isCollectionMissing(err)) {
      return { ok: true, dayKey: dayKey, paired: couple.mutual, meals: [] }
    }
    const msg = String(err.errMsg || err.message || '')
    if (msg.toLowerCase().indexOf('index') >= 0) {
      return { ok: false, error: '请为 meals 建立 dayKey 与 authorOpenId 索引' }
    }
    throw err
  }

  rows.sort((a, b) => helpers.toMs(a.recordAt) - helpers.toMs(b.recordAt))
  const meals = []
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const id = row._id ? String(row._id) : ''
    if (!id) continue
    meals.push(await helpers.toPublicMeal(row, id, OPENID, ctx.cloud, usersCol))
  }
  return { ok: true, dayKey: dayKey, paired: couple.mutual, meals: meals }
}

module.exports = listDay
