const cloud = require('wx-server-sdk')

/**
 * 云开发控制台请新建集合 daily_posts；安全规则建议仅云函数可写、客户端不直连读（仅用 callFunction）。
 * 列表查询使用 authorOpenId + createdAt 排序，请在「数据库 → 索引」添加复合索引（authorOpenId、createdAt 降序），否则 where(in)+orderBy 可能报错。
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

/**
 * @param {import('wx-server-sdk').Database} db
 * @param {string} openId
 */
async function getPartnerOpenId(db, openId) {
  try {
    const r = await db.collection(USERS).doc(openId).get()
    const p = r.data && r.data.partnerOpenId
    return typeof p === 'string' && p ? p : null
  } catch {
    return null
  }
}

/**
 * @param {string} openId
 * @param {string | null} partnerOpenId
 */
function visibleAuthors(openId, partnerOpenId) {
  const a = [openId]
  if (partnerOpenId) a.push(partnerOpenId)
  return a
}

/**
 * @param {{
 *   action?: string,
 *   offset?: number,
 *   snippet?: string,
 *   images?: unknown[],
 *   id?: string,
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

  try {
    if (event.action === 'listDaily') {
      const offset = Math.max(0, parseInt(String(event.offset || 0), 10) || 0)
      const partner = await getPartnerOpenId(db, OPENID)
      const authors = visibleAuthors(OPENID, partner)
      const res = await dailyCol
        .where({
          authorOpenId: _.in(authors),
        })
        .orderBy('createdAt', 'desc')
        .skip(offset)
        .limit(PAGE_SIZE)
        .get()
      const list = (res.data || []).map((doc) => toPublicDaily(doc, OPENID))
      const hasMore = list.length === PAGE_SIZE
      const nextOffset = offset + list.length
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
      const partner = await getPartnerOpenId(db, OPENID)
      const authors = visibleAuthors(OPENID, partner)
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

      let nick = ''
      let avatar = ''
      try {
        const ur = await db.collection(USERS).doc(OPENID).get()
        if (ur.data) {
          if (typeof ur.data.nickName === 'string') nick = ur.data.nickName
          if (typeof ur.data.avatarUrl === 'string') avatar = ur.data.avatarUrl
        }
      } catch {
        // ignore
      }

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

      let nick = typeof existing.authorNickName === 'string' ? existing.authorNickName : ''
      let avatar = typeof existing.authorAvatarUrl === 'string' ? existing.authorAvatarUrl : ''
      try {
        const ur = await db.collection(USERS).doc(OPENID).get()
        if (ur.data) {
          if (typeof ur.data.nickName === 'string') nick = ur.data.nickName
          if (typeof ur.data.avatarUrl === 'string') avatar = ur.data.avatarUrl
        }
      } catch {
        // ignore
      }

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
