async function getProfile(ctx) {
  const doc = await ctx.helpers.ensureUserFromLegacy(ctx.db, ctx.usersCol, ctx.OPENID)
  if (!doc) return { ok: true, user: null }
  const user = await ctx.helpers.toPublicUser(ctx.usersCol, ctx.cloud, doc)
  return { ok: true, user: user }
}

module.exports = getProfile
