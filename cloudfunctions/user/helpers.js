const { partnerIdOf, decidePair } = require('./pair-decision')

const USERS = 'users'
const LEGACY_USERS = 'legacy_users'

function isDocNotFound(err) {
  if (!err) return false
  const code = err.errCode
  const msg = String(err.errMsg || err.message || '')
  return (
    code === -502003 ||
    code === -502005 ||
    msg.indexOf('does not exist') >= 0 ||
    msg.indexOf('不存在') >= 0 ||
    msg.indexOf('cannot find document') >= 0
  )
}

function isCollectionMissing(err) {
  if (!err) return false
  const msg = String(err.errMsg || err.message || '').toLowerCase()
  if (msg.indexOf('database_collection_not_exist') >= 0) return true
  if (msg.indexOf('db or table not exist') >= 0) return true
  if (msg.indexOf('collection not exist') >= 0) return true
  if (msg.indexOf('collection_not_exists') >= 0) return true
  return false
}

function cleanText(value, max) {
  if (typeof value !== 'string') return ''
  const stripped = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim()
  return stripped.length > max ? stripped.slice(0, max) : stripped
}

function withId(data, fallback) {
  if (!data || typeof data !== 'object') return null
  const copy = Object.assign({}, data)
  if (copy._id == null || copy._id === '') {
    if (fallback) copy._id = fallback
  } else {
    copy._id = String(copy._id)
  }
  return copy
}

function docIdOf(doc) {
  if (!doc || doc._id == null) return ''
  return String(doc._id)
}

function openIdOf(doc) {
  if (!doc || typeof doc !== 'object') return ''
  if (typeof doc.openId === 'string' && doc.openId.trim()) return doc.openId.trim()
  return docIdOf(doc)
}

async function getUserDoc(usersCol, openId) {
  const id = typeof openId === 'string' ? openId.trim() : ''
  if (!id) return null
  try {
    const got = await usersCol.doc(id).get()
    if (got && got.data) return withId(got.data, id)
  } catch (err) {
    if (isCollectionMissing(err)) return null
    if (!isDocNotFound(err)) throw err
  }
  try {
    const queried = await usersCol.where({ openId: id }).limit(1).get()
    if (queried.data && queried.data[0]) return withId(queried.data[0], '')
  } catch (err) {
    if (isCollectionMissing(err)) return null
    throw err
  }
  return null
}

async function readLegacyUser(db, openId) {
  const col = db.collection(LEGACY_USERS)
  try {
    const got = await col.doc(openId).get()
    if (got && got.data) return got.data
  } catch (err) {
    if (isCollectionMissing(err)) return null
    if (!isDocNotFound(err)) throw err
  }
  try {
    const queried = await col.where({ openId: openId }).limit(1).get()
    if (queried.data && queried.data[0]) return queried.data[0]
    return null
  } catch (err) {
    if (isCollectionMissing(err) || isDocNotFound(err)) return null
    throw err
  }
}

function legacyPartnerId(doc) {
  if (!doc || typeof doc !== 'object') return ''
  if (typeof doc.partnerOpenId === 'string' && doc.partnerOpenId.trim()) {
    return doc.partnerOpenId.trim()
  }
  if (doc.partner && typeof doc.partner === 'object' && typeof doc.partner.openId === 'string') {
    return doc.partner.openId.trim()
  }
  return ''
}

function snapshotOf(doc, openIdFallback) {
  const openId = openIdOf(doc) || openIdFallback || ''
  const nick = cleanText(doc && doc.nickName, 32)
  const avatar = doc && typeof doc.avatarUrl === 'string' ? doc.avatarUrl.slice(0, 2048) : ''
  return {
    openId: openId,
    nickName: nick || '未命名',
    avatarUrl: avatar,
  }
}

async function txGet(transaction, id) {
  try {
    const got = await transaction.collection(USERS).doc(id).get()
    if (got && got.data) return withId(got.data, id)
    return null
  } catch (err) {
    if (isDocNotFound(err)) return null
    throw err
  }
}

/**
 * 把 legacy_users 里的一对 openId 写进 users。已有且互指则不动。
 * 任一方已和别人结伴则跳过，不覆盖。
 */
