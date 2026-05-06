const cloud = require('wx-server-sdk')

/**
 * 报备：集合 report_posts；仅情侣双方可见（与 daily_posts 一致）。
 * 控制台新建 report_posts；建议索引 (authorOpenId, recordAt desc)。
 * users 增加 reportTags: string[]（可选）；默认标签「干饭」由云函数合并，不必写入 users。
 * 云存储配图路径 reports/{openId}/...，与客户端 upload 一致。
 */

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const USERS = 'users'
const REPORT = 'report_posts'
const PAGE_SIZE = 10
const MAX_BODY = 2000
const MAX_IMAGES = 9
const MAX_TAGS_PER_POST = 10
const MAX_TAG_LEN = 16
const MAX_USER_CUSTOM_TAGS = 20
const MAX_EVAL_TEXT = 500
const DEFAULT_TAG = '干饭'

const REPORT_STORAGE_PREFIX = '/reports/'

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
 * @param {unknown} arr
 */
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
 * @param {Record<string, unknown>|null|undefined} row
 * @param {{ nick: string, avatar: string }} defaults
 */
function nickAvatarForAuthor(row, defaults) {
  let nick = defaults.nick
  let avatar = defaults.avatar
  if (!row || typeof row !== 'object') return { nick, avatar }
  if (typeof row.nickName === 'string') nick = row.nickName
  if (typeof row.avatarUrl === 'string') avatar = row.avatarUrl
  return { nick, avatar }
}

/**
 * @param {string} fileId
 * @returns {string|null}
 */
function reportStorageOwnerOpenId(fileId) {
  if (typeof fileId !== 'string' || !fileId.startsWith('cloud://')) return null
  const j = fileId.indexOf(REPORT_STORAGE_PREFIX)
  if (j < 0) return null
  const seg = fileId.slice(j + REPORT_STORAGE_PREFIX.length).split('/')[0] || ''
  const t = seg.trim()
  return t || null
}

/**
 * @param {string} fileId
 * @param {Set<string>} coupleOpenIdSet
 */
