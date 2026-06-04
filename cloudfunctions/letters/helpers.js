/**
 * letters 云函数内部辅助模块
 * 从 index.js 抽离，供各个 action 文件使用。
 */

const LETTERS = 'letters'
const PAGE_SIZE = 20
const MAX_TITLE = 200
const MAX_CONTENT = 5000
const MAX_IMAGES = 9

const { formatTime } = require('./common/utils')

/** @param {Record<string, unknown>} doc @param {string} OPENID */
function toPublicLetter(doc, OPENID) {
  const id = doc._id
  const title = typeof doc.title === 'string' ? doc.title.slice(0, MAX_TITLE) : ''
  const content = typeof doc.content === 'string' ? doc.content.slice(0, MAX_CONTENT) : ''
  const type = typeof doc.type === 'string' ? doc.type : 'text'
  const images = Array.isArray(doc.images)
    ? doc.images.filter((u) => typeof u === 'string').slice(0, MAX_IMAGES)
    : []
  const senderId = typeof doc.senderId === 'string' ? doc.senderId : ''
  const receiverId = typeof doc.receiverId === 'string' ? doc.receiverId : ''
  let timeStr = ''
  let createdAtMs = 0
  if (doc.createdAt) {
    const d =
      doc.createdAt instanceof Date
        ? doc.createdAt
        : new Date(doc.createdAt)
    if (!Number.isNaN(d.getTime())) {
      timeStr = formatTime(d)
      createdAtMs = d.getTime()
    }
  }

  return {
    id,
    title,
    content,
    type,
    images,
    senderId,
    receiverId,
    time: timeStr,
    createdAtMs,
    isMine: senderId === OPENID,
  }
}

/**
 * 检查当前用户是否为信件参与者（发送方或接收方）。
 * @param {Record<string, unknown>} doc
 * @param {string} OPENID
 * @returns {boolean}
 */
function isLetterParticipant(doc, OPENID) {
  const sid = typeof doc.senderId === 'string' ? doc.senderId : ''
  const rid = typeof doc.receiverId === 'string' ? doc.receiverId : ''
  return sid === OPENID || rid === OPENID
}

module.exports = {
  LETTERS,
  PAGE_SIZE,
  MAX_TITLE,
  MAX_CONTENT,
  MAX_IMAGES,
  toPublicLetter,
  isLetterParticipant,
}
