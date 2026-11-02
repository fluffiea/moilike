const { publicUser } = require('../lib/profile')

/** 朝夕页一次拿齐：资料、伴侣、纪念日和头像链接。 */
async function summary(ctx) {
  const { user } = await publicUser(ctx)
  return { user: user || null }
}

module.exports = { summary }
