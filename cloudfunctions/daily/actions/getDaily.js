/**
 * action: getDaily - 获取单条日常
 * @param {{ event: Record<string, unknown>, dailyCol: any, usersCol: any, helpers: any }} ctx
 */
async function getDaily(ctx) {
  const { event, dailyCol, usersCol, helpers } = ctx
  const id = typeof event.id === 'string' ? event.id : ''
  if (!id) return { ok: false, error: '缺少 id' }
  return await helpers.buildPublicDailyForViewer(dailyCol, usersCol, ctx.OPENID, id)
}

module.exports = getDaily
