/**
 * user 云函数内部辅助模块
 */

const { isDocNotFound } = require('../../common/utils')

const USERS = 'users'
const BIND_REQUESTS = 'bind_requests'
const BIND_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
const AVATAR_TEMP_URL_MAX = 20

function isAvatarStorageFileId(x) {
  return typeof x === 'string' && x.startsWith('cloud://') && x.includes('/avatars/')
}

/** @param {unknown} raw */
function cappedUniqueAvatarFileIds(raw) {
  if (!Array.isArray(raw)) return []
  return [...new Set(raw)].filter(isAvatarStorageFileId).slice(0, AVATAR_TEMP_URL_MAX)
}

function stripDoc(doc) {
  if (!doc) return null
  const copy = { ...doc }
  delete copy._id
  return copy
}

/** @param {Record<string, unknown>} raw */
function sanitizePreferences(raw) {
  if (!raw || typeof raw !== 'object') return {}
  const out = {}
  const rf = raw.resonanceReportFilter
  if (rf === 'pending' || rf === 'all' || rf === 'mine') {
    out.resonanceReportFilter = rf
  }
  return out
}

/** @param {Record<string, unknown>} incoming @param {Record<string, unknown>|undefined} existing */
function mergePreferences(incoming, existing) {
  const base = existing && typeof existing === 'object' ? sanitizePreferences(existing) : {}
  if (!incoming || typeof incoming !== 'object') return base
  return { ...base, ...sanitizePreferences(incoming) }
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

  const userOut = {
    openId,
    nickName: typeof row.nickName === 'string' ? row.nickName : '',
    signature: typeof row.signature === 'string' ? row.signature : '',
    avatarUrl: typeof row.avatarUrl === 'string' ? row.avatarUrl : '',
    partnerOpenId: row.partnerOpenId != null ? row.partnerOpenId : null,
    partner,
    ...(hasPrefs ? { preferences } : {}),
  }
  if (typeof row.togetherSinceMs === 'number' && !Number.isNaN(row.togetherSinceMs)) {
    userOut.togetherSinceMs = Math.floor(row.togetherSinceMs)
  }
  return userOut
}

function isBindCollectionMissing(err) {
  if (!err) return false
  const msg = String(err.errMsg || err.message || '').toLowerCase()
  if (msg.includes('bind_requests')) return true
  if (msg.includes('database_collection_not_exist')) return true
  if (msg.includes('db or table not exist')) return true
  if (msg.includes('collection not exist')) return true
  if (err.errCode === -502005 && msg.includes('collection')) return true
  return false
}

function normalizeBindCodeInput(raw) {
  if (typeof raw !== 'string') return ''
  return raw.replace(/\s+/g, '').toUpperCase()
}

function randomBindToken(len = 8) {
  let s = ''
  for (let i = 0; i < len; i++) {
    s += BIND_ALPHABET[Math.floor(Math.random() * BIND_ALPHABET.length)]
  }
  return s
}

/** @param {unknown} v */
function formatRequestTimeLabel(v) {
  try {
    let d = null
    if (v instanceof Date) d = v
    else if (v && typeof v === 'object' && typeof v.getTime === 'function') d = v
    else if (v && typeof v === 'object' && '$date' in v) d = new Date(v.$date)
    else if (typeof v === 'string' || typeof v === 'number') d = new Date(v)
    if (!d || Number.isNaN(d.getTime())) return ''
    const pad = (n) => (n < 10 ? `0${n}` : `${n}`)
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch {
    return ''
  }
}

/** @param {Record<string, unknown>} doc */
function partnerSnapshotFromUserDoc(doc) {
  if (!doc || typeof doc !== 'object') return null
  const openId =
    typeof doc.openId === 'string' && doc.openId.trim()
      ? doc.openId.trim()
      : typeof doc._openid === 'string' && doc._openid.trim()
        ? doc._openid.trim()
        : ''
  if (!openId) return null
  const nickName = typeof doc.nickName === 'string' ? doc.nickName.trim() : ''
  return {
    openId,
    nickName: nickName || '未命名',
    ...(typeof doc.avatarUrl === 'string' && doc.avatarUrl ? { avatarUrl: doc.avatarUrl } : {}),
    ...(typeof doc.signature === 'string' && doc.signature ? { signature: doc.signature } : {}),
  }
}

/**
 * @param {import('wx-server-sdk').DB.Database} db
 * @param {import('wx-server-sdk').DB.CollectionReference} bindCol
 * @param {string} openIdA
 * @param {string} openIdB
 */
async function voidPendingBindRequestsForPair(db, bindCol, openIdA, openIdB) {
  let buckets
  try {
    buckets = await Promise.all([
      bindCol.where({ status: 'pending', fromOpenId: openIdA }).get(),
      bindCol.where({ status: 'pending', toOpenId: openIdA }).get(),
      bindCol.where({ status: 'pending', fromOpenId: openIdB }).get(),
      bindCol.where({ status: 'pending', toOpenId: openIdB }).get(),
    ])
  } catch (e) {
    if (isBindCollectionMissing(e)) return
    console.error('voidPendingBindRequestsForPair query', e)
    return
  }
  const seen = new Set()
  for (const { data } of buckets) {
    for (const row of data) {
      const id = row._id
      if (!id || seen.has(id)) continue
      seen.add(id)
      try {
        await bindCol.doc(id).update({
          data: { status: 'voided', closedAt: db.serverDate() },
        })
      } catch (e) {
        console.error('voidPendingBindRequestsForPair update', id, e)
      }
    }
  }
}

function cloneForDb(value) {
  return JSON.parse(JSON.stringify(value))
}

/** @param {unknown} v @param {number} max */
function truncateDbString(v, max) {
  if (typeof v !== 'string') return ''
  return v.trim().slice(0, max).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
}

/** @param {unknown} raw */
function normalizeUserDocIdValue(raw) {
  if (raw == null || raw === '') return ''
  if (typeof raw === 'string') return raw
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw)
  if (typeof raw === 'object' && raw !== null) {
    const oid = raw.$oid
    if (typeof oid === 'string' && oid) return oid
  }
  const s = String(raw)
  return s && s !== 'undefined' && s !== '[object Object]' ? s : ''
}

