const { partnerIdOf } = require('./context')
const media = require('./media')

const REPORT_FILTERS = ['all', 'action_needed', 'mine']

function preferencesOf(doc) {
  const raw = doc && doc.preferences ? doc.preferences.resonanceReportFilter : ''
  return { resonanceReportFilter: REPORT_FILTERS.includes(raw) ? raw : 'mine' }
}

function toPublicUser(openid, me, partner, urls) {
  const since = typeof me.togetherSinceMs === 'number' ? Math.floor(me.togetherSinceMs) : null
  return {
    openId: openid,
    nickName: me.nickName || '',
    signature: me.signature || '',
    avatarFileId: typeof me.avatarUrl === 'string' ? me.avatarUrl : '',
    avatarUrl: media.avatar(me.avatarUrl, urls),
    togetherSinceMs: partner ? since : null,
    preferences: preferencesOf(me),
    partner: partner
      ? {
          openId: partnerIdOf(me),
          nickName: partner.nickName || '对方',
          signature: partner.signature || '',
          avatarUrl: media.avatar(partner.avatarUrl, urls),
        }
      : null,
  }
}

/**
 * 当前用户的公开资料；未注册 user 为 null。
 * extraFileIds 与双方头像合并为一次签名，签名结果通过 urls 返回给调用方复用。
 */
async function publicUser(ctx, extraFileIds = []) {
  const [me, partner] = await Promise.all([ctx.me(), ctx.partner()])
  if (!me) return { user: null, urls: new Map() }
  const urls = await media.sign(ctx.cloud, [me.avatarUrl, partner && partner.avatarUrl, ...extraFileIds])
  return { user: toPublicUser(ctx.openid, me, partner, urls), urls }
}

/** 写入用户文档后重新读取 */
async function freshUser(ctx) {
  ctx.reset()
  return (await publicUser(ctx)).user
}

module.exports = { REPORT_FILTERS, publicUser, freshUser }
