/**
 * user 云函数入口
 * 路由到 actions/ 下各独立模块，helpers.js 提供领域内共享逻辑。
 */

const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const helpers = require('./helpers')

const ACTIONS = {
  getTempFileURLs: require('./actions/getTempFileURLs'),
  getProfile: require('./actions/getProfile'),
  syncProfile: require('./actions/syncProfile'),
  syncPreferences: require('./actions/syncPreferences'),
  setTogetherSince: require('./actions/setTogetherSince'),
  getPartnerPanel: require('./actions/getPartnerPanel'),
  requestBind: require('./actions/requestBind'),
  respondBind: require('./actions/respondBind'),
}

/** @param {{ action?: string }} event */
exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const OPENID = wxContext.OPENID
  if (!OPENID) {
    return { ok: false, error: '未获取到 OPENID' }
  }

  const db = cloud.database()
  const usersCol = db.collection(helpers.USERS)
  const bindReqCol = db.collection(helpers.BIND_REQUESTS)

  const action = typeof event.action === 'string' ? event.action : ''
  const handler = ACTIONS[action]
  if (!handler) {
    return { ok: false, error: '未知操作' }
  }

  try {
    return await handler({
      event,
      cloud,
      db,
      usersCol,
      bindReqCol,
      helpers,
      OPENID,
    })
  } catch (err) {
    const msg = err && err.message ? String(err.message) : String(err.errMsg || '服务器错误')
    console.error('user cloud error', action, err)
    return { ok: false, error: msg }
  }
}
