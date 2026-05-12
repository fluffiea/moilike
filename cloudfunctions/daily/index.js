/**
 * daily 云函数入口
 * 路由到 actions/ 下各独立模块，helpers.js 提供领域内共享逻辑。
 */

const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const helpers = require('./helpers')

const USERS_COLLECTION = 'users'
const DAILY_COLLECTION = 'daily_posts'

const ACTIONS = {
  listDaily: require('./actions/listDaily'),
  getDaily: require('./actions/getDaily'),
  getDailyFeedItem: require('./actions/getDailyFeedItem'),
  createDaily: require('./actions/createDaily'),
  updateDaily: require('./actions/updateDaily'),
  deleteDaily: require('./actions/deleteDaily'),
  listDailyComments: require('./actions/listDailyComments'),
  addDailyComment: require('./actions/addDailyComment'),
  updateDailyComment: require('./actions/updateDailyComment'),
  deleteDailyComment: require('./actions/deleteDailyComment'),
  getDailyMediaTempURLs: require('./actions/getDailyMediaTempURLs'),
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
  const dailyCol = db.collection(DAILY_COLLECTION)
  const usersCol = db.collection(USERS_COLLECTION)

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
      dailyCol,
      usersCol,
      helpers,
      OPENID,
    })
  } catch (err) {
    const msg = err && err.message ? String(err.message) : String(err)
    console.error('daily cloud error', action, err)
    return { ok: false, error: msg || '服务异常' }
  }
}
