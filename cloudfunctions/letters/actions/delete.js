/**
 * action: delete - 删除信件（仅发送者可删）
 * @param {{ event: Record<string, unknown>, lettersCol: any, OPENID: string }} ctx
 */
async function del(ctx) {
  const { event, lettersCol, OPENID } = ctx

  const id = typeof event.id === 'string' ? event.id : ''
  if (!id) return { ok: false, error: '缺少 id' }

  let existing
  try {
    const r = await lettersCol.doc(id).get()
    existing = r.data
  } catch {
    return { ok: false, error: '信件不存在' }
  }
  if (!existing) return { ok: false, error: '信件不存在' }

  const sid = typeof existing.senderId === 'string' ? existing.senderId : ''
  if (sid !== OPENID) {
    return { ok: false, error: '只能删除自己发出的信件' }
  }

  await lettersCol.doc(id).remove()
  return { ok: true }
}

module.exports = del
