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
 */

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const USERS = 'users'
const DAILY = 'daily_posts'
const PAGE_SIZE = 5
const MAX_SNIPPET = 2000
const MAX_IMAGES = 9

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
      const list = rawList
        .filter((doc) => {
          const aid = typeof doc.authorOpenId === 'string' ? doc.authorOpenId : ''
          return authors.includes(aid)
        })
        .map((doc) => toPublicDaily(doc, OPENID))
      const rawLen = rawList.length
      const hasMore = rawLen === PAGE_SIZE
      const nextOffset = offset + rawLen
      return { ok: true, list, hasMore, nextOffset }
    }

    if (event.action === 'getDaily') {
      const id = typeof event.id === 'string' ? event.id : ''
      if (!id) return { ok: false, error: '缺少 id' }
      let doc
      try {
        const g = await dailyCol.doc(id).get()
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
      return { ok: true, post: toPublicDaily({ ...doc, _id: id }, OPENID) }
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
