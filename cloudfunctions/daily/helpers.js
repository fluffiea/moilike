/**
 * daily 云函数内部辅助模块
 * 从 index.js 抽离，供各个 action 文件使用。
 */

const {
  formatTime,
  getUserDocRow,
  getUserRowsByOpenIds,
  getMutualPartnerOpenId,
  coupleAuthorOpenIds,
} = require('./common/utils')

const DAILY = 'daily_posts'
const DAILY_COMMENTS = 'daily_comments'
const PAGE_SIZE = 5
const MAX_SNIPPET = 2000
const MAX_IMAGES = 9
const MAX_COMMENT_TEXT = 500
const MAX_COMMENT_DEPTH = 1
const MAX_LIST_FIRST_COMMENT_CHARS = 80
const DAILY_STORAGE_PREFIX = '/daily/'

/** @param {Record<string, unknown>} doc @param {string} OPENID */
function toPublicDaily(doc, OPENID) {
  const id = doc._id
  const authorOpenId = typeof doc.authorOpenId === 'string' ? doc.authorOpenId : ''
  const snippet =
    typeof doc.snippet === 'string' ? doc.snippet.slice(0, MAX_SNIPPET) : ''
  const images = Array.isArray(doc.images)
    ? doc.images.filter((u) => typeof u === 'string').slice(0, MAX_IMAGES)
    : []
  const authorNickName = typeof doc.authorNickName === 'string' ? doc.authorNickName : ''
  const authorAvatarUrl = typeof doc.authorAvatarUrl === 'string' ? doc.authorAvatarUrl : ''
  let timeStr = ''
  if (doc.createdAt) {
    const d =
      doc.createdAt instanceof Date
        ? doc.createdAt
        : new Date(doc.createdAt)
    if (!Number.isNaN(d.getTime())) {
      timeStr = formatTime(d)
    }
  }
  const tones = ['mist', 'dew', 'bloom', 'meadow']
  const toneIdx =
    authorOpenId.length > 0
      ? authorOpenId.charCodeAt(authorOpenId.length - 1) % 4
      : 0
  const avatarTone = authorAvatarUrl ? undefined : tones[toneIdx]

  const row = {
    id,
    snippet,
    images,
    userName: authorNickName || '对方',
    avatarUrl: authorAvatarUrl || '',
    time: timeStr,
    isMine: authorOpenId === OPENID,
  }
  if (avatarTone) {
    row.avatarTone = avatarTone
  }
  if (images.length === 1) {
    row.imageLayout = 'normal'
  }
  return row
}

/** @param {Record<string, unknown>} doc @param {string} OPENID */
function toPublicComment(doc, OPENID) {
  const id = doc._id
  const authorOpenId = typeof doc.authorOpenId === 'string' ? doc.authorOpenId : ''
  const authorNickName = typeof doc.authorNickName === 'string' ? doc.authorNickName : ''
  const text =
    typeof doc.text === 'string' ? doc.text.slice(0, MAX_COMMENT_TEXT) : ''
  const parentId = typeof doc.parentId === 'string' && doc.parentId ? doc.parentId : ''
  let d = 0
  if (typeof doc.depth === 'number' && !Number.isNaN(doc.depth)) {
    d = Math.floor(doc.depth)
    if (d < 0) d = 0
    if (d > MAX_COMMENT_DEPTH) d = MAX_COMMENT_DEPTH
  }
  const depth = d
  let timeStr = ''
  if (doc.createdAt) {
    const d =
      doc.createdAt instanceof Date ? doc.createdAt : new Date(doc.createdAt)
    if (!Number.isNaN(d.getTime())) {
      timeStr = formatTime(d)
    }
  }
  return {
    id,
    userName: authorNickName || '对方',
    text,
    parentId,
    depth,
    time: timeStr,
    isMine: authorOpenId === OPENID,
  }
}

/**
 * 单条日常：存在且当前用户与作者在同一「情侣可见」集合内。
 * @param {import('wx-server-sdk').DB.CollectionReference} dailyCol
 * @param {import('wx-server-sdk').DB.CollectionReference} usersCol
 * @param {string} OPENID
 * @param {string} postId
 * @returns {Promise<{ ok: true, doc: Record<string, unknown> } | { ok: false, error: string }>}
 */
