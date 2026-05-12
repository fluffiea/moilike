/**
 * report 云函数内部辅助模块
 */

const {
  sanitizeImages,
  getUserDocRow,
  getMutualPartnerOpenId,
  coupleAuthorOpenIds,
  recordTempFileUrlsFromSdk,
} = require('../../common/utils')

const REPORT = 'report_posts'
const USERS = 'users'
const PAGE_SIZE = 10
const MAX_BODY = 2000
const MAX_IMAGES = 9
const MAX_TAGS_PER_POST = 10
const MAX_TAG_LEN = 16
const MAX_USER_CUSTOM_TAGS = 20
const MAX_EVAL_TEXT = 500
const DEFAULT_TAG = '干饭'
const REPORT_STORAGE_PREFIX = '/reports/'

const { formatTime } = require('../../common/utils')

function sanitizeTags(arr) {
  if (!Array.isArray(arr)) return []
  const seen = new Set()
  const out = []
  for (let i = 0; i < arr.length; i++) {
    const raw = arr[i]
    if (typeof raw !== 'string') continue
    const t = raw.trim().slice(0, MAX_TAG_LEN)
    if (!t || seen.has(t)) continue
    seen.add(t)
    out.push(t)
    if (out.length >= MAX_TAGS_PER_POST) break
  }
  return out
}

function nickAvatarForAuthor(row, defaults) {
  let nick = defaults.nick
  let avatar = defaults.avatar
  if (!row || typeof row !== 'object') return { nick, avatar }
  if (typeof row.nickName === 'string') nick = row.nickName
  if (typeof row.avatarUrl === 'string') avatar = row.avatarUrl
  return { nick, avatar }
}

function partnerStateFromDoc(doc) {
  const readAt = doc.partnerReadAt
  const evalAt = doc.partnerEvaluatedAt
  let hasRead = false
  if (readAt instanceof Date && !Number.isNaN(readAt.getTime())) {
    hasRead = true
  } else if (readAt) {
    const d = new Date(readAt)
    if (!Number.isNaN(d.getTime())) hasRead = true
  }
  let hasEval = false
  if (evalAt instanceof Date && !Number.isNaN(evalAt.getTime())) {
    hasEval = true
  } else if (evalAt) {
    const d2 = new Date(evalAt)
    if (!Number.isNaN(d2.getTime())) hasEval = true
  }
  if (!hasRead) return 'pending_read'
  if (!hasEval) return 'read'
  return 'evaluated'
}

function toPublicReport(doc, id, OPENID, partner) {
  const authorOpenId = typeof doc.authorOpenId === 'string' ? doc.authorOpenId.trim() : ''
  const body = typeof doc.body === 'string' ? doc.body.slice(0, MAX_BODY) : ''
  const tags = Array.isArray(doc.tags) ? sanitizeTags(doc.tags) : []
  const images = sanitizeImages(doc.images)
  const authorNickName = typeof doc.authorNickName === 'string' ? doc.authorNickName : ''
  let recordTimeStr = ''
  let recordAtMs = 0
  const ra = doc.recordAt
  if (ra) {
    const d = ra instanceof Date ? ra : new Date(ra)
    if (!Number.isNaN(d.getTime())) {
      recordTimeStr = formatTime(d)
      recordAtMs = d.getTime()
    }
  }
  let publishTimeStr = ''
  const ca = doc.createdAt
  if (ca) {
    const d2 = ca instanceof Date ? ca : new Date(ca)
    if (!Number.isNaN(d2.getTime())) publishTimeStr = formatTime(d2)
  }
  const isMine = authorOpenId === OPENID
  const partnerState = partnerStateFromDoc(doc)
  const evalText =
    typeof doc.partnerEvalText === 'string' ? doc.partnerEvalText.slice(0, MAX_EVAL_TEXT) : ''
  const canMarkRead =
    !isMine && partnerState === 'pending_read' && partner && authorOpenId === partner
  const canEvaluate =
    !isMine && partnerState === 'read' && partner && authorOpenId === partner
  let statusLabel = ''
  if (isMine) {
    if (partnerState === 'pending_read') statusLabel = '待对方阅读'
    else if (partnerState === 'read') statusLabel = '对方已读'
    else statusLabel = '对方已评价'
  } else {
    if (partnerState === 'pending_read') statusLabel = '未阅'
    else if (partnerState === 'read') statusLabel = '已阅'
    else statusLabel = '已评价'
  }
  return {
    id,
    userName: authorNickName || '对方',
    body,
    tags,
    images,
    recordTimeStr,
    recordAtMs,
    publishTimeStr,
    isMine,
    partnerState,
    statusLabel,
    partnerEvalText: evalText,
    canMarkRead,
    canEvaluate,
  }
}

async function getReportDocForViewer(reportCol, usersCol, OPENID, postId) {
  let doc
  try {
    const g = await reportCol.doc(postId).get()
    doc = g.data
  } catch {
    return { ok: false, error: '不存在' }
  }
  if (!doc) return { ok: false, error: '不存在' }
  const partner = await getMutualPartnerOpenId(usersCol, OPENID)
  const authors = coupleAuthorOpenIds(OPENID, partner)
  const aid = typeof doc.authorOpenId === 'string' ? doc.authorOpenId : ''
  if (!authors.includes(aid)) {
    return { ok: false, error: '无权查看' }
  }
  return { ok: true, doc, partner }
}

function mergeDefaultTags(raw) {
  const fromUser = Array.isArray(raw) ? raw : []
  const seen = new Set()
  const out = []
  for (let i = 0; i < fromUser.length; i++) {
    const s = typeof fromUser[i] === 'string' ? fromUser[i].trim().slice(0, MAX_TAG_LEN) : ''
    if (!s || seen.has(s)) continue
    seen.add(s)
    out.push(s)
    if (out.length >= MAX_USER_CUSTOM_TAGS) break
  }
  if (!seen.has(DEFAULT_TAG)) {
    out.unshift(DEFAULT_TAG)
  } else {
    const rest = out.filter((t) => t !== DEFAULT_TAG)
    out.length = 0
    out.push(DEFAULT_TAG, ...rest)
  }
  return out
}

function reportStorageOwnerOpenId(fileId) {
  if (typeof fileId !== 'string' || !fileId.startsWith('cloud://')) return null
  const j = fileId.indexOf(REPORT_STORAGE_PREFIX)
  if (j < 0) return null
  const seg = fileId.slice(j + REPORT_STORAGE_PREFIX.length).split('/')[0] || ''
  const t = seg.trim()
  return t || null
}

function isReportImageFileIdVisibleToCouple(fileId, coupleOpenIdSet) {
  const owner = reportStorageOwnerOpenId(fileId)
  return owner != null && coupleOpenIdSet.has(owner)
}

module.exports = {
  REPORT,
  USERS,
  PAGE_SIZE,
  MAX_BODY,
  MAX_IMAGES,
  MAX_EVAL_TEXT,
  MAX_TAG_LEN,
  MAX_TAGS_PER_POST,
  MAX_USER_CUSTOM_TAGS,
  DEFAULT_TAG,
  sanitizeTags,
  nickAvatarForAuthor,
  partnerStateFromDoc,
  toPublicReport,
  getReportDocForViewer,
  mergeDefaultTags,
  isReportImageFileIdVisibleToCouple,
  recordTempFileUrlsFromSdk,
}
