/**
 * 唯一的云函数入口：event.route = '<域>.<动作>'，例如 daily.list。
 * 返回 { ok: true, data } 或 { ok: false, code, message }。
 */
const cloud = require('wx-server-sdk')
const { createContext } = require('./lib/context')
const { AppError, isCollectionMissing } = require('./lib/util')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const ROUTES = {
  home: require('./routes/home'),
  user: require('./routes/user'),
  daily: require('./routes/daily'),
  report: require('./routes/report'),
  letters: require('./routes/letters'),
}

/** 测试可注入替身 cloud；线上只传 event */
async function handle(event, sdk = cloud) {
  const { OPENID } = sdk.getWXContext()
  if (!OPENID) return { ok: false, code: 'NO_OPENID', message: '未获取到用户身份' }

  const route = typeof event.route === 'string' ? event.route : ''
  const [domain, action] = route.split('.')
  const routes = ROUTES[domain]
  const handler = routes && Object.prototype.hasOwnProperty.call(routes, action) ? routes[action] : null
  if (!handler) return { ok: false, code: 'UNKNOWN_ROUTE', message: `未知接口 ${route}` }

  try {
    const data = await handler(createContext({ cloud: sdk, openid: OPENID }), event)
    return { ok: true, data: data == null ? null : data }
  } catch (e) {
    if (e instanceof AppError) return { ok: false, code: e.code, message: e.message }
    console.error('[api]', route, e)
    if (isCollectionMissing(e)) {
      return { ok: false, code: 'DB_NOT_READY', message: '数据库集合未创建，请按 docs/DATABASE.md 初始化' }
    }
    return { ok: false, code: 'INTERNAL', message: '服务暂时不可用，请稍后重试' }
  }
}

exports.main = (event) => handle(event)
exports.handle = handle