function isReportImageFileIdVisibleToCouple(fileId, coupleOpenIdSet) {
  const owner = reportStorageOwnerOpenId(fileId)
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
 * @param {Record<string, unknown>} doc
 * @param {string} OPENID
 */
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

/**
 * @param {Record<string, unknown>} doc
 * @param {string} id
 * @param {string} OPENID
 * @param {string|null} partner
 */
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

/**
 * @param {import('wx-server-sdk').DB.CollectionReference} reportCol
 * @param {import('wx-server-sdk').DB.CollectionReference} usersCol
 * @param {string} OPENID
 * @param {string} postId
 */
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

/**
 * @param {unknown} raw
 */
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

/**
 * @param {{
 *   action?: string,
 *   offset?: number,
 *   filter?: string,
 *   id?: string,
 *   body?: string,
 *   images?: unknown[],
 *   tags?: unknown[],
 *   recordAtMs?: number,
 *   text?: string,
 *   tag?: string,
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
  const reportCol = db.collection(REPORT)
  const usersCol = db.collection(USERS)

  try {
    if (event.action === 'getReportMediaTempURLs') {
      const raw = event.fileIDs
      const list = Array.isArray(raw) ? [...new Set(raw)] : []
      const partner = await getMutualPartnerOpenId(usersCol, OPENID)
      const coupleSet = new Set(coupleAuthorOpenIds(OPENID, partner))
      const capped = list
        .filter((x) => typeof x === 'string' && x.startsWith('cloud://'))
        .filter((fid) => isReportImageFileIdVisibleToCouple(fid, coupleSet))
        .slice(0, 20)
      if (capped.length === 0) {
        return { ok: true, urls: {} }
      }
      try {
        const r = await cloud.getTempFileURL({ fileList: capped })
        return { ok: true, urls: recordTempFileUrlsFromSdk(r.fileList) }
      } catch (e) {
        console.error('getReportMediaTempURLs', e)
        return { ok: false, error: '换取展示链接失败' }
      }
    }

    if (event.action === 'listReportTags') {
      const row = await getUserDocRow(usersCol, OPENID)
      const raw = row && typeof row === 'object' && row.reportTags ? row.reportTags : []
      const tags = mergeDefaultTags(raw)
      return { ok: true, tags }
    }

    if (event.action === 'addReportTag') {
      const rawTag = typeof event.tag === 'string' ? event.tag.trim().slice(0, MAX_TAG_LEN) : ''
      if (!rawTag) return { ok: false, error: '标签不能为空' }
      const row = await getUserDocRow(usersCol, OPENID)
      if (!row || typeof row !== 'object') {
        return { ok: false, error: '用户不存在' }
      }
      const openIdKey =
        typeof row.openId === 'string' && row.openId.trim() ? row.openId.trim() : OPENID
      /** @type {string[]} */
      let custom = []
      if (Array.isArray(row.reportTags)) {
        for (let i = 0; i < row.reportTags.length; i++) {
          const s =
            typeof row.reportTags[i] === 'string'
              ? row.reportTags[i].trim().slice(0, MAX_TAG_LEN)
              : ''
          if (!s || custom.indexOf(s) >= 0) continue
          custom.push(s)
        }
      }
      const display = mergeDefaultTags(custom)
      if (rawTag === DEFAULT_TAG) {
        return { ok: true, tags: display }
      }
      if (display.indexOf(rawTag) >= 0) {
        return { ok: true, tags: display }
      }
      if (custom.length >= MAX_USER_CUSTOM_TAGS) {
        return { ok: false, error: '自定义标签已达上限' }
      }
      custom = custom.concat([rawTag])
      await usersCol.doc(openIdKey).update({
        data: { reportTags: custom },
      })
      return { ok: true, tags: mergeDefaultTags(custom) }
    }

    if (event.action === 'listReports') {
      const offset = Math.max(0, parseInt(String(event.offset || 0), 10) || 0)
      const filter = typeof event.filter === 'string' ? event.filter : 'all'
      const partner = await getMutualPartnerOpenId(usersCol, OPENID)
      const authors = coupleAuthorOpenIds(OPENID, partner)

      let q = reportCol.where({ authorOpenId: _.in(authors) })
      if (filter === 'mine') {
        q = reportCol.where({ authorOpenId: OPENID })
      } else if (filter === 'pending') {
        if (!partner) {
          return { ok: true, list: [], hasMore: false, nextOffset: offset }
        }
        q = reportCol
          .where({
            authorOpenId: partner,
            partnerReadAt: _.eq(null),
          })
      }

      const res = await q.orderBy('recordAt', 'desc').skip(offset).limit(PAGE_SIZE).get()
      const rawList = res.data || []
      const filtered = rawList.filter((doc) => {
        const aid = typeof doc.authorOpenId === 'string' ? doc.authorOpenId : ''
        if (filter === 'mine') return aid === OPENID
        if (filter === 'pending') return aid === partner
        return authors.includes(aid)
      })
      const list = filtered.map((doc) => {
        const id = doc._id
        return toPublicReport(doc, id, OPENID, partner)
      })
      const rawLen = rawList.length
      const hasMore = rawLen === PAGE_SIZE
      const nextOffset = offset + rawLen
      return { ok: true, list, hasMore, nextOffset }
    }

    if (event.action === 'getReport') {
      const id = typeof event.id === 'string' ? event.id.trim() : ''
      if (!id) return { ok: false, error: '缺少 id' }
      const vr = await getReportDocForViewer(reportCol, usersCol, OPENID, id)
      if (!vr.ok) return vr
      const doc = vr.doc
      const partner = vr.partner
      const post = toPublicReport(doc, id, OPENID, partner)
      return { ok: true, post }
    }

    if (event.action === 'getReportFeedItem') {
      let rawId = ''
      if (typeof event.id === 'string') rawId = event.id
      else if (typeof event.postId === 'string') rawId = event.postId
      const id = rawId.trim()
      if (!id) return { ok: false, error: '缺少 id' }
      return exports.main({ ...event, action: 'getReport', id })
    }

    if (event.action === 'createReport') {
      const body =
        typeof event.body === 'string' ? event.body.trim().slice(0, MAX_BODY) : ''
      const images = sanitizeImages(event.images)
      const tags = sanitizeTags(event.tags)
      const recordAtMs =
        typeof event.recordAtMs === 'number' && !Number.isNaN(event.recordAtMs)
          ? event.recordAtMs
          : Date.now()
      if (!body && images.length === 0 && tags.length === 0) {
        return { ok: false, error: '内容不能为空' }
      }
      const ur = await getUserDocRow(usersCol, OPENID)
      const { nick, avatar } = nickAvatarForAuthor(ur, { nick: '', avatar: '' })
      const addRes = await reportCol.add({
        data: {
          authorOpenId: OPENID,
          authorNickName: nick,
          authorAvatarUrl: avatar,
          body,
          images,
          tags,
          recordAt: new Date(recordAtMs),
          createdAt: db.serverDate(),
          updatedAt: db.serverDate(),
          partnerReadAt: null,
          partnerEvalText: '',
          partnerEvaluatedAt: null,
        },
      })
      const newId = addRes._id
      const got = await reportCol.doc(newId).get()
      const raw = got.data || {}
      const partner = await getMutualPartnerOpenId(usersCol, OPENID)
      return {
        ok: true,
        post: toPublicReport({ ...raw, _id: newId }, newId, OPENID, partner),
      }
    }

    if (event.action === 'updateReport') {
      const id = typeof event.id === 'string' ? event.id.trim() : ''
      if (!id) return { ok: false, error: '缺少 id' }
      let existing
      try {
        const g = await reportCol.doc(id).get()
        existing = g.data
      } catch {
        return { ok: false, error: '不存在' }
      }
      if (!existing) return { ok: false, error: '不存在' }
      const aid = typeof existing.authorOpenId === 'string' ? existing.authorOpenId : ''
      if (aid !== OPENID) {
        return { ok: false, error: '只能编辑自己的报备' }
      }
      const body =
        typeof event.body === 'string' ? event.body.trim().slice(0, MAX_BODY) : ''
      const images = sanitizeImages(event.images)
      const tags = sanitizeTags(event.tags)
      const recordAtMs =
        typeof event.recordAtMs === 'number' && !Number.isNaN(event.recordAtMs)
          ? event.recordAtMs
          : null
      if (!body && images.length === 0 && tags.length === 0) {
        return { ok: false, error: '内容不能为空' }
      }
      const ur = await getUserDocRow(usersCol, OPENID)
      const { nick, avatar } = nickAvatarForAuthor(ur, {
        nick: typeof existing.authorNickName === 'string' ? existing.authorNickName : '',
        avatar: typeof existing.authorAvatarUrl === 'string' ? existing.authorAvatarUrl : '',
      })
      /** @type {Record<string, unknown>} */
      const patch = {
        body,
        images,
        tags,
        authorNickName: nick,
        authorAvatarUrl: avatar,
        updatedAt: db.serverDate(),
      }
      if (recordAtMs != null) {
        patch.recordAt = new Date(recordAtMs)
      }
      await reportCol.doc(id).update({ data: patch })
      const got = await reportCol.doc(id).get()
      const raw = got.data || {}
      const partner = await getMutualPartnerOpenId(usersCol, OPENID)
      return { ok: true, post: toPublicReport({ ...raw, _id: id }, id, OPENID, partner) }
    }

    if (event.action === 'markReportRead') {
      const id = typeof event.id === 'string' ? event.id.trim() : ''
      if (!id) return { ok: false, error: '缺少 id' }
      const vr = await getReportDocForViewer(reportCol, usersCol, OPENID, id)
      if (!vr.ok) return vr
      const doc = vr.doc
      const authorOpenId = typeof doc.authorOpenId === 'string' ? doc.authorOpenId : ''
      if (authorOpenId === OPENID) {
        return { ok: false, error: '仅对象可标记已阅' }
      }
      if (partnerStateFromDoc(doc) !== 'pending_read') {
        return { ok: false, error: '当前状态不可标记已阅' }
      }
      await reportCol.doc(id).update({
        data: {
          partnerReadAt: db.serverDate(),
          updatedAt: db.serverDate(),
        },
      })
      const got = await reportCol.doc(id).get()
      const raw = got.data || {}
      const partner = vr.partner
      return { ok: true, post: toPublicReport({ ...raw, _id: id }, id, OPENID, partner) }
    }

    if (event.action === 'evaluateReport') {
      const id = typeof event.id === 'string' ? event.id.trim() : ''
      const rawText = typeof event.text === 'string' ? event.text : ''
      const text = rawText.trim().slice(0, MAX_EVAL_TEXT)
      if (!id) return { ok: false, error: '缺少 id' }
      if (!text) return { ok: false, error: '评价不能为空' }
      const vr = await getReportDocForViewer(reportCol, usersCol, OPENID, id)
      if (!vr.ok) return vr
      const doc = vr.doc
      const authorOpenId = typeof doc.authorOpenId === 'string' ? doc.authorOpenId : ''
      if (authorOpenId === OPENID) {
        return { ok: false, error: '仅对象可评价' }
      }
      if (partnerStateFromDoc(doc) !== 'read') {
        return { ok: false, error: '请先标记已阅后再评价' }
      }
      await reportCol.doc(id).update({
        data: {
          partnerEvalText: text,
          partnerEvaluatedAt: db.serverDate(),
          updatedAt: db.serverDate(),
        },
      })
      const got = await reportCol.doc(id).get()
      const raw = got.data || {}
      const partner = vr.partner
      return { ok: true, post: toPublicReport({ ...raw, _id: id }, id, OPENID, partner) }
    }

    if (event.action === 'deleteReport') {
      const id = typeof event.id === 'string' ? event.id.trim() : ''
      if (!id) return { ok: false, error: '缺少 id' }
      let existing
      try {
        const g = await reportCol.doc(id).get()
        existing = g.data
      } catch {
        return { ok: false, error: '不存在' }
      }
      if (!existing) return { ok: false, error: '不存在' }
      const aid = typeof existing.authorOpenId === 'string' ? existing.authorOpenId : ''
      if (aid !== OPENID) {
        return { ok: false, error: '只能删除自己的报备' }
      }
      await reportCol.doc(id).remove()
      return { ok: true }
    }

    return { ok: false, error: '未知操作' }
  } catch (err) {
    const msg = err && err.message ? String(err.message) : String(err)
    console.error('report cloud error', err)
    return { ok: false, error: msg || '服务异常' }
  }
}
