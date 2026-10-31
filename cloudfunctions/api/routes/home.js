const { publicUser } = require('../lib/profile')

/** 朝夕页一次拿齐：资料 + 伴侣 + 纪念日 + 头像链接 + 信件摘要 */
async function summary(ctx) {
  const { _ } = ctx
  const mine = _.or([{ senderId: ctx.openid }, { receiverId: ctx.openid }])
  const [{ user }, count, recent] = await Promise.all([
    publicUser(ctx),
    ctx.col.letters.where(mine).count(),
    ctx.col.letters.where(mine).orderBy('createdAt', 'desc').limit(3).get(),
  ])
  if (!user) return { user: null, letters: { total: 0, recent: [] } }
  return {
    user,
    letters: {
      total: count.total || 0,
      recent: (recent.data || []).map((d) => ({ id: d._id, title: d.title || '' })),
    },
  }
}

module.exports = { summary }
