/**
 * action: getReport - 获取单条报备详情
 * @param {{ event: Record<string, unknown>, reportCol: any, usersCol: any, helpers: any }} ctx
 */
async function getReport(ctx) {
  const { event, reportCol, usersCol, helpers } = ctx
  const { toPublicReport, getReportDocForViewer } = helpers

  const id = typeof event.id === 'string' ? event.id.trim() : ''
  if (!id) return { ok: false, error: '缺少 id' }
  const vr = await getReportDocForViewer(reportCol, usersCol, ctx.OPENID, id)
  if (!vr.ok) return vr
  return { ok: true, post: toPublicReport(vr.doc, id, ctx.OPENID, vr.partner) }
}

module.exports = getReport
