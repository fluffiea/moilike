/**
 * 云函数公共工具模块
 * 从 daily / report / user 三个云函数中抽离的共享函数。
 * 使用方式: const { isDocNotFound, getUserDocRow, ... } = require('./common/utils')
 */

const cloud = require('wx-server-sdk')

/** @param {Date} d */
function formatTime(d) {
  const off = 8 * 3600000
  const bj = new Date(d.getTime() + off)
  const m = `${bj.getUTCMonth() + 1}`.padStart(2, '0')
  const day = `${bj.getUTCDate()}`.padStart(2, '0')
  const hh = `${bj.getUTCHours()}`.padStart(2, '0')
  const mm = `${bj.getUTCMinutes()}`.padStart(2, '0')
  return `${m}-${day} ${hh}:${mm}`
}

/**
 * @param {unknown} arr
 * @param {number} max
 */
function sanitizeImages(arr, max = 9) {
  if (!Array.isArray(arr)) return []
  const out = []
  for (const u of arr) {
    if (typeof u === 'string' && u.startsWith('cloud://') && out.length < max) {
      out.push(u)
    }
  }
  return out
}

/**
 * @param {unknown} err
 */
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
 * 读取用户文档：优先 doc(openId)，再按 openId / _openid 查询（兼容历史数据）。
 * 与 user 云函数的 getUserDocData 等价，但不带 withStableUserDocId 包装。
 * @param {import('wx-server-sdk').DB.CollectionReference} users
 * @param {string} openId
 * @returns {Promise<Record<string, unknown>|null>}
 */
async function getUserDocRow(users, openId) {
  const t = typeof openId === 'string' ? openId.trim() : ''
  if (!t) return null
  try {
    const r = await users.doc(t).get()
    return r.data || null
  } catch (e) {
    if (!isDocNotFound(e)) throw e
  }
  const byOpen = await users.where({ openId: t }).limit(1).get()
  if (byOpen.data && byOpen.data[0]) return byOpen.data[0]
  const byOid = await users.where({ _openid: t }).limit(1).get()
  if (byOid.data && byOid.data[0]) return byOid.data[0]
  return null
}

/**
 * 按 openId 去重批量拉 users 文档。
 * @param {import('wx-server-sdk').DB.CollectionReference} usersCol
 * @param {string[]} openIds
 * @returns {Promise<Map<string, Record<string, unknown>|null>>}
 */
async function getUserRowsByOpenIds(usersCol, openIds) {
  const seen = new Set()
  const uniq = []
  for (let i = 0; i < openIds.length; i++) {
    const t = typeof openIds[i] === 'string' ? openIds[i].trim() : ''
    if (!t || seen.has(t)) continue
    seen.add(t)
    uniq.push(t)
  }
  /** @type {Map<string, Record<string, unknown>|null>} */
  const map = new Map()
  for (let i = 0; i < uniq.length; i++) {
    const oid = uniq[i]
    map.set(oid, await getUserDocRow(usersCol, oid))
  }
  return map
}

/**
 * @param {Record<string, unknown>|null|undefined} row
 * @returns {string|null}
 */
function partnerOpenIdFromUserRow(row) {
  if (!row || typeof row !== 'object') return null
  const direct = row.partnerOpenId
  if (typeof direct === 'string') {
    const x = direct.trim()
    if (x) return x
  }
  const p = row.partner
  if (p && typeof p === 'object' && !Array.isArray(p)) {
    const o = p.openId
    if (typeof o === 'string' && o.trim()) return o.trim()
  }
  return null
}

/**
 * 仅当双方互为伴侣时返回对方 openId；否则 null。
 * @param {import('wx-server-sdk').DB.CollectionReference} users
 * @param {string} openId
 * @returns {Promise<string|null>}
 */
async function getMutualPartnerOpenId(users, openId) {
  const me = await getUserDocRow(users, openId)
  const peer = partnerOpenIdFromUserRow(me)
  if (!peer || peer === openId) return null
  const other = await getUserDocRow(users, peer)
  if (!other) return null
  const back = partnerOpenIdFromUserRow(other)
  if (back !== openId) return null
  return peer
}

/**
 * @param {string} openId
 * @param {string|null} partnerOpenId
 * @returns {string[]}
 */
function coupleAuthorOpenIds(openId, partnerOpenId) {
  const ids = new Set([openId])
  if (partnerOpenId && partnerOpenId !== openId) ids.add(partnerOpenId)
  return [...ids]
}

/**
 * @param {Record<string, unknown>[]} fileList
 * @returns {Record<string, string>}
 */
function recordTempFileUrlsFromSdk(fileList) {
  /** @type {Record<string, string>} */
  const urls = {}
  for (const it of fileList || []) {
    if (it.fileID && it.status === 0 && typeof it.tempFileURL === 'string' && it.tempFileURL) {
      urls[it.fileID] = it.tempFileURL
    }
  }
  return urls
}

module.exports = {
  formatTime,
  sanitizeImages,
  isDocNotFound,
  getUserDocRow,
  getUserRowsByOpenIds,
  partnerOpenIdFromUserRow,
  getMutualPartnerOpenId,
  coupleAuthorOpenIds,
  recordTempFileUrlsFromSdk,
}
