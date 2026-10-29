const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const helpers = require('./helpers')

const ACTIONS = {
  getProfile: require('./actions/getProfile'),
  syncProfile: require('./actions/syncProfile'),
  getInvite: require('./actions/getInvite'),
  refreshInvite: require('./actions/refreshInvite'),
  confirmPair: require('./actions/confirmPair'),
  migrateLegacyPairs: require('./actions/migrateLegacyPairs'),
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const OPENID = wxContext.OPENID
  if (!OPENID) return { ok: false, error: '未获取到 OPENID' }

  const payload = event && typeof event === 'object' ? event : {}
  const action = typeof payload.action === 'string' ? payload.action : ''
  const handler = ACTIONS[action]
  if (!handler) return { ok: false, error: '未知操作' }

  const db = cloud.database()
  const usersCol = db.collection(helpers.USERS)
  try {
    return await handler({
      event: payload,
      cloud: cloud,
      db: db,
      usersCol: usersCol,
      helpers: helpers,
      OPENID: OPENID,
    })
  } catch (err) {
    const msg = err && err.message ? String(err.message) : '服务器错误'
    console.error('user', action, err)
    return { ok: false, error: msg }
  }
}
