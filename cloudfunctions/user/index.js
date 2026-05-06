const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

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
  /** @type {{ resonanceReportFilter?: string }} */
  const out = {}
  const rf = raw.resonanceReportFilter
  if (rf === 'pending' || rf === 'all' || rf === 'mine') {
    out.resonanceReportFilter = rf
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

  /** @type {Record<string, unknown>} */
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

/** 绑定申请集合尚未在云控制台创建，或名称不一致 */
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
    else if (v && typeof v === 'object' && typeof v.getTime === 'function') d = /** @type {Date} */ (v)
    else if (v && typeof v === 'object' && '$date' in v) d = new Date(/** @type {{ $date: number }} */ (v).$date)
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

/** 云数据库 update 仅接受可 JSON 序列化的纯对象 */
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
    const oid = /** @type {{ $oid?: string }} */ (raw).$oid
    if (typeof oid === 'string' && oid) return oid
  }
  const s = String(raw)
  return s && s !== 'undefined' && s !== '[object Object]' ? s : ''
}

/**
 * 新结伴生效时清空双方旧的「在一起」时间戳（若存在），避免沿用上段关系数据。
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
 * 保证 users 文档带可写 _id：用 doc(openid) 拉取时少数 SDK/版本可能不把 _id 放进 data，此时 _id 即请求路径。
 * @param {Record<string, unknown>|null|undefined} doc
 * @param {string} docPathId 使用 collection.doc(id) 读取时的 id，可为空
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
 * 读取用户文档：优先 doc(openid)，再按 openId / _openid 查询（兼容历史数据）
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
 * 云库可接受的 partner 纯对象（整字段替换）。若历史上 partner 存成字符串等，点路径 partner.xxx 会 -502001，故用整对象覆盖。
 * @param {Record<string, unknown>} partnerIn
 */
function buildPartnerPlainObject(partnerIn) {
  const p = partnerIn && typeof partnerIn === 'object' ? partnerIn : {}
  const openId = truncateDbString(p.openId, 128)
  const nickName = truncateDbString(p.nickName, 64) || '未命名'
  /** @type {Record<string, string>} */
  const out = { openId, nickName }
  const av = truncateDbString(p.avatarUrl, 2048)
  const sig = truncateDbString(p.signature, 500)
  if (av) out.avatarUrl = av
  if (sig) out.signature = sig
  return out
}

/**
 * 库里 partner 为 null / 非对象时，云数据库会把「对象写入」拆成 partner.xxx 子路径合并，
 * 从而在 null 上建 avatarUrl 报错：Cannot create field 'avatarUrl' in element {partner: null}。
 * 需先 remove 该字段再整体写入对象。
 * @param {Record<string, unknown>} userDoc
 */
function userDocPartnerNeedsUnsetBeforeSet(userDoc) {
  if (!userDoc || typeof userDoc !== 'object') return true
  const p = userDoc.partner
  if (p === null || p === undefined) return true
  if (typeof p !== 'object' || Array.isArray(p)) return true
  return false
}

/**
 * document.update 失败且为 -502001 时，尝试 where(_id) 更新（规避个别 docId 在 SDK 路径上的异常）。
 * @param {import('wx-server-sdk').DB.CollectionReference} users
 * @param {string} docId
 * @param {Record<string, unknown>} data
 */
async function usersDocUpdateTry(users, docId, data) {
  try {
    await users.doc(docId).update({ data })
    return
  } catch (e) {
    if (!e || e.errCode !== -502001) throw e
    console.error('users.doc update -502001, retry where(_id)', docId, e.errMsg, e)
    const res = await users.where({ _id: docId }).limit(1).update({ data })
    const n = res && res.stats ? Number(res.stats.updated) || 0 : 0
    if (n < 1) throw e
  }
}

/**
 * 对已读出的 users 文档执行 update。必须用文档真实 _id；设置 partner 时用整对象覆盖（非点路径）。
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
  /** @type {Record<string, unknown>} */
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
      const pt = buildPartnerPlainObject(/** @type {Record<string, unknown>} */ (dataPatch.partner))
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
    console.error(
      'applyUserPartnerPatchForDoc',
      docId,
      Object.keys(data),
      e && e.errCode,
      e && e.errMsg,
      e,
    )
    throw e
  }
}

/** 将数据库写入错误转为用户可读短句（云函数日志中仍有完整 err） */
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

