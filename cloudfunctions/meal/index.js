const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const helpers = require('./helpers')

const ACTIONS = {
  createMeal: require('./actions/createMeal'),
  listDay: require('./actions/listDay'),
  getMeal: require('./actions/getMeal'),
  respondMeal: require('./actions/respondMeal'),
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
  try {
    return await handler({
      event: payload,
      cloud: cloud,
      db: db,
      mealsCol: db.collection(helpers.MEALS),
      usersCol: db.collection(helpers.USERS),
      helpers: helpers,
      OPENID: OPENID,
    })
  } catch (err) {
    const msg = err && err.message ? String(err.message) : '服务器错误'
    console.error('meal', action, err)
    return { ok: false, error: msg }
  }
}
