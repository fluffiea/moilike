const { fail, getDoc } = require('./util')
const media = require('./media')

const COLLECTIONS = {
  users: 'users',
  daily: 'daily_posts',
  comments: 'daily_comments',
  reports: 'report_posts',
  binds: 'bind_requests',
  letters: 'letters',
}

/** 绑定关系以 partnerOpenId 为准；兼容早期只写了 partner.openId 的文档 */
function partnerIdOf(userDoc) {
  if (!userDoc) return ''
  if (typeof userDoc.partnerOpenId === 'string' && userDoc.partnerOpenId.trim()) {
    return userDoc.partnerOpenId.trim()
  }
  const p = userDoc.partner
  return p && typeof p.openId === 'string' ? p.openId.trim() : ''
}

/**
 * 每次请求一个上下文。me / partner 读取结果在本次请求内复用。
 * @param {{ cloud: any, openid: string }} opts
 */
function createContext({ cloud, openid }) {
  const db = cloud.database()
  const col = {}
  for (const [key, name] of Object.entries(COLLECTIONS)) col[key] = db.collection(name)

  let meP = null
  let partnerP = null

  const ctx = {
    cloud,
    db,
    _: db.command,
    col,
    openid,

    /** 本人 users 文档（不存在为 null） */
    me() {
      if (!meP) meP = getDoc(col.users, openid)
      return meP
    },

    /** 已注册的本人 + 伴侣 openId；伴侣文档用 partner() 按需并行读取 */
    async viewer() {
      const me = await ctx.me()
      if (!me || !me.nickName) fail('NOT_REGISTERED', '请先完善资料')
      const partnerId = partnerIdOf(me)
      return { me, partnerId, ids: partnerId ? [openid, partnerId] : [openid] }
    },

    /** 写入用户文档后丢弃本次请求内的缓存 */
    reset() {
      meP = null
      partnerP = null
    },

    async partner() {
      if (!partnerP) {
        partnerP = ctx.me().then((me) => getDoc(col.users, partnerIdOf(me)))
      }
      return partnerP
    },

    async requirePartner() {
      const v = await ctx.viewer()
      if (!v.partnerId) fail('NO_PARTNER', '结伴后才能使用')
      return v
    },

    /** 本次响应涉及的人（最多两位）的展示信息；头像需在调用 view 前一并签名 avatarIds */
    async people() {
      const [me, partner] = await Promise.all([ctx.me(), ctx.partner()])
      const docs = new Map()
      if (me) docs.set(openid, me)
      if (partner) docs.set(partnerIdOf(me), partner)
      return {
        avatarIds: [...docs.values()].map((d) => d.avatarUrl),
        /** @param {string} who @param {Map<string, string>} urls */
        view(who, urls) {
          const d = docs.get(who)
          return {
            name: d && d.nickName ? d.nickName : who === openid ? '我' : '对方',
            avatarUrl: d ? media.avatar(d.avatarUrl, urls) : '',
          }
        },
      }
    },
  }
  return ctx
}

module.exports = { createContext, partnerIdOf, COLLECTIONS }
