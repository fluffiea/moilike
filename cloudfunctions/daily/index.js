const cloud = require('wx-server-sdk')

/**
 * 情侣维度可见性（与业务一致）：
 * - 日常列表 / 单条读取：仅本人与「已互相绑定」的伴侣所发 `daily_posts`；任意第三方不可见。
 * - 新建：作者恒为当前 OPENID；编辑 / 删除：仅本人文档。
 * - getDailyMediaTempURLs：为 `daily/{openId}/` 下配图换临时 HTTPS（仅情侣双方可见路径）。
 * 客户端只通过 callFunction，勿给 daily_posts 开放匿名读。
 *
 * 云开发控制台请新建集合 daily_posts；安全规则建议仅云函数可写、客户端不直连读。
 * 列表使用 authorOpenId + createdAt 降序，请在「数据库 → 索引」添加复合索引 (authorOpenId, createdAt desc)，否则 where(in)+orderBy 可能报错。
 * 日常列表/单条返回的作者昵称、头像以 users 当前值为准（缺字段时回退帖内 authorNickName / authorAvatarUrl 快照）。
 * listDaily 每条在有评论时附带 commentCount、firstCommentUserName、firstCommentText（首条按 createdAt 升序）；对当前页 postId 批量查评论，单次最多 1000 条。
 * getDailyFeedItem：单条帖子 + 与 listDaily 同规则的首评摘要，供浮生页从详情返回时合并一条列表项、避免整页重拉。
 * 评论集合 daily_comments：控制台新建；列表按 dailyPostId + createdAt 升序，建议索引 (dailyPostId, createdAt asc)；若使用 update/delete 评论的「子评论计数」，建议加 (dailyPostId, parentId)。评论列表展示昵称以 users 当前 nickName 为准（无则回退 authorNickName）；评论文档不含头像字段。本人可编辑/删除自己的评论，但若已有直接子回复（parentId 指向该条）则禁止（与产品两层评论一致）。
 */

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const USERS = 'users'
const DAILY = 'daily_posts'
const DAILY_COMMENTS = 'daily_comments'
const PAGE_SIZE = 5
const MAX_SNIPPET = 2000
const MAX_IMAGES = 9
const MAX_COMMENT_TEXT = 500
/** 评论最大层级：0=主评，1=对主评的一条回复；不再允许更深（与产品「两层」一致） */
const MAX_COMMENT_DEPTH = 1

/**
 * @param {Date} d
 */
function formatTime(d) {
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  const hh = `${d.getHours()}`.padStart(2, '0')
  const mm = `${d.getMinutes()}`.padStart(2, '0')
  return `${m}-${day} ${hh}:${mm}`
}

/**
 * @param {unknown} arr
 */
function sanitizeImages(arr) {
  if (!Array.isArray(arr)) return []
  const out = []
  for (const u of arr) {
    if (typeof u === 'string' && u.startsWith('cloud://') && out.length < MAX_IMAGES) {
      out.push(u)
    }
  }
  return out
}

/**
 * @param {Record<string, unknown>} doc
 * @param {string} OPENID
 */
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
  /** @type {'mist' | 'dew' | 'bloom' | 'meadow'} */
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

/**
 * 单条日常：存在且当前用户与作者在同一「情侣可见」集合内。
 * @returns {{ ok: true, doc: Record<string, unknown> } | { ok: false, error: string }}
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
 * 单条文档 + users 展示字段 → toPublicDaily（getDaily / getDailyFeedItem 共用）。
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
 * @param {Record<string, unknown>} doc
 * @param {string} OPENID
 */
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
 * 是否存在以该评论为直接父级的子评论（有则禁止编辑/删除）。
 * @param {import('wx-server-sdk').DB.CollectionReference} commentsCol
 * @param {string} postId
 * @param {string} commentId
 */
async function countDirectReplies(commentsCol, postId, commentId) {
  const r = await commentsCol
    .where({
      dailyPostId: postId,
      parentId: commentId,
    })
    .count()
  return typeof r.total === 'number' ? r.total : 0
}

const MAX_LIST_FIRST_COMMENT_CHARS = 80

/**
 * @param {Record<string, unknown>} c
 */
function commentCreatedMs(c) {
  if (!c || !c.createdAt) return 0
  const d =
    c.createdAt instanceof Date ? c.createdAt : new Date(c.createdAt)
  const t = d.getTime()
  return Number.isNaN(t) ? 0 : t
}

