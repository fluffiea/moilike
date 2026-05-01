const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const USERS = 'users'

function stripDoc(doc) {
  if (!doc) return null
  const copy = { ...doc }
  delete copy._id
  return copy
}

/** @param {Record<string, unknown>} raw */
function sanitizePreferences(raw) {
  if (!raw || typeof raw !== 'object') return {}
  /** @type {{ chronicleDefaultMainTab?: string, chronicleReportFilter?: string }} */
  const out = {}
  const main = raw.chronicleDefaultMainTab
  if (main === 'daily' || main === 'report') {
    out.chronicleDefaultMainTab = main
  }
  const rf = raw.chronicleReportFilter
  if (rf === 'pending' || rf === 'all' || rf === 'mine') {
    out.chronicleReportFilter = rf
  }
  return out
}

/** @param {Record<string, unknown>} incoming @param {Record<string, unknown>|undefined} existing */
function mergePreferences(incoming, existing) {
  const base =
    existing && typeof existing === 'object' ? sanitizePreferences(existing) : {}
  if (!incoming || typeof incoming !== 'object') return base
  const inc = sanitizePreferences(incoming)
  return { ...base, ...inc }
}

function toPublicUser(doc, openIdFallback) {
  const row = stripDoc(doc)
  if (!row) return null
  const openId =
    typeof row.openId === 'string' && row.openId
      ? row.openId
      : typeof openIdFallback === 'string'
        ? openIdFallback
        : ''
  if (!openId) return null

  const rawPartner = row.partner
  let partner = null
  if (
    rawPartner != null &&
    typeof rawPartner === 'object' &&
    typeof rawPartner.openId === 'string' &&
    typeof rawPartner.nickName === 'string'
  ) {
    partner = {
      openId: rawPartner.openId,
      nickName: rawPartner.nickName,
      ...(typeof rawPartner.avatarUrl === 'string' ? { avatarUrl: rawPartner.avatarUrl } : {}),
      ...(typeof rawPartner.signature === 'string' ? { signature: rawPartner.signature } : {}),
    }
  }

  const preferencesRaw = row.preferences
  const preferences =
    preferencesRaw && typeof preferencesRaw === 'object'
      ? sanitizePreferences(preferencesRaw)
      : {}
  const hasPrefs = Object.keys(preferences).length > 0

  return {
    openId,
    nickName: typeof row.nickName === 'string' ? row.nickName : '',
    signature: typeof row.signature === 'string' ? row.signature : '',
    avatarUrl: typeof row.avatarUrl === 'string' ? row.avatarUrl : '',
    partnerOpenId: row.partnerOpenId != null ? row.partnerOpenId : null,
    partner,
    ...(hasPrefs ? { preferences } : {}),
  }
}

function isDocNotFound(err) {
  if (!err) return false
  const c = err.errCode
  const msg = String(err.errMsg || err.message || '')
  return (
    c === -502003 ||
    c === -502005 ||
    msg.includes('does not exist') ||
    msg.includes('不存在') ||
    msg.includes('cannot find document')
  )
}

/**
 * @param {{
 *   action?: string,
 *   nickName?: string,
 *   signature?: string,
 *   avatarUrl?: string,
 *   preferences?: Record<string, unknown>,
 * }} event
 */
exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const OPENID = wxContext.OPENID
  if (!OPENID) {
    return { ok: false, error: '未获取到 OPENID' }
  }

  const db = cloud.database()
  const users = db.collection(USERS)

  try {
    if (event.action === 'getProfile') {
      try {
        const res = await users.doc(OPENID).get()
        return { ok: true, user: toPublicUser(res.data, OPENID) }
      } catch (e) {
        if (isDocNotFound(e)) {
          return { ok: true, user: null }
        }
        throw e
      }
    }

    if (event.action === 'syncProfile') {
      const nickName = typeof event.nickName === 'string' ? event.nickName.trim() : ''
      const signature = typeof event.signature === 'string' ? event.signature.trim() : ''
      const avatarUrl = typeof event.avatarUrl === 'string' ? event.avatarUrl.trim() : ''

      let existing = null
      try {
        const r = await users.doc(OPENID).get()
        existing = r.data
      } catch (e) {
        if (!isDocNotFound(e)) throw e
      }

      const patch = {
        nickName: nickName || (existing && existing.nickName) || '',
        signature: signature || (existing && existing.signature) || '',
        avatarUrl: avatarUrl || (existing && existing.avatarUrl) || '',
        updatedAt: db.serverDate(),
      }

      if (existing) {
        await users.doc(OPENID).update({ data: patch })
      } else {
        await users.doc(OPENID).set({
          data: {
            _openid: OPENID,
            openId: OPENID,
            ...patch,
            partnerOpenId: null,
            partner: null,
            createdAt: db.serverDate(),
          },
        })
      }

      const saved = await users.doc(OPENID).get()
      const user = toPublicUser(saved.data, OPENID)
      if (!user) {
        return { ok: false, error: '写入后读取用户失败' }
      }
      return { ok: true, user }
    }

    if (event.action === 'syncPreferences') {
      const incoming =
        event.preferences && typeof event.preferences === 'object' ? event.preferences : {}

      let existing = null
      try {
        const r = await users.doc(OPENID).get()
        existing = r.data
      } catch (e) {
        if (!isDocNotFound(e)) throw e
      }

      const merged = mergePreferences(
        incoming,
        existing && existing.preferences && typeof existing.preferences === 'object'
          ? existing.preferences
          : undefined,
      )

      const patch = {
        preferences: merged,
        updatedAt: db.serverDate(),
      }

      if (existing) {
        await users.doc(OPENID).update({ data: patch })
      } else {
        await users.doc(OPENID).set({
          data: {
            _openid: OPENID,
            openId: OPENID,
            nickName: '',
            signature: '',
            avatarUrl: '',
            partnerOpenId: null,
            partner: null,
            ...patch,
            createdAt: db.serverDate(),
          },
        })
      }

      const saved = await users.doc(OPENID).get()
      const user = toPublicUser(saved.data, OPENID)
      if (!user) {
        return { ok: false, error: '写入后读取用户失败' }
      }
      return { ok: true, user }
    }

    return { ok: false, error: '未知 action' }
  } catch (err) {
    const msg = err && err.message ? String(err.message) : String(err.errMsg || '服务器错误')
    console.error('user', msg, err)
    return { ok: false, error: msg }
  }
}