/**
 * @param {import('wx-server-sdk').DB.CollectionReference} users
 * @param {import('wx-server-sdk').DB.Database} db
 * @param {Record<string, unknown>} userDocA
 * @param {Record<string, unknown>} userDocB
 */
async function clearTogetherSinceForPair(users, db, userDocA, userDocB) {
  const _ = db.command
  const idA = normalizeUserDocIdValue(userDocA && userDocA._id)
  const idB = normalizeUserDocIdValue(userDocB && userDocB._id)
  if (!idA || !idB) return
  const t = db.serverDate()
  await Promise.all([
    usersDocUpdateTry(users, idA, { togetherSinceMs: _.remove(), updatedAt: t }),
    usersDocUpdateTry(users, idB, { togetherSinceMs: _.remove(), updatedAt: t }),
  ])
}

/**
 * @param {Record<string, unknown>|null|undefined} doc
 * @param {string} docPathId
 */
function withStableUserDocId(doc, docPathId) {
  if (!doc || typeof doc !== 'object') return doc
  const fromField = normalizeUserDocIdValue(doc._id)
  if (fromField) return Object.assign({}, doc, { _id: fromField })
  const path = typeof docPathId === 'string' ? docPathId.trim() : ''
  if (path) return Object.assign({}, doc, { _id: path })
  return doc
}

/**
 * @param {import('wx-server-sdk').DB.CollectionReference} users
 * @param {string} openId
 */
async function getUserDocData(users, openId) {
  const t = typeof openId === 'string' ? openId.trim() : ''
  if (!t) return null
  try {
    const r = await users.doc(t).get()
    return withStableUserDocId(r.data, t)
  } catch (e) {
    if (!isDocNotFound(e)) throw e
  }
  const byOpen = await users.where({ openId: t }).limit(1).get()
  if (byOpen.data && byOpen.data[0]) return withStableUserDocId(byOpen.data[0], '')
  const byOid = await users.where({ _openid: t }).limit(1).get()
  if (byOid.data && byOid.data[0]) return withStableUserDocId(byOid.data[0], '')
  return null
}

/**
 * @param {Record<string, unknown>} partnerIn
 */
function buildPartnerPlainObject(partnerIn) {
  const p = partnerIn && typeof partnerIn === 'object' ? partnerIn : {}
  const openId = truncateDbString(p.openId, 128)
  const nickName = truncateDbString(p.nickName, 64) || '未命名'
  const out = { openId, nickName }
  const av = truncateDbString(p.avatarUrl, 2048)
  const sig = truncateDbString(p.signature, 500)
  if (av) out.avatarUrl = av
  if (sig) out.signature = sig
  return out
}

/** @param {Record<string, unknown>} userDoc */
function userDocPartnerNeedsUnsetBeforeSet(userDoc) {
  if (!userDoc || typeof userDoc !== 'object') return true
  const p = userDoc.partner
  if (p === null || p === undefined) return true
  if (typeof p !== 'object' || Array.isArray(p)) return true
  return false
}

/**
 * @param {import('wx-server-sdk').DB.CollectionReference} users
 * @param {string} docId
 * @param {Record<string, unknown>} data
 */
async function usersDocUpdateTry(users, docId, data) {
  try {
    await users.doc(docId).update({ data })
  } catch (e) {
    if (!e || e.errCode !== -502001) throw e
    console.error('users.doc update -502001, retry where(_id)', docId, e.errMsg, e)
    const res = await users.where({ _id: docId }).limit(1).update({ data })
    const n = res && res.stats ? Number(res.stats.updated) || 0 : 0
    if (n < 1) throw e
  }
}

