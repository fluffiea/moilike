/**
 * action: deleteDaily - 删除日常
 * @param {{ event: Record<string, unknown>, dailyCol: any }} ctx
 */
async function deleteDaily(ctx) {
  const { event, dailyCol } = ctx
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
  if (aid !== ctx.OPENID) {
    return { ok: false, error: '只能删除自己的日常' }
  }
  await dailyCol.doc(id).remove()
  return { ok: true }
}

module.exports = deleteDaily
