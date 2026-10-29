const STICKERS = ['好吃！', '想尝一口', '记得按时吃饭', '辛苦啦', '看着眼馋', '抱抱']
const SLOTS = ['breakfast', 'lunch', 'dinner']
const MEALS = 'meals'
const USERS = 'users'
const MAX_TEXT = 200
const MAX_NOTE = 50
const MAX_IMAGES = 9

function isDocNotFound(err) {
  if (!err) return false
  const code = err.errCode
  const msg = String(err.errMsg || err.message || '')
  return (
    code === -502003 ||
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

function toMs(value) {
  if (!value) return 0
  if (value instanceof Date) {
    const t = value.getTime()
    return Number.isNaN(t) ? 0 : t
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? 0 : parsed
  }
  if (typeof value === 'object') {
    if (Object.prototype.hasOwnProperty.call(value, '$date')) return toMs(value.$date)
    if (typeof value.getTime === 'function') return toMs(value.getTime())
  }
  return 0
}

function partnerIdOf(doc) {
  if (!doc || typeof doc !== 'object') return ''
  if (typeof doc.partnerOpenId === 'string' && doc.partnerOpenId.trim()) return doc.partnerOpenId.trim()
  if (doc.partner && typeof doc.partner === 'object' && typeof doc.partner.openId === 'string') {
    return doc.partner.openId.trim()
  }
  return ''
}

async function getUserDoc(usersCol, openId) {
  try {
    const got = await usersCol.doc(openId).get()
    return got && got.data ? got.data : null
  } catch (err) {
    if (isDocNotFound(err) || isCollectionMissing(err)) return null
    throw err
  }
}

async function coupleOf(usersCol, openId) {
  const me = await getUserDoc(usersCol, openId)
  if (!me) return { me: null, partnerId: '', partner: null, mutual: false }
  const partnerId = partnerIdOf(me)
  if (!partnerId) return { me: me, partnerId: '', partner: null, mutual: false }
  const partner = await getUserDoc(usersCol, partnerId)
  const mutual = !!(partner && partnerIdOf(partner) === openId)
  return { me: me, partnerId: partnerId, partner: partner, mutual: mutual }
}

function imageOwned(fileID, openId) {
  return typeof fileID === 'string' && fileID.indexOf('cloud://') === 0 && fileID.indexOf('meals/' + openId + '/') >= 0
}

function sanitizeImages(raw, openId) {
  if (!Array.isArray(raw)) return []
  const out = []
  for (let i = 0; i < raw.length && out.length < MAX_IMAGES; i++) {
    if (imageOwned(raw[i], openId)) out.push(raw[i])
  }
  return out
}

async function tempUrlMap(cloud, fileIDs) {
  const ids = []
  const seen = {}
  for (let i = 0; i < fileIDs.length; i++) {
    const id = fileIDs[i]
    if (typeof id !== 'string' || id.indexOf('cloud://') !== 0 || seen[id]) continue
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
      console.error('meal tempUrlMap', err)
    }
  }
  return urls
}

function responseOf(doc) {
  const raw = doc.response
  if (!raw || typeof raw !== 'object') return null
  const sticker = typeof raw.sticker === 'string' ? raw.sticker : ''
  const note = cleanText(raw.note, MAX_NOTE)
  const updatedAtMs = toMs(raw.updatedAt)
  if (!sticker && !note) return null
  return { sticker: sticker, note: note, updatedAtMs: updatedAtMs }
}

async function toPublicMeal(doc, id, openId, cloud, usersCol) {
  const authorOpenId = typeof doc.authorOpenId === 'string' ? doc.authorOpenId : ''
  const images = Array.isArray(doc.images) ? doc.images.filter((item) => typeof item === 'string') : []
  let authorNickName = typeof doc.authorNickName === 'string' ? doc.authorNickName : ''
  let authorAvatarUrl = typeof doc.authorAvatarUrl === 'string' ? doc.authorAvatarUrl : ''
  const author = await getUserDoc(usersCol, authorOpenId)
  if (author) {
    if (typeof author.nickName === 'string' && author.nickName) authorNickName = author.nickName
    if (typeof author.avatarUrl === 'string') authorAvatarUrl = author.avatarUrl
  }
  const fileIDs = images.slice()
  if (authorAvatarUrl.indexOf('cloud://') === 0) fileIDs.push(authorAvatarUrl)
  const urls = await tempUrlMap(cloud, fileIDs)
  const imageUrls = []
  for (let i = 0; i < images.length; i++) {
    imageUrls.push(urls[images[i]] || '')
  }
  return {
    id: id,
    authorOpenId: authorOpenId,
    authorNickName: authorNickName,
    authorAvatarUrl: authorAvatarUrl,
    authorAvatarDisplay: urls[authorAvatarUrl] || '',
    isMine: authorOpenId === openId,
    text: typeof doc.text === 'string' ? doc.text : '',
    images: images,
    imageUrls: imageUrls,
    slot: doc.slot,
    dayKey: doc.dayKey,
    recordAtMs: toMs(doc.recordAt),
    partnerReadAtMs: toMs(doc.partnerReadAt),
    response: responseOf(doc),
  }
}

async function loadMeal(mealsCol, id) {
  try {
    const got = await mealsCol.doc(id).get()
    if (!got || !got.data) return null
    return got.data
  } catch (err) {
    if (isDocNotFound(err) || isCollectionMissing(err)) return null
    throw err
  }
}

function canView(doc, openId, partnerId, mutual) {
  const author = typeof doc.authorOpenId === 'string' ? doc.authorOpenId : ''
  if (author === openId) return true
  return mutual && author === partnerId
}

module.exports = {
  STICKERS,
  SLOTS,
  MEALS,
  USERS,
  MAX_TEXT,
  MAX_NOTE,
  MAX_IMAGES,
  isDocNotFound,
  isCollectionMissing,
  cleanText,
  toMs,
  partnerIdOf,
  coupleOf,
  sanitizeImages,
  tempUrlMap,
  toPublicMeal,
  loadMeal,
  canView,
}
