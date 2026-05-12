/**
 * action: createReport - 新建报备
 * @param {{ event: Record<string, unknown>, db: any, reportCol: any, usersCol: any, helpers: any }} ctx
 */
async function createReport(ctx) {
  const { event, db, reportCol, usersCol, helpers } = ctx
  const { getUserDocRow, getMutualPartnerOpenId } = require('../../common/utils')
  const { sanitizeImages } = require('../../common/utils')
  const { sanitizeTags, nickAvatarForAuthor, toPublicReport, MAX_BODY } = helpers

  const body = typeof event.body === 'string' ? event.body.trim().slice(0, MAX_BODY) : ''
  const images = sanitizeImages(event.images)
  const tags = sanitizeTags(event.tags)
  const recordAtMs =
    typeof event.recordAtMs === 'number' && !Number.isNaN(event.recordAtMs)
      ? event.recordAtMs
      : Date.now()
  if (!body && images.length === 0 && tags.length === 0) {
    return { ok: false, error: '内容不能为空' }
  }
  const ur = await getUserDocRow(usersCol, ctx.OPENID)
  const { nick, avatar } = nickAvatarForAuthor(ur, { nick: '', avatar: '' })
  const addRes = await reportCol.add({
    data: {
      authorOpenId: ctx.OPENID,
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
  const partner = await getMutualPartnerOpenId(usersCol, ctx.OPENID)
  return {
    ok: true,
    post: toPublicReport({ ...raw, _id: newId }, newId, ctx.OPENID, partner),
  }
}

module.exports = createReport
