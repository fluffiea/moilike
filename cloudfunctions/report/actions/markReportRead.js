/**
 * action: markReportRead - 标记已阅
 * @param {{ event: Record<string, unknown>, db: any, reportCol: any, usersCol: any, helpers: any }} ctx
 */
async function markReportRead(ctx) {
  const { event, db, reportCol, usersCol, helpers } = ctx
  const { getReportDocForViewer, partnerStateFromDoc, toPublicReport } = helpers

  const id = typeof event.id === 'string' ? event.id.trim() : ''
  if (!id) return { ok: false, error: '缺少 id' }
  const vr = await getReportDocForViewer(reportCol, usersCol, ctx.OPENID, id)
  if (!vr.ok) return vr
  const doc = vr.doc
  const authorOpenId = typeof doc.authorOpenId === 'string' ? doc.authorOpenId : ''
  if (authorOpenId === ctx.OPENID) return { ok: false, error: '仅对象可标记已阅' }
  if (partnerStateFromDoc(doc) !== 'pending_read') {
    return { ok: false, error: '当前状态不可标记已阅' }
  }
  await reportCol.doc(id).update({
    data: { partnerReadAt: db.serverDate(), updatedAt: db.serverDate() },
  })
  const got = await reportCol.doc(id).get()
  const raw = got.data || {}
  return { ok: true, post: toPublicReport({ ...raw, _id: id }, id, ctx.OPENID, vr.partner) }
}

module.exports = markReportRead
