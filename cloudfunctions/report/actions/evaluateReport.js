/**
 * action: evaluateReport - 评价报备
 * @param {{ event: Record<string, unknown>, db: any, reportCol: any, usersCol: any, helpers: any }} ctx
 */
async function evaluateReport(ctx) {
  const { event, db, reportCol, usersCol, helpers } = ctx
  const { getReportDocForViewer, partnerStateFromDoc, toPublicReport, MAX_EVAL_TEXT } = helpers

  const id = typeof event.id === 'string' ? event.id.trim() : ''
  const rawText = typeof event.text === 'string' ? event.text : ''
  const text = rawText.trim().slice(0, MAX_EVAL_TEXT)
  if (!id) return { ok: false, error: '缺少 id' }
  if (!text) return { ok: false, error: '评价不能为空' }
  const vr = await getReportDocForViewer(reportCol, usersCol, ctx.OPENID, id)
  if (!vr.ok) return vr
  const doc = vr.doc
  const authorOpenId = typeof doc.authorOpenId === 'string' ? doc.authorOpenId : ''
  if (authorOpenId === ctx.OPENID) return { ok: false, error: '仅对象可评价' }
  const state = partnerStateFromDoc(doc)
  if (state !== 'read' && state !== 'evaluated') {
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
  return { ok: true, post: toPublicReport({ ...raw, _id: id }, id, ctx.OPENID, vr.partner) }
}

module.exports = evaluateReport
