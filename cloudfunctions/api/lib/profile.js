const { partnerIdOf } = require('./context')
const media = require('./media')

const REPORT_FILTERS = ['all', 'await_me', 'mine']
const LEDGER_SCOPES = ['none', 'summary', 'detail']

function preferencesOf(doc) {
  let raw = doc && doc.preferences ? doc.preferences.resonanceReportFilter : ''
  // 旧「待处理」并入「等我回声」；已存偏好保持原样；没存过的新用户先看两个人的全部
  if (raw === 'action_needed') raw = 'await_me'
  return { resonanceReportFilter: REPORT_FILTERS.includes(raw) ? raw : 'all' }
}

/** 我对对方开放自己账单的范围。缺省是全部明细。 */
function ledgerVisibilityOf(doc) {
  const raw = doc && doc.ledgerVisibility ? doc.ledgerVisibility.scope : ''
  return { scope: LEDGER_SCOPES.includes(raw) ? raw : 'detail' }
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
    ledgerVisibility: ledgerVisibilityOf(me),
    partner: partner
      ? {
          openId: partnerIdOf(me),
          nickName: partner.nickName || '对方',
          signature: partner.signature || '',
          avatarUrl: media.avatar(partner.avatarUrl, urls),
          ledgerScope: ledgerVisibilityOf(partner).scope,
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

module.exports = { REPORT_FILTERS, LEDGER_SCOPES, ledgerVisibilityOf, publicUser, freshUser }