/**
 * @param {{
 *   action?: string,
 *   nickName?: string,
 *   signature?: string,
 *   avatarUrl?: string,
 *   preferences?: Record<string, unknown>,
 *   bindCode?: string,
 *   requestId?: string,
 *   accept?: boolean,
 *   fileIDs?: string[],
 *   togetherSinceMs?: number | string,
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
  const bindReq = db.collection(BIND_REQUESTS)

  try {
    /**
     * 小程序端 getTempFileURL 受云存储「仅创建者可读」限制，读对方 avatars 会 STORAGE_EXCEED_AUTHORITY。
     * 云函数侧换取临时 HTTPS，仅允许本项目头像路径 avatars/，避免任意 fileID 探测。
     */
    if (event.action === 'getTempFileURLs') {
      const capped = cappedUniqueAvatarFileIds(event.fileIDs)
      if (capped.length === 0) {
        return { ok: true, urls: {} }
      }
      try {
        const r = await cloud.getTempFileURL({ fileList: capped })
        /** @type {Record<string, string>} */
        const urls = {}
        for (const it of r.fileList || []) {
          if (it.fileID && it.status === 0 && typeof it.tempFileURL === 'string' && it.tempFileURL) {
            urls[it.fileID] = it.tempFileURL
          }
        }
        return { ok: true, urls }
      } catch (e) {
        console.error('getTempFileURLs', e)
        return { ok: false, error: '换取展示链接失败' }
      }
    }

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

    if (event.action === 'setTogetherSince') {
      const raw = event.togetherSinceMs
      let since = NaN
      if (typeof raw === 'number' && !Number.isNaN(raw)) {
        since = raw
      } else if (typeof raw === 'string') {
        since = parseInt(raw.trim(), 10)
      }
      if (!Number.isFinite(since)) {
        return { ok: false, error: '时间无效' }
      }
      since = Math.floor(since / 60000) * 60000

      let me
      try {
        me = (await users.doc(OPENID).get()).data
      } catch (e) {
        if (isDocNotFound(e)) return { ok: false, error: '请先完善资料' }
        throw e
      }
      const pidRaw = me && typeof me.partnerOpenId === 'string' ? me.partnerOpenId.trim() : ''
      const rawP = me && me.partner != null && typeof me.partner === 'object' ? me.partner : null
      const pOid =
        rawP && typeof rawP.openId === 'string' && rawP.openId.trim() ? rawP.openId.trim() : ''
      if (!pidRaw || !pOid || pOid !== pidRaw) {
        return { ok: false, error: '仅结伴后可设置' }
      }

      const now = Date.now()
      if (since > now + 120000) {
        return { ok: false, error: '不能选择未来时间' }
      }
      const minMs = new Date(1970, 0, 2).getTime()
      if (since < minMs) {
        return { ok: false, error: '日期太早了' }
      }

      const t = db.serverDate()
      const patch = { togetherSinceMs: since, updatedAt: t }
      await usersDocUpdateTry(users, OPENID, patch)
      await usersDocUpdateTry(users, pidRaw, patch)

      const saved = await users.doc(OPENID).get()
      const user = toPublicUser(saved.data, OPENID)
      if (!user) {
        return { ok: false, error: '写入后读取用户失败' }
      }
      return { ok: true, user }
    }

    if (event.action === 'getPartnerPanel') {
      const ensured = await ensureUserBindCode(db, users, OPENID)
      if (!ensured.ok) {
        return { ok: false, error: ensured.error || '无法获取绑定码' }
      }
      const user = toPublicUser(ensured.userDoc, OPENID)
      if (!user) {
        return { ok: false, error: '读取用户失败' }
      }

      let outboundPending = null
      try {
        const outPending = await bindReq.where({ fromOpenId: OPENID, status: 'pending' }).limit(1).get()
        if (outPending.data.length > 0) {
          const row = outPending.data[0]
          outboundPending = {
            id: row._id,
            toNickName: typeof row.toNickName === 'string' ? row.toNickName : '对方',
            ...(typeof row.toAvatarUrl === 'string' && row.toAvatarUrl ? { toAvatarUrl: row.toAvatarUrl } : {}),
            timeLabel: formatRequestTimeLabel(row.createdAt),
          }
        }
      } catch (e) {
        if (!isBindCollectionMissing(e)) throw e
      }

      let inbound = []
      try {
        const inRes = await bindReq.where({ toOpenId: OPENID, status: 'pending' }).limit(20).get()
        inbound = inRes.data
          .slice()
          .sort((a, b) => {
            const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0
            const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0
            return tb - ta
          })
          .map((row) => ({
            id: row._id,
            fromOpenId: typeof row.fromOpenId === 'string' ? row.fromOpenId : '',
            fromNickName: typeof row.fromNickName === 'string' ? row.fromNickName : '用户',
            ...(typeof row.fromAvatarUrl === 'string' && row.fromAvatarUrl ? { fromAvatarUrl: row.fromAvatarUrl } : {}),
            timeLabel: formatRequestTimeLabel(row.createdAt),
          }))
      } catch (e) {
        if (!isBindCollectionMissing(e)) throw e
      }

      return {
        ok: true,
        user,
        myBindCode: ensured.bindCode,
        outboundPending,
        inbound,
      }
    }

    if (event.action === 'requestBind') {
      const code = normalizeBindCodeInput(typeof event.bindCode === 'string' ? event.bindCode : '')
      if (code.length < 6) {
        return { ok: false, error: '请输入对方绑定码' }
      }

      let me
      try {
        me = (await users.doc(OPENID).get()).data
      } catch (e) {
        if (isDocNotFound(e)) return { ok: false, error: '请先完善资料' }
        throw e
      }
      if (me.partnerOpenId) {
        return { ok: false, error: '你已有对象，无法发起申请' }
      }

      let pendingOutTotal = 0
      try {
        pendingOutTotal = (await bindReq.where({ fromOpenId: OPENID, status: 'pending' }).count()).total
      } catch (e) {
        if (!isBindCollectionMissing(e)) throw e
      }
      if (pendingOutTotal > 0) {
        return { ok: false, error: '你已发出待处理的申请，请等待对方回复' }
      }

      const hit = await users.where({ bindCode: code }).limit(2).get()
      if (hit.data.length === 0) {
        return { ok: false, error: '未找到该绑定码' }
      }
      if (hit.data.length > 1) {
        return { ok: false, error: '绑定码异常，请联系管理员' }
      }
      const target = hit.data[0]
      const targetOpenId = typeof target.openId === 'string' ? target.openId : ''
      if (!targetOpenId || targetOpenId === OPENID) {
        return { ok: false, error: '不能向自己发起绑定' }
      }
      if (target.partnerOpenId) {
        return { ok: false, error: '对方已有对象，暂时无法接收申请' }
      }

      let dupTotal = 0
      try {
        dupTotal = (
          await bindReq.where({ fromOpenId: OPENID, toOpenId: targetOpenId, status: 'pending' }).count()
        ).total
      } catch (e) {
        if (!isBindCollectionMissing(e)) throw e
      }
      if (dupTotal > 0) {
        return { ok: false, error: '已向对方发送过申请' }
      }

      const fromNickName = typeof me.nickName === 'string' ? me.nickName : ''
      const fromAvatarUrl = typeof me.avatarUrl === 'string' ? me.avatarUrl : ''
      const toNickName = typeof target.nickName === 'string' ? target.nickName : ''
      const toAvatarUrl = typeof target.avatarUrl === 'string' ? target.avatarUrl : ''

      await bindReq.add({
        data: {
          fromOpenId: OPENID,
          toOpenId: targetOpenId,
          fromNickName: fromNickName || '未命名',
          fromAvatarUrl,
          toNickName: toNickName || '未命名',
          toAvatarUrl,
          status: 'pending',
          createdAt: db.serverDate(),
        },
      })

      return { ok: true }
    }

    if (event.action === 'respondBind') {
      const requestId = typeof event.requestId === 'string' ? event.requestId.trim() : ''
      const accept = event.accept === true
      if (!requestId) {
        return { ok: false, error: '缺少申请' }
      }

      let row
      try {
        row = (await bindReq.doc(requestId).get()).data
      } catch (e) {
        if (isBindCollectionMissing(e)) {
          return { ok: false, error: '绑定数据表尚未就绪，请对方先发一次申请或稍后再试' }
        }
        if (isDocNotFound(e)) return { ok: false, error: '申请不存在或已失效' }
        throw e
      }
      if (row.status !== 'pending') {
        return { ok: false, error: '该申请已处理' }
      }
      if (row.toOpenId !== OPENID) {
        return { ok: false, error: '无权处理该申请' }
      }

      const fromIdRaw = typeof row.fromOpenId === 'string' ? row.fromOpenId : ''
      const fromId = fromIdRaw.trim()
      if (!fromId) {
        return { ok: false, error: '申请数据无效' }
      }

      if (!accept) {
        try {
          await bindReq.doc(requestId).update({
            data: { status: 'rejected', respondedAt: db.serverDate() },
          })
        } catch (e) {
          console.error('respondBind reject update', requestId, e)
          return { ok: false, error: '拒绝失败，请稍后重试' }
        }
        return { ok: true }
      }

      let fromDoc
      let toDoc
      try {
        fromDoc = await getUserDocData(users, fromId)
        toDoc = await getUserDocData(users, OPENID)
      } catch (e) {
        console.error('respondBind getUserDocData', e)
        return { ok: false, error: '读取用户资料失败' }
      }
      if (!fromDoc || !toDoc) {
        return { ok: false, error: '用户资料不存在' }
      }
      if (fromDoc.partnerOpenId || toDoc.partnerOpenId) {
        try {
          await bindReq.doc(requestId).update({
            data: { status: 'voided', closedAt: db.serverDate() },
          })
        } catch (e) {
          console.error('respondBind void stale request', requestId, e)
        }
        return { ok: false, error: '对方状态已变化，无法接受' }
      }

      const pForReceiver = partnerSnapshotFromUserDoc(fromDoc)
      const pForSender = partnerSnapshotFromUserDoc(toDoc)
      if (!pForReceiver || !pForSender) {
        return { ok: false, error: '资料不完整，无法接受' }
      }

      let pR
      let pS
      try {
        pR = cloneForDb(pForReceiver)
        pS = cloneForDb(pForSender)
      } catch {
        return { ok: false, error: '资料序列化失败' }
      }

      try {
        await applyUserPartnerPatchForDoc(db, users, fromDoc, {
          partnerOpenId: OPENID,
          partner: pS,
          updatedAt: db.serverDate(),
        })
      } catch (e) {
        console.error('respondBind applyUserPartnerPatchForDoc applicant', fromDoc && fromDoc._id, fromId, e)
        return { ok: false, error: humanizeUserDbWriteError(e, '写入对方资料') }
      }

      try {
        await applyUserPartnerPatchForDoc(db, users, toDoc, {
          partnerOpenId: fromId,
          partner: pR,
          updatedAt: db.serverDate(),
        })
      } catch (e) {
        console.error('respondBind applyUserPartnerPatchForDoc self', toDoc && toDoc._id, OPENID, e)
        try {
          await applyUserPartnerPatchForDoc(db, users, fromDoc, {
            partnerOpenId: null,
            partner: null,
            updatedAt: db.serverDate(),
          })
        } catch (e2) {
          console.error('respondBind rollback applicant failed', fromId, e2)
        }
        return { ok: false, error: humanizeUserDbWriteError(e, '写入本人资料') }
      }

      try {
        await bindReq.doc(requestId).update({
          data: { status: 'accepted', respondedAt: db.serverDate() },
        })
      } catch (e) {
        console.error('respondBind accept mark request', requestId, e)
        try {
          await applyUserPartnerPatchForDoc(db, users, fromDoc, {
            partnerOpenId: null,
            partner: null,
            updatedAt: db.serverDate(),
          })
        } catch (e2) {
          console.error('respondBind rollback applicant after accept mark fail', e2)
        }
        try {
          await applyUserPartnerPatchForDoc(db, users, toDoc, {
            partnerOpenId: null,
            partner: null,
            updatedAt: db.serverDate(),
          })
        } catch (e3) {
          console.error('respondBind rollback self after accept mark fail', e3)
        }
        return { ok: false, error: '更新申请状态失败，请稍后重试' }
      }

      await voidPendingBindRequestsForPair(db, bindReq, fromId, OPENID)

      try {
        await clearTogetherSinceForPair(users, db, fromDoc, toDoc)
      } catch (eClear) {
        console.error('respondBind clearTogetherSince', eClear)
      }

      return { ok: true }
    }

    return { ok: false, error: '未知 action' }
  } catch (err) {
    const msg = err && err.message ? String(err.message) : String(err.errMsg || '服务器错误')
    console.error('user', msg, err)
    return { ok: false, error: msg }
  }
}