async function getDailyPostDocForViewer(dailyCol, usersCol, OPENID, postId) {
  let doc
  try {
    const g = await dailyCol.doc(postId).get()
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
  return { ok: true, doc }
}

/**
 * @param {Record<string, unknown>|null|undefined} userRow
 * @param {Record<string, unknown>} doc
 * @returns {{ authorNickName: string, authorAvatarUrl: string }}
 */
function viewerDailyAuthorFromUser(userRow, doc) {
  const sn = typeof doc.authorNickName === 'string' ? doc.authorNickName : ''
  const sa = typeof doc.authorAvatarUrl === 'string' ? doc.authorAvatarUrl : ''
  if (!userRow || typeof userRow !== 'object') {
    return { authorNickName: sn, authorAvatarUrl: sa }
  }
  let authorNickName = sn
  if (typeof userRow.nickName === 'string') {
    const t = userRow.nickName.trim()
    if (t) authorNickName = t
  }
  let authorAvatarUrl = sa
  if (typeof userRow.avatarUrl === 'string') {
    authorAvatarUrl = userRow.avatarUrl.trim()
  }
  return { authorNickName, authorAvatarUrl }
}

/**
 * 单条文档 + users 展示字段 → toPublicDaily
 * @returns {Promise<{ ok: true, post: Record<string, unknown> } | { ok: false, error: string }>}
 */
async function buildPublicDailyForViewer(dailyCol, usersCol, OPENID, id) {
  const vr = await getDailyPostDocForViewer(dailyCol, usersCol, OPENID, id)
  if (!vr.ok) return vr
  const doc = vr.doc
  const aid = typeof doc.authorOpenId === 'string' ? doc.authorOpenId.trim() : ''
  const row = aid ? await getUserDocRow(usersCol, aid) : null
  const fields = viewerDailyAuthorFromUser(row, doc)
  return { ok: true, post: toPublicDaily({ ...doc, ...fields, _id: id }, OPENID) }
}

/**
 * @param {Record<string, unknown>|null|undefined} row
 * @param {{ nick: string, avatar: string }} defaults
 */
function nickAvatarForDailyAuthor(row, defaults) {
  let nick = defaults.nick
  let avatar = defaults.avatar
  if (!row || typeof row !== 'object') return { nick, avatar }
  if (typeof row.nickName === 'string') nick = row.nickName
  if (typeof row.avatarUrl === 'string') avatar = row.avatarUrl
  return { nick, avatar }
}

/** @param {import('wx-server-sdk').DB.CollectionReference} commentsCol */
async function countDirectReplies(commentsCol, postId, commentId) {
  const r = await commentsCol
    .where({ dailyPostId: postId, parentId: commentId })
    .count()
  return typeof r.total === 'number' ? r.total : 0
}

/** @param {Record<string, unknown>} c */
function commentCreatedMs(c) {
  if (!c || !c.createdAt) return 0
  const d = c.createdAt instanceof Date ? c.createdAt : new Date(c.createdAt)
  const t = d.getTime()
  return Number.isNaN(t) ? 0 : t
}

/** @param {Record<string, unknown>} post */
function stripCommentPreviewFromPost(post) {
  const next = { ...post }
  delete next.commentCount
  delete next.firstCommentUserName
  delete next.firstCommentText
  return next
}

/** @param {Record<string, unknown>} post @param {Record<string, unknown>[]} sorted @param {Map<string, Record<string, unknown>>} userMap */
function mergeCommentPreviewFromSorted(post, sorted, userMap) {
  const first = sorted[0]
  const count = sorted.length
  const oid = typeof first.authorOpenId === 'string' ? first.authorOpenId.trim() : ''
  const row = oid ? userMap.get(oid) : null
  let userName = typeof first.authorNickName === 'string' ? first.authorNickName : ''
  if (row && typeof row.nickName === 'string') {
    const nick = row.nickName.trim()
    if (nick) userName = nick
  }
  let previewText = typeof first.text === 'string' ? first.text : ''
  if (previewText.length > MAX_LIST_FIRST_COMMENT_CHARS) {
    previewText = previewText.slice(0, MAX_LIST_FIRST_COMMENT_CHARS)
  }
  return {
    ...post,
    commentCount: count,
    firstCommentUserName: userName || '对方',
    firstCommentText: previewText,
  }
}

/** @param {import('wx-server-sdk').DB.Database} db @param {import('wx-server-sdk').DB.Command} _ @param {import('wx-server-sdk').DB.CollectionReference} usersCol @param {Record<string, unknown>[]} list */
async function attachDailyListCommentSummaries(db, _, usersCol, list) {
  if (!list || list.length === 0) return list
  const postIds = list.map((p) => (typeof p.id === 'string' ? p.id : '')).filter((id) => id)
  if (postIds.length === 0) return list
  const postIdSet = new Set(postIds)
  const commentsCol = db.collection(DAILY_COMMENTS)
  let res
  try {
    res = await commentsCol
      .where({ dailyPostId: _.in(postIds) })
      .limit(1000)
      .get()
  } catch (e) {
    console.error('attachDailyListCommentSummaries', e)
    return list
  }
  const raw = res.data || []
  /** @type {Map<string, Record<string, unknown>[]>} */
  const byPost = new Map()
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]
    const pid = typeof c.dailyPostId === 'string' ? c.dailyPostId : ''
    if (!pid || !postIdSet.has(pid)) continue
    if (!byPost.has(pid)) byPost.set(pid, [])
    byPost.get(pid).push(c)
  }
  const firstOids = []
  for (let pi = 0; pi < postIds.length; pi++) {
    const pid = postIds[pi]
    const arr = byPost.get(pid)
    if (!arr || arr.length === 0) continue
    const sorted = [...arr].sort((a, b) => commentCreatedMs(a) - commentCreatedMs(b))
    byPost.set(pid, sorted)
    const doc0 = sorted[0]
    const oid = typeof doc0.authorOpenId === 'string' ? doc0.authorOpenId.trim() : ''
    if (oid) firstOids.push(oid)
  }
  const userMap = await getUserRowsByOpenIds(usersCol, firstOids)
  return list.map((post) => {
    const pid = typeof post.id === 'string' ? post.id : ''
    const sorted = pid ? byPost.get(pid) : null
    if (!sorted || sorted.length === 0) return post
    return mergeCommentPreviewFromSorted(post, sorted, userMap)
  })
}