/**
 * @param {Record<string, unknown>} post
 */
function stripCommentPreviewFromPost(post) {
  const next = { ...post }
  delete next.commentCount
  delete next.firstCommentUserName
  delete next.firstCommentText
  return next
}

/**
 * @param {Record<string, unknown>} post
 * @param {Record<string, unknown>[]} sorted
 * @param {Map<string, Record<string, unknown>>} userMap
 */
function mergeCommentPreviewFromSorted(post, sorted, userMap) {
  const first = sorted[0]
  const count = sorted.length
  const oid =
    typeof first.authorOpenId === 'string' ? first.authorOpenId.trim() : ''
  const row = oid ? userMap.get(oid) : null
  let userName =
    typeof first.authorNickName === 'string' ? first.authorNickName : ''
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

/**
 * 列表卡首评：按帖聚合 `daily_comments`，写回 commentCount / first*（无评论则保持原对象）。
 * @param {import('wx-server-sdk').DB.Database} db
 * @param {import('wx-server-sdk').DB.Command} _
 * @param {import('wx-server-sdk').DB.CollectionReference} usersCol
 * @param {Record<string, unknown>[]} list
 */
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
    const oid =
      typeof doc0.authorOpenId === 'string' ? doc0.authorOpenId.trim() : ''
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

/**
 * 单帖刷新列表卡：拉全量评论（上限 1000）后写回首评摘要；无评论则去掉 comment 相关字段（避免列表残留旧摘要）。
 * @param {import('wx-server-sdk').DB.Database} db
 * @param {import('wx-server-sdk').DB.Command} _
 * @param {import('wx-server-sdk').DB.CollectionReference} usersCol
 * @param {Record<string, unknown>} post
 */
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
  const oid =
    typeof doc0.authorOpenId === 'string' ? doc0.authorOpenId.trim() : ''
  const userMap = await getUserRowsByOpenIds(usersCol, oid ? [oid] : [])
  return mergeCommentPreviewFromSorted(post, sorted, userMap)
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
 * 与 user 云函数一致：优先 doc(openId)，再按 openId / _openid 查（兼容历史 users 文档）。
 * @param {import('wx-server-sdk').DB.CollectionReference} users
 * @param {string} openId
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
 * 按 openId 去重拉 users，供日常列表/详情/评论列表合并展示字段。
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
 * 读日常帖：作者昵称/头像以 users 为准；users 无对应字段时用帖内快照（兼容旧档、缺字段）。
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
 * 仅当双方 users 互为伴侣时返回对方 openId；否则 null（列表只含本人）。
 * @param {import('wx-server-sdk').DB.CollectionReference} users
 * @param {string} openId
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
 * 写日常时同步展示用昵称/头像：以 users 为准；update 时可用帖内旧值作默认。
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

/** 与客户端 `uploadDailyImagesIfNeeded` 一致：cloudPath 为 `daily/{openId}/...` */
const DAILY_STORAGE_PREFIX = '/daily/'

/**
 * @param {string} fileId
 * @returns {string|null}
 */
function dailyStorageOwnerOpenId(fileId) {
  if (typeof fileId !== 'string' || !fileId.startsWith('cloud://')) return null
  const j = fileId.indexOf(DAILY_STORAGE_PREFIX)
  if (j < 0) return null
  const seg = fileId.slice(j + DAILY_STORAGE_PREFIX.length).split('/')[0] || ''
  const t = seg.trim()
  return t || null
}

/**
 * @param {string} fileId
 * @param {Set<string>} coupleOpenIdSet
 */
function isDailyImageFileIdVisibleToCouple(fileId, coupleOpenIdSet) {
  const owner = dailyStorageOwnerOpenId(fileId)
  return owner != null && coupleOpenIdSet.has(owner)
}

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

/**
 * @param {{
 *   action?: string,
 *   offset?: number,
 *   snippet?: string,
 *   images?: unknown[],
 *   id?: string,
 *   fileIDs?: string[],
 * }} event
 */
exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const OPENID = wxContext.OPENID
  if (!OPENID) {
    return { ok: false, error: '未获取到 OPENID' }
  }

  const db = cloud.database()
  const _ = db.command
  const dailyCol = db.collection(DAILY)
  const usersCol = db.collection(USERS)

  try {
    if (event.action === 'getDailyMediaTempURLs') {
      const raw = event.fileIDs
      const list = Array.isArray(raw) ? [...new Set(raw)] : []
      const partner = await getMutualPartnerOpenId(usersCol, OPENID)
      const coupleSet = new Set(coupleAuthorOpenIds(OPENID, partner))
      const capped = list
        .filter((x) => typeof x === 'string' && x.startsWith('cloud://'))
        .filter((fid) => isDailyImageFileIdVisibleToCouple(fid, coupleSet))
        .slice(0, 20)
      if (capped.length === 0) {
        return { ok: true, urls: {} }
      }
      try {
        const r = await cloud.getTempFileURL({ fileList: capped })
        return { ok: true, urls: recordTempFileUrlsFromSdk(r.fileList) }
      } catch (e) {
        console.error('getDailyMediaTempURLs', e)
        return { ok: false, error: '换取展示链接失败' }
      }
    }

    if (event.action === 'listDaily') {
      const offset = Math.max(0, parseInt(String(event.offset || 0), 10) || 0)
      const partner = await getMutualPartnerOpenId(usersCol, OPENID)
      const authors = coupleAuthorOpenIds(OPENID, partner)
      const res = await dailyCol
        .where({
          authorOpenId: _.in(authors),
        })
        .orderBy('createdAt', 'desc')
        .skip(offset)
        .limit(PAGE_SIZE)
        .get()
      const rawList = res.data || []
      const filtered = rawList.filter((doc) => {
        const aid = typeof doc.authorOpenId === 'string' ? doc.authorOpenId : ''
        return authors.includes(aid)
      })
      const authorIds = filtered.map((doc) =>
        typeof doc.authorOpenId === 'string' ? doc.authorOpenId : '',
      )
      const userMap = await getUserRowsByOpenIds(usersCol, authorIds)
      const list = filtered.map((doc) => {
        const aid = typeof doc.authorOpenId === 'string' ? doc.authorOpenId.trim() : ''
        const row = aid ? userMap.get(aid) : null
        const fields = viewerDailyAuthorFromUser(row || null, doc)
        return toPublicDaily({ ...doc, ...fields }, OPENID)
      })
      const listWithComments = await attachDailyListCommentSummaries(
        db,
        _,
        usersCol,
        list,
      )
      const rawLen = rawList.length
      const hasMore = rawLen === PAGE_SIZE
      const nextOffset = offset + rawLen
      return { ok: true, list: listWithComments, hasMore, nextOffset }
    }

    if (event.action === 'getDaily') {
      const id = typeof event.id === 'string' ? event.id : ''
      if (!id) return { ok: false, error: '缺少 id' }
      return await buildPublicDailyForViewer(dailyCol, usersCol, OPENID, id)
    }

    /** 浮生列表单条合并：帖子字段 + 与 listDaily 一致的首评摘要（省整页重拉） */
    if (event.action === 'getDailyFeedItem') {
      let rawId = ''
      if (typeof event.id === 'string') {
        rawId = event.id
      } else if (typeof event.postId === 'string') {
        rawId = event.postId
      }
      const id = rawId.trim()
      if (!id) return { ok: false, error: '缺少 id' }
      const base = await buildPublicDailyForViewer(dailyCol, usersCol, OPENID, id)
      if (!base.ok) return base
      const post = await attachOnePostCommentSummary(db, _, usersCol, base.post)
      return { ok: true, post }
    }

    if (event.action === 'listDailyComments') {
      const postId = typeof event.postId === 'string' ? event.postId.trim() : ''
      if (!postId) return { ok: false, error: '缺少 postId' }
      const vr = await getDailyPostDocForViewer(dailyCol, usersCol, OPENID, postId)
      if (!vr.ok) return vr
      const commentsCol = db.collection(DAILY_COMMENTS)
      const res = await commentsCol
        .where({ dailyPostId: postId })
        .orderBy('createdAt', 'asc')
        .limit(200)
        .get()
      const rawList = res.data || []
      const authorIds = rawList.map((c) =>
        typeof c.authorOpenId === 'string' ? c.authorOpenId : '',
      )
      const userMap = await getUserRowsByOpenIds(usersCol, authorIds)
      const list = rawList.map((c) => {
        const oid = typeof c.authorOpenId === 'string' ? c.authorOpenId.trim() : ''
        const row = oid ? userMap.get(oid) : null
        const stored =
          typeof c.authorNickName === 'string' ? c.authorNickName : ''
        let authorNickName = stored
        if (row && typeof row.nickName === 'string') {
          const t = row.nickName.trim()
          if (t) authorNickName = t
        }
        return toPublicComment({ ...c, authorNickName }, OPENID)
      })
      return { ok: true, list }
    }

    if (event.action === 'addDailyComment') {
      const postId = typeof event.postId === 'string' ? event.postId.trim() : ''
      const rawText = typeof event.text === 'string' ? event.text : ''
      const text = rawText.trim().slice(0, MAX_COMMENT_TEXT)
      const parentRaw =
        typeof event.parentCommentId === 'string' ? event.parentCommentId.trim() : ''
      if (!postId) return { ok: false, error: '缺少 postId' }
      if (!text) return { ok: false, error: '评论不能为空' }
      const vr = await getDailyPostDocForViewer(dailyCol, usersCol, OPENID, postId)
      if (!vr.ok) return vr

      const commentsCol = db.collection(DAILY_COMMENTS)
      let depth = 0
      let parentId = ''
      if (parentRaw) {
        let pdoc
        try {
          const pg = await commentsCol.doc(parentRaw).get()
          pdoc = pg.data
        } catch {
          return { ok: false, error: '原评论不存在' }
        }
        if (!pdoc || typeof pdoc !== 'object') {
          return { ok: false, error: '原评论不存在' }
        }
        if (pdoc.dailyPostId !== postId) {
          return { ok: false, error: '原评论不存在' }
        }
        const pd =
          typeof pdoc.depth === 'number' && pdoc.depth >= 0 ? pdoc.depth : 0
        if (pd >= MAX_COMMENT_DEPTH) {
          return { ok: false, error: '回复层级已达上限' }
        }
        depth = pd + 1
        parentId = parentRaw
      }

      const ur = await getUserDocRow(usersCol, OPENID)
      const nick = nickAvatarForDailyAuthor(ur, { nick: '', avatar: '' }).nick

      const addRes = await commentsCol.add({
        data: {
          dailyPostId: postId,
          authorOpenId: OPENID,
          authorNickName: nick,
          text,
          parentId: parentId || '',
          depth,
          createdAt: db.serverDate(),
        },
      })
      const newId = addRes._id
      const got = await commentsCol.doc(newId).get()
      const raw = got.data || {}
      return {
        ok: true,
        comment: toPublicComment({ ...raw, _id: newId }, OPENID),
      }
    }

    if (event.action === 'updateDailyComment') {
      const postId = typeof event.postId === 'string' ? event.postId.trim() : ''
      const commentId = typeof event.commentId === 'string' ? event.commentId.trim() : ''
      const rawText = typeof event.text === 'string' ? event.text : ''
      const text = rawText.trim().slice(0, MAX_COMMENT_TEXT)
      if (!postId || !commentId) return { ok: false, error: '缺少参数' }
      if (!text) return { ok: false, error: '评论不能为空' }
      const vr = await getDailyPostDocForViewer(dailyCol, usersCol, OPENID, postId)
      if (!vr.ok) return vr

      const commentsCol = db.collection(DAILY_COMMENTS)
      let existing
      try {
        const g = await commentsCol.doc(commentId).get()
        existing = g.data
      } catch {
        return { ok: false, error: '评论不存在' }
      }
      if (!existing || typeof existing !== 'object') {
        return { ok: false, error: '评论不存在' }
      }
      if (existing.dailyPostId !== postId) {
        return { ok: false, error: '评论不存在' }
      }
      const aid = typeof existing.authorOpenId === 'string' ? existing.authorOpenId : ''
      if (aid !== OPENID) {
        return { ok: false, error: '只能编辑自己的评论' }
      }
      const replies = await countDirectReplies(commentsCol, postId, commentId)
      if (replies > 0) {
        return { ok: false, error: '已有回复，不能编辑' }
      }

      const ur = await getUserDocRow(usersCol, OPENID)
      const nick = nickAvatarForDailyAuthor(ur, { nick: '', avatar: '' }).nick

      await commentsCol.doc(commentId).update({
        data: {
          text,
          authorNickName: nick,
        },
      })
      const got = await commentsCol.doc(commentId).get()
      const raw = got.data || {}
      return {
        ok: true,
        comment: toPublicComment({ ...raw, _id: commentId }, OPENID),
      }
    }

    if (event.action === 'deleteDailyComment') {
      const postId = typeof event.postId === 'string' ? event.postId.trim() : ''
      const commentId = typeof event.commentId === 'string' ? event.commentId.trim() : ''
      if (!postId || !commentId) return { ok: false, error: '缺少参数' }
      const vr = await getDailyPostDocForViewer(dailyCol, usersCol, OPENID, postId)
      if (!vr.ok) return vr

      const commentsCol = db.collection(DAILY_COMMENTS)
      let existing
      try {
        const g = await commentsCol.doc(commentId).get()
        existing = g.data
      } catch {
        return { ok: false, error: '评论不存在' }
      }
      if (!existing || typeof existing !== 'object') {
        return { ok: false, error: '评论不存在' }
      }
      if (existing.dailyPostId !== postId) {
        return { ok: false, error: '评论不存在' }
      }
      const aid = typeof existing.authorOpenId === 'string' ? existing.authorOpenId : ''
      if (aid !== OPENID) {
        return { ok: false, error: '只能删除自己的评论' }
      }
      const replies = await countDirectReplies(commentsCol, postId, commentId)
      if (replies > 0) {
        return { ok: false, error: '已有回复，不能删除' }
      }
      await commentsCol.doc(commentId).remove()
      return { ok: true }
    }

    if (event.action === 'createDaily') {
      const snippet =
        typeof event.snippet === 'string' ? event.snippet.trim().slice(0, MAX_SNIPPET) : ''
      const images = sanitizeImages(event.images)
      if (!snippet && images.length === 0) {
        return { ok: false, error: '内容不能为空' }
      }

      const ur = await getUserDocRow(usersCol, OPENID)
      const { nick, avatar } = nickAvatarForDailyAuthor(ur, { nick: '', avatar: '' })

      const addRes = await dailyCol.add({
        data: {
          authorOpenId: OPENID,
          snippet,
          images,
          authorNickName: nick,
          authorAvatarUrl: avatar,
          createdAt: db.serverDate(),
          updatedAt: db.serverDate(),
        },
      })
      const newId = addRes._id
      const got = await dailyCol.doc(newId).get()
      const raw = got.data || {}
      return {
        ok: true,
        post: toPublicDaily({ ...raw, _id: newId }, OPENID),
      }
    }

    if (event.action === 'updateDaily') {
      const id = typeof event.id === 'string' ? event.id : ''
      if (!id) return { ok: false, error: '缺少 id' }
      let existing
      try {
        const g = await dailyCol.doc(id).get()
        existing = g.data
      } catch {
        return { ok: false, error: '不存在' }
      }
      if (!existing) return { ok: false, error: '不存在' }
      const aid = typeof existing.authorOpenId === 'string' ? existing.authorOpenId : ''
      if (aid !== OPENID) {
        return { ok: false, error: '只能编辑自己的日常' }
      }

      const snippet =
        typeof event.snippet === 'string' ? event.snippet.trim().slice(0, MAX_SNIPPET) : ''
      const images = sanitizeImages(event.images)
      if (!snippet && images.length === 0) {
        return { ok: false, error: '内容不能为空' }
      }

      const ur = await getUserDocRow(usersCol, OPENID)
      const { nick, avatar } = nickAvatarForDailyAuthor(ur, {
        nick: typeof existing.authorNickName === 'string' ? existing.authorNickName : '',
        avatar: typeof existing.authorAvatarUrl === 'string' ? existing.authorAvatarUrl : '',
      })

      await dailyCol.doc(id).update({
        data: {
          snippet,
          images,
          authorNickName: nick,
          authorAvatarUrl: avatar,
          updatedAt: db.serverDate(),
        },
      })
      const got = await dailyCol.doc(id).get()
      const raw = got.data || {}
      return {
        ok: true,
        post: toPublicDaily({ ...raw, _id: id }, OPENID),
      }
    }

    if (event.action === 'deleteDaily') {
      const id = typeof event.id === 'string' ? event.id : ''
      if (!id) return { ok: false, error: '缺少 id' }
      let existing
      try {
        const g = await dailyCol.doc(id).get()
        existing = g.data
      } catch {
        return { ok: false, error: '不存在' }
      }
      if (!existing) return { ok: false, error: '不存在' }
      const aid = typeof existing.authorOpenId === 'string' ? existing.authorOpenId : ''
      if (aid !== OPENID) {
        return { ok: false, error: '只能删除自己的日常' }
      }
      await dailyCol.doc(id).remove()
      return { ok: true }
    }

    return { ok: false, error: '未知操作' }
  } catch (err) {
    const msg = err && err.message ? String(err.message) : String(err)
    console.error('daily cloud error', err)
    return { ok: false, error: msg || '服务异常' }
  }
}
