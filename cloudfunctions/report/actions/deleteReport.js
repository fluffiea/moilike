/**
 * action: deleteReport - 删除报备
 * @param {{ event: Record<string, unknown>, reportCol: any }} ctx
 */
async function deleteReport(ctx) {
  const { event, reportCol } = ctx

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
  if (aid !== ctx.OPENID) return { ok: false, error: '只能删除自己的报备' }
  await reportCol.doc(id).remove()
  return { ok: true }
}

module.exports = deleteReport