/** @param {import('wx-server-sdk').DB.Database} db @param {import('wx-server-sdk').DB.Command} _ @param {import('wx-server-sdk').DB.CollectionReference} usersCol @param {Record<string, unknown>} post */
async function attachOnePostCommentSummary(db, _, usersCol, post) {
  const pid = typeof post.id === 'string' ? post.id : ''
  if (!pid) return post
  const commentsCol = db.collection(DAILY_COMMENTS)
  let res
  try {
    res = await commentsCol.where({ dailyPostId: pid }).limit(1000).get()
  } catch (e) {
    console.error('attachOnePostCommentSummary', e)
    return post
  }
  const raw = res.data || []
  if (raw.length === 0) return stripCommentPreviewFromPost(post)
  const sorted = [...raw].sort((a, b) => commentCreatedMs(a) - commentCreatedMs(b))
  const doc0 = sorted[0]
  const oid = typeof doc0.authorOpenId === 'string' ? doc0.authorOpenId.trim() : ''
  const userMap = await getUserRowsByOpenIds(usersCol, oid ? [oid] : [])
  return mergeCommentPreviewFromSorted(post, sorted, userMap)
}

/** @param {string} fileId @returns {string|null} */
function dailyStorageOwnerOpenId(fileId) {
  if (typeof fileId !== 'string' || !fileId.startsWith('cloud://')) return null
  const j = fileId.indexOf(DAILY_STORAGE_PREFIX)
  if (j < 0) return null
  const seg = fileId.slice(j + DAILY_STORAGE_PREFIX.length).split('/')[0] || ''
  const t = seg.trim()
  return t || null
}

/** @param {string} fileId @param {Set<string>} coupleOpenIdSet */
function isDailyImageFileIdVisibleToCouple(fileId, coupleOpenIdSet) {
  const owner = dailyStorageOwnerOpenId(fileId)
  return owner != null && coupleOpenIdSet.has(owner)
}

module.exports = {
  DAILY,
  DAILY_COMMENTS,
  PAGE_SIZE,
  MAX_SNIPPET,
  MAX_IMAGES,
  MAX_COMMENT_TEXT,
  MAX_COMMENT_DEPTH,
  toPublicDaily,
  toPublicComment,
  getDailyPostDocForViewer,
  buildPublicDailyForViewer,
  viewerDailyAuthorFromUser,
  nickAvatarForDailyAuthor,
  countDirectReplies,
  attachDailyListCommentSummaries,
  attachOnePostCommentSummary,
  dailyStorageOwnerOpenId,
  isDailyImageFileIdVisibleToCouple,
}
