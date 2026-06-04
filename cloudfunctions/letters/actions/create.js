/**
 * action: create - 新建信件
 * @param {{ event: Record<string, unknown>, db: any, lettersCol: any, usersCol: any, helpers: any, OPENID: string }} ctx
 */
async function create(ctx) {
  const { event, db, lettersCol, usersCol, helpers, OPENID } = ctx
  const { MAX_TITLE, MAX_CONTENT, toPublicLetter } = helpers
  const { getUserDocRow } = require('../common/utils')

  const title = typeof event.title === 'string' ? event.title.trim().slice(0, MAX_TITLE) : ''
  const content = typeof event.content === 'string' ? event.content.trim() : ''
  const type = typeof event.type === 'string' ? event.type.trim() : 'text'
  const images = Array.isArray(event.images)
    ? event.images.filter((u) => typeof u === 'string' && u.startsWith('cloud://')).slice(0, 9)
    : []
  const receiverId = typeof event.receiverId === 'string' ? event.receiverId.trim() : ''

  if (!content) {
    return { ok: false, error: '内容不能为空' }
  }
  if (!receiverId) {
    return { ok: false, error: '缺少收信人' }
  }
  if (receiverId === OPENID) {
    return { ok: false, error: '不能给自己写信' }
  }

  const contentTrimmed = content.slice(0, MAX_CONTENT)

  const addRes = await lettersCol.add({
    data: {
      title,
      content: contentTrimmed,
      type,
      images,
      senderId: OPENID,
      receiverId,
      createdAt: db.serverDate(),
      updatedAt: db.serverDate(),
    },
  })
  const newId = addRes._id
  const got = await lettersCol.doc(newId).get()
  const raw = got.data || {}
  return { ok: true, letter: toPublicLetter({ ...raw, _id: newId }, OPENID) }
}

module.exports = create
