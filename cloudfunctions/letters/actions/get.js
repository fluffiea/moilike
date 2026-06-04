/**
 * action: get - 信件详情
 * @param {{ event: Record<string, unknown>, lettersCol: any, helpers: any, OPENID: string }} ctx
 */
async function get(ctx) {
  const { event, lettersCol, helpers, OPENID } = ctx
  const { toPublicLetter, isLetterParticipant } = helpers

  const id = typeof event.id === 'string' ? event.id : ''
  if (!id) {
    return { ok: false, error: '缺少 id' }
  }

  let doc
  try {
    const r = await lettersCol.doc(id).get()
    doc = r.data
  } catch {
    return { ok: false, error: '信件不存在' }
  }

  if (!doc) {
    return { ok: false, error: '信件不存在' }
  }

  if (!isLetterParticipant(doc, OPENID)) {
    return { ok: false, error: '无权查看' }
  }

  return { ok: true, letter: toPublicLetter({ ...doc, _id: id }, OPENID) }
}

module.exports = get