async function adoptLegacyPair(db, usersCol, meDoc) {
  const meOpenId = openIdOf(meDoc)
  if (!meOpenId) return meDoc
  const current = partnerIdOf(meDoc)
  if (current) {
    const linked = await getUserDoc(usersCol, current)
    if (linked && partnerIdOf(linked) === meOpenId) return meDoc
  }
  const legacy = await readLegacyUser(db, meOpenId)
  const want = current || legacyPartnerId(legacy)
  if (!want || want === meOpenId) return meDoc

  const legacyOther = await readLegacyUser(db, want)
  const transaction = await db.startTransaction()
  try {
    const meId = docIdOf(meDoc) || meOpenId
    const meFresh = await txGet(transaction, meId)
    if (!meFresh) {
      await transaction.rollback()
      return meDoc
    }
    let otherFresh = await txGet(transaction, want)
    const decision = decidePair(
      meOpenId,
      partnerIdOf(meFresh),
      want,
      otherFresh ? partnerIdOf(otherFresh) : '',
    )
    if (decision === 'already') {
      await transaction.commit()
      return getUserDoc(usersCol, meOpenId)
    }
    if (decision === 'blocked-me' || decision === 'blocked-other' || decision === 'invalid') {
      await transaction.rollback()
      return meFresh
    }

    let otherNick = '伴侣'
    let otherAvatar = ''
    if (otherFresh) {
      otherNick = cleanText(otherFresh.nickName, 32) || '伴侣'
      otherAvatar = typeof otherFresh.avatarUrl === 'string' ? otherFresh.avatarUrl : ''
    } else if (legacyOther) {
      otherNick = cleanText(legacyOther.nickName, 32) || '伴侣'
      otherAvatar = typeof legacyOther.avatarUrl === 'string' ? legacyOther.avatarUrl : ''
    } else if (legacy && legacy.partner && typeof legacy.partner === 'object') {
      otherNick = cleanText(legacy.partner.nickName, 32) || '伴侣'
      otherAvatar = typeof legacy.partner.avatarUrl === 'string' ? legacy.partner.avatarUrl : ''
    }
    const now = db.serverDate()
    const meSnap = snapshotOf(meFresh, meOpenId)
    const otherSnap = { openId: want, nickName: otherNick, avatarUrl: otherAvatar }
    const col = transaction.collection(USERS)

    if (decision === 'link' || decision === 'repair-me') {
      await col.doc(meId).update({
        data: {
          partnerOpenId: want,
          partner: otherSnap,
          legacyPairedAt: now,
          updatedAt: now,
        },
      })
    }
    if (decision === 'link' || decision === 'repair-other') {
      if (!otherFresh) {
        await col.doc(want).set({
          data: {
            openId: want,
            _openid: want,
            nickName: otherNick === '伴侣' ? '' : otherNick,
            avatarUrl: otherAvatar,
            partnerOpenId: meOpenId,
            partner: meSnap,
            createdAt: now,
            updatedAt: now,
            legacyImportedAt: now,
            legacyPairedAt: now,
          },
        })
      } else {
        await col.doc(docIdOf(otherFresh) || want).update({
          data: {
            partnerOpenId: meOpenId,
            partner: meSnap,
            legacyPairedAt: now,
            updatedAt: now,
          },
        })
      }
    }
    await transaction.commit()
  } catch (err) {
    try {
      await transaction.rollback()
    } catch (rollbackErr) {
      console.error('adoptLegacyPair rollback', rollbackErr)
    }
    console.error('adoptLegacyPair', meOpenId, err)
    return meDoc
  }
  const again = await getUserDoc(usersCol, meOpenId)
  return again || meDoc
}

async function ensureUserFromLegacy(db, usersCol, openId) {
  let doc = null
  try {
    doc = await getUserDoc(usersCol, openId)
  } catch (err) {
    if (!isCollectionMissing(err)) throw err
  }
  if (!doc) {
    const legacy = await readLegacyUser(db, openId)
    if (!legacy) return null
    const now = db.serverDate()
    await usersCol.doc(openId).set({
      data: {
        openId: openId,
        _openid: openId,
        nickName: cleanText(legacy.nickName, 32),
        avatarUrl: typeof legacy.avatarUrl === 'string' ? legacy.avatarUrl.slice(0, 2048) : '',
        partnerOpenId: null,
        partner: null,
        createdAt: now,
        updatedAt: now,
        legacyImportedAt: now,
      },
    })
    doc = await getUserDoc(usersCol, openId)
  }
  if (!doc) return null
  return adoptLegacyPair(db, usersCol, doc)
}

function isCloudFile(value) {
  return typeof value === 'string' && value.indexOf('cloud://') === 0
}

async function tempUrlMap(cloud, fileIDs) {
  const ids = []
  const seen = {}
  for (let i = 0; i < fileIDs.length; i++) {
    const id = fileIDs[i]
    if (!isCloudFile(id) || seen[id]) continue
    seen[id] = true
    ids.push(id)
  }
  const urls = {}
  for (let offset = 0; offset < ids.length; offset += 50) {
    const batch = ids.slice(offset, offset + 50)
    if (batch.length === 0) continue
    try {
      const res = await cloud.getTempFileURL({ fileList: batch })
      const list = res && res.fileList ? res.fileList : []
      for (let i = 0; i < list.length; i++) {
        const item = list[i]
        if (item && item.fileID && item.status === 0 && typeof item.tempFileURL === 'string' && item.tempFileURL) {
          urls[item.fileID] = item.tempFileURL
        }
      }
    } catch (err) {
      console.error('tempUrlMap', err)
    }
  }
  return urls
}

