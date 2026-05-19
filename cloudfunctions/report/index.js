/**
 * report 云函数入口
 * 路由到 actions/ 下各独立模块，helpers.js 提供领域内共享逻辑。
 */

const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const helpers = require('./helpers')

const ACTIONS = {
  listReports: require('./actions/listReports'),
  getReport: require('./actions/getReport'),
  getReportFeedItem: require('./actions/getReportFeedItem'),
  createReport: require('./actions/createReport'),
  updateReport: require('./actions/updateReport'),
  deleteReport: require('./actions/deleteReport'),
  markReportRead: require('./actions/markReportRead'),
  evaluateReport: require('./actions/evaluateReport'),
  listReportTags: require('./actions/listReportTags'),
  addReportTag: require('./actions/addReportTag'),
  deleteReportTag: require('./actions/deleteReportTag'),
  getReportMediaTempURLs: require('./actions/getReportMediaTempURLs'),
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
  const reportCol = db.collection(helpers.REPORT)
  const usersCol = db.collection(helpers.USERS)

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
      reportCol,
      usersCol,
      helpers,
      OPENID,
    })
  } catch (err) {
    const msg = err && err.message ? String(err.message) : String(err)
    console.error('report cloud error', action, err)
    return { ok: false, error: msg || '服务异常' }
  }
}
