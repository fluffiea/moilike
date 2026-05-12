/**
 * action: updateReport - 编辑报备
 * @param {{ event: Record<string, unknown>, db: any, reportCol: any, usersCol: any, helpers: any }} ctx
 */
async function updateReport(ctx) {
  const { event, db, reportCol, usersCol, helpers } = ctx
  const { getUserDocRow, getMutualPartnerOpenId } = require('../../common/utils')
  const { sanitizeImages } = require('../../common/utils')
  const { sanitizeTags, nickAvatarForAuthor, toPublicReport, MAX_BODY } = helpers

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
  if (aid !== ctx.OPENID) return { ok: false, error: '只能编辑自己的报备' }

  const body = typeof event.body === 'string' ? event.body.trim().slice(0, MAX_BODY) : ''
  const images = sanitizeImages(event.images)
  const tags = sanitizeTags(event.tags)
  const recordAtMs =
    typeof event.recordAtMs === 'number' && !Number.isNaN(event.recordAtMs)
      ? event.recordAtMs
      : null
  if (!body && images.length === 0 && tags.length === 0) {
    return { ok: false, error: '内容不能为空' }
  }
  const ur = await getUserDocRow(usersCol, ctx.OPENID)
  const { nick, avatar } = nickAvatarForAuthor(ur, {
    nick: typeof existing.authorNickName === 'string' ? existing.authorNickName : '',
    avatar: typeof existing.authorAvatarUrl === 'string' ? existing.authorAvatarUrl : '',
  })
  const patch = {
    body,
    images,
    tags,
    authorNickName: nick,
    authorAvatarUrl: avatar,
    updatedAt: db.serverDate(),
  }
  if (recordAtMs != null) patch.recordAt = new Date(recordAtMs)
  await reportCol.doc(id).update({ data: patch })
  const got = await reportCol.doc(id).get()
  const raw = got.data || {}
  const partner = await getMutualPartnerOpenId(usersCol, ctx.OPENID)
  return { ok: true, post: toPublicReport({ ...raw, _id: id }, id, ctx.OPENID, partner) }
}

module.exports = updateReport
