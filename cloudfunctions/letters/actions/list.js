/**
 * action: list - 获取所有相关信件
 * @param {{ event: Record<string, unknown>, db: any, _: any, lettersCol: any, usersCol: any, helpers: any, OPENID: string }} ctx
 */
async function list(ctx) {
  const { event, db, _, lettersCol, usersCol, helpers, OPENID } = ctx
  const { toPublicLetter, PAGE_SIZE } = helpers
  const { getUserRowsByOpenIds } = require('../common/utils')

  const offset = Math.max(0, parseInt(String(event.offset || 0), 10) || 0)

  const res = await lettersCol
    .where(_.or([
      { senderId: OPENID },
      { receiverId: OPENID },
    ]))
    .orderBy('createdAt', 'desc')
    .skip(offset)
    .limit(PAGE_SIZE)
    .get()

  const rawList = res.data || []
  const list = rawList.map((doc) => toPublicLetter({ ...doc }, OPENID))

  const rawLen = rawList.length
  const hasMore = rawLen === PAGE_SIZE
  const nextOffset = offset + rawLen

  return { ok: true, list, hasMore, nextOffset }
}

module.exports = list
