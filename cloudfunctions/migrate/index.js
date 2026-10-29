const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const { MAPPING_NOTES } = require('./mapping')
const migrateLegacyMeals = require('./actions/migrateLegacyMeals')

function rejectMigrateKey(event) {
  const expected = typeof process.env.MIGRATE_KEY === 'string' ? process.env.MIGRATE_KEY : ''
  const got = event && typeof event.key === 'string' ? event.key : ''
  if (!expected || got !== expected) {
    return { ok: false, error: '请在云函数环境变量设置 MIGRATE_KEY，并传入相同的 key' }
  }
  return null
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  if (!wxContext.OPENID) return { ok: false, error: '未获取到 OPENID' }
  const payload = event && typeof event === 'object' ? event : {}
  const action = typeof payload.action === 'string' ? payload.action : ''
  if (action === 'notes') return { ok: true, notes: MAPPING_NOTES }
  if (action !== 'migrateLegacyMeals') return { ok: false, error: '未知操作' }
  const denied = rejectMigrateKey(payload)
  if (denied) return denied
  const db = cloud.database()
  try {
    return await migrateLegacyMeals({ event: payload, db: db, cloud: cloud })
  } catch (err) {
    console.error('migrate', err)
    return { ok: false, error: err && err.message ? String(err.message) : '服务器错误' }
  }
}