async function toPublicUser(usersCol, cloud, doc) {
  if (!doc) return null
  const openId = openIdOf(doc)
  if (!openId) return null
  let partner = null
  const pid = partnerIdOf(doc)
  if (pid) {
    const partnerDoc = await getUserDoc(usersCol, pid)
    if (partnerDoc) {
      partner = snapshotOf(partnerDoc, pid)
    } else if (doc.partner && typeof doc.partner === 'object') {
      partner = snapshotOf(doc.partner, pid)
      partner.openId = pid
    } else {
      partner = { openId: pid, nickName: '伴侣', avatarUrl: '' }
    }
  }
  const fileIDs = []
  if (isCloudFile(doc.avatarUrl)) fileIDs.push(doc.avatarUrl)
  if (partner && isCloudFile(partner.avatarUrl)) fileIDs.push(partner.avatarUrl)
  const urls = await tempUrlMap(cloud, fileIDs)
  const avatarUrl = typeof doc.avatarUrl === 'string' ? doc.avatarUrl : ''
  return {
    openId: openId,
    nickName: cleanText(doc.nickName, 32),
    avatarUrl: avatarUrl,
    avatarDisplay: urls[avatarUrl] || '',
    partnerOpenId: pid || null,
    partner: partner
      ? {
          openId: partner.openId,
          nickName: partner.nickName,
          avatarUrl: partner.avatarUrl,
          avatarDisplay: urls[partner.avatarUrl] || '',
        }
      : null,
    paired: !!pid,
  }
}

function randomInviteCode() {
  const n = Math.floor(Math.random() * 1000000)
  const raw = String(n)
  return raw.length >= 6 ? raw : '000000'.slice(raw.length) + raw
}

async function assignInviteCode(db, usersCol, doc) {
  const id = docIdOf(doc)
  if (!id) return ''
  for (let attempt = 0; attempt < 16; attempt++) {
    const code = randomInviteCode()
    const hit = await usersCol.where({ inviteCode: code }).limit(1).get()
    if (hit.data && hit.data.length > 0) continue
    await usersCol.doc(id).update({
      data: { inviteCode: code, updatedAt: db.serverDate() },
    })
    return code
  }
  return ''
}

async function applyPair(db, usersCol, meOpenId, otherOpenId) {
  if (!meOpenId || !otherOpenId || meOpenId === otherOpenId) {
    return { ok: false, error: '不能和自己结伴' }
  }
  const transaction = await db.startTransaction()
  try {
    const me = await txGet(transaction, meOpenId)
    const other = await txGet(transaction, otherOpenId)
    if (!me || !other) {
      await transaction.rollback()
      return { ok: false, error: '没有找到对方' }
    }
    const decision = decidePair(openIdOf(me), partnerIdOf(me), openIdOf(other), partnerIdOf(other))
    if (decision === 'already') {
      await transaction.commit()
      return { ok: true }
    }
    if (decision === 'blocked-me') {
      await transaction.rollback()
      return { ok: false, error: '你已结伴' }
    }
    if (decision === 'blocked-other' || decision === 'invalid') {
      await transaction.rollback()
      return { ok: false, error: '对方已结伴' }
    }
    const now = db.serverDate()
    const col = transaction.collection(USERS)
    const meSnap = snapshotOf(me, meOpenId)
    const otherSnap = snapshotOf(other, otherOpenId)
    if (decision === 'link' || decision === 'repair-me') {
      await col.doc(docIdOf(me)).update({
        data: { partnerOpenId: openIdOf(other), partner: otherSnap, pairedAt: now, updatedAt: now },
      })
    }
    if (decision === 'link' || decision === 'repair-other') {
      await col.doc(docIdOf(other)).update({
        data: { partnerOpenId: openIdOf(me), partner: meSnap, pairedAt: now, updatedAt: now },
      })
    }
    await transaction.commit()
    return { ok: true }
  } catch (err) {
    try {
      await transaction.rollback()
    } catch (rollbackErr) {
      console.error('applyPair rollback', rollbackErr)
    }
    console.error('applyPair', err)
    return { ok: false, error: '结伴失败，请稍后重试' }
  }
}

function rejectMigrateKey(event) {
  const expected = typeof process.env.MIGRATE_KEY === 'string' ? process.env.MIGRATE_KEY : ''
  const got = event && typeof event.key === 'string' ? event.key : ''
  if (!expected || got !== expected) {
    return { ok: false, error: '请在云函数环境变量设置 MIGRATE_KEY，并传入相同的 key' }
  }
  return null
}

module.exports = {
  USERS,
  LEGACY_USERS,
  isDocNotFound,
  isCollectionMissing,
  cleanText,
  partnerIdOf,
  docIdOf,
  openIdOf,
  getUserDoc,
  readLegacyUser,
  legacyPartnerId,
  ensureUserFromLegacy,
  toPublicUser,
  assignInviteCode,
  applyPair,
  snapshotOf,
  rejectMigrateKey,
  tempUrlMap,
}
