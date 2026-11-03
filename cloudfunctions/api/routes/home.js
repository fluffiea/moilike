const { publicUser } = require('../lib/profile')
const { countAwaiting } = require('./report')

/** 朝夕页一次拿齐：资料、伴侣、纪念日、头像链接，以及共鸣待我回应条数。 */
async function summary(ctx) {
  const { user } = await publicUser(ctx)
  const awaitMeCount = user && user.partner ? await countAwaiting(ctx, user.partner.openId) : 0
  return { user: user || null, awaitMeCount }
}

module.exports = { summary }