/**
 * @param {import('wx-server-sdk').DB.Database} db
 * @param {import('wx-server-sdk').DB.CollectionReference} users
 * @param {Record<string, unknown>} userDoc
 * @param {{ partnerOpenId?: unknown, partner?: unknown, updatedAt?: unknown }} dataPatch
 */
async function applyUserPartnerPatchForDoc(db, users, userDoc, dataPatch) {
  if (!userDoc || typeof userDoc !== 'object') {
    const e = new Error('userDoc 无效')
    e.errCode = -1
    throw e
  }
  const docId = normalizeUserDocIdValue(userDoc._id)
  if (!docId) {
    const e = new Error('用户文档缺少 _id')
    e.errCode = -1
    throw e
  }
  const _ = db.command
  const data = {}
  if ('updatedAt' in dataPatch && dataPatch.updatedAt !== undefined) {
    data.updatedAt = dataPatch.updatedAt
  }
  if ('partnerOpenId' in dataPatch) {
    data.partnerOpenId = dataPatch.partnerOpenId
  }
  try {
    if ('partner' in dataPatch && dataPatch.partner === null) {
      data.partner = _.remove()
      await usersDocUpdateTry(users, docId, data)
      return
    }
    if (dataPatch.partner && typeof dataPatch.partner === 'object') {
      const pt = buildPartnerPlainObject(dataPatch.partner)
      if (!pt.openId) {
        const e = new Error('partner 缺少 openId')
        e.errCode = -1
        throw e
      }
      if (userDocPartnerNeedsUnsetBeforeSet(userDoc)) {
        await usersDocUpdateTry(users, docId, { partner: _.remove() })
      }
      data.partner = pt
      await usersDocUpdateTry(users, docId, data)
      return
    }
    await usersDocUpdateTry(users, docId, data)
  } catch (e) {
    console.error('applyUserPartnerPatchForDoc', docId, Object.keys(data), e && e.errCode, e && e.errMsg, e)
    throw e
  }
}

function humanizeUserDbWriteError(err, who) {
  const c = err && err.errCode
  const msg = err ? String(err.errMsg || err.message || '') : ''
  if (c === -502003 || msg.includes('permission') || msg.includes('权限')) {
    return `${who}失败：数据库拒绝写入。请在云开发控制台检查「users」集合权限，建议小程序端不直连该集合，仅通过云函数读写。`
  }
  if (c === -502001 || msg.includes('502001')) {
    return `${who}失败（-502001）。请在微信开发者工具中对云函数 user 执行「上传并部署：云端安装依赖」后再试；若仍失败，把日志中完整 errMsg 发给开发者。`
  }
  return `${who}失败，请稍后重试`
}

/**
 * @param {import('wx-server-sdk').DB.Database} db
 * @param {import('wx-server-sdk').DB.CollectionReference} users
 * @param {string} OPENID
 */
async function ensureUserBindCode(db, users, OPENID) {
  let doc
  try {
    const r = await users.doc(OPENID).get()
    doc = r.data
  } catch (e) {
    if (isDocNotFound(e)) return { ok: false, error: '请先完善资料并登录' }
    throw e
  }
  const existing = typeof doc.bindCode === 'string' ? normalizeBindCodeInput(doc.bindCode) : ''
  if (existing.length >= 6) return { ok: true, bindCode: existing, userDoc: doc }
  for (let attempt = 0; attempt < 16; attempt++) {
    const code = randomBindToken(8)
    const hit = await users.where({ bindCode: code }).count()
    if (hit.total > 0) continue
    await users.doc(OPENID).update({
      data: { bindCode: code, updatedAt: db.serverDate() },
    })
    const again = await users.doc(OPENID).get()
    return { ok: true, bindCode: code, userDoc: again.data }
  }
  return { ok: false, error: '生成绑定码失败，请稍后重试' }
}

module.exports = {
  USERS,
  BIND_REQUESTS,
  AVATAR_TEMP_URL_MAX,
  isAvatarStorageFileId,
  cappedUniqueAvatarFileIds,
  stripDoc,
  sanitizePreferences,
  mergePreferences,
  toPublicUser,
  isBindCollectionMissing,
  normalizeBindCodeInput,
  randomBindToken,
  formatRequestTimeLabel,
  partnerSnapshotFromUserDoc,
  voidPendingBindRequestsForPair,
  cloneForDb,
  truncateDbString,
  normalizeUserDocIdValue,
  clearTogetherSinceForPair,
  withStableUserDocId,
  getUserDocData,
  buildPartnerPlainObject,
  userDocPartnerNeedsUnsetBeforeSet,
  usersDocUpdateTry,
  applyUserPartnerPatchForDoc,
  humanizeUserDbWriteError,
  ensureUserBindCode,
}
