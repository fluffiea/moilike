/**
 * letters 云函数入口
 * 路由到 actions/ 下各独立模块，helpers.js 提供领域内共享逻辑。
 */

const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const helpers = require('./helpers')

const LETTERS_COLLECTION = 'letters'

const ACTIONS = {
  create: require('./actions/create'),
  list: require('./actions/list'),
  get: require('./actions/get'),
  summary: require('./actions/summary'),
  delete: require('./actions/delete'),
  getMediaTempURLs: require('./actions/getMediaTempURLs'),
}

/** @param {{ action?: string }} event */
exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const OPENID = wxContext.OPENID
  if (!OPENID) {
    return { ok: false, error: '未获取到 OPENID' }
  }

  const db = cloud.database()
  const _ = db.command
  const lettersCol = db.collection(LETTERS_COLLECTION)
  const usersCol = db.collection('users')

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
      _,
      lettersCol,
      usersCol,
      helpers,
      OPENID,
    })
  } catch (err) {
    const msg = err && err.message ? String(err.message) : String(err)
    console.error('letters cloud error', action, err)
    return { ok: false, error: msg || '服务异常' }
  }
}
