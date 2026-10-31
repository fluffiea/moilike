class AppError extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

const fail = (code, message) => {
  throw new AppError(code, message)
}

/** @param {unknown} v @param {number} max */
function text(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

/** @param {unknown} v */
function id(v) {
  return typeof v === 'string' ? v.trim() : ''
}

/** @param {unknown} v @returns {number} 毫秒时间戳；无效为 0 */
function toMs(v) {
  if (!v) return 0
  const d = v instanceof Date ? v : new Date(/** @type {any} */ (v))
  const t = d.getTime()
  return Number.isNaN(t) ? 0 : t
}

/** @param {unknown} arr @param {number} max */
function cloudFileIds(arr, max) {
  if (!Array.isArray(arr)) return []
  return arr.filter((u) => typeof u === 'string' && u.startsWith('cloud://')).slice(0, max)
}

function isNotFound(err) {
  if (!err) return false
  const msg = String(err.errMsg || err.message || '')
  return (
    err.errCode === -502003 ||
    msg.includes('does not exist') ||
    msg.includes('cannot find document') ||
    msg.includes('不存在')
  )
}

function isCollectionMissing(err) {
  if (!err) return false
  const msg = String(err.errMsg || err.message || '').toLowerCase()
  return (
    err.errCode === -502005 ||
    msg.includes('collection not exist') ||
    msg.includes('database_collection_not_exist') ||
    msg.includes('table not exist')
  )
}

/** 读单个文档；不存在返回 null */
async function getDoc(col, docId) {
  if (!docId) return null
  try {
    const r = await col.doc(docId).get()
    return r.data || null
  } catch (e) {
    if (isNotFound(e)) return null
    throw e
  }
}

module.exports = { AppError, fail, text, id, toMs, cloudFileIds, isNotFound, isCollectionMissing, getDoc }
