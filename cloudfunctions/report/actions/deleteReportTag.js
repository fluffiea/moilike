/**
 * action: deleteReportTag - 删除自定义标签
 * @param {{ event: Record<string, unknown>, usersCol: any, helpers: any }} ctx
 */
async function deleteReportTag(ctx) {
  const { event, usersCol, helpers } = ctx
  const { getUserDocRow } = require('../common/utils')
  const { MAX_TAG_LEN, DEFAULT_TAG, mergeDefaultTags } = helpers

  const rawTag = typeof event.tag === 'string' ? event.tag.trim().slice(0, MAX_TAG_LEN) : ''
  if (!rawTag) return { ok: false, error: '标签不能为空' }
  if (rawTag === DEFAULT_TAG) return { ok: false, error: '默认标签不可删除' }

  const row = await getUserDocRow(usersCol, ctx.OPENID)
  if (!row || typeof row !== 'object') return { ok: false, error: '用户不存在' }
  const openIdKey =
    typeof row.openId === 'string' && row.openId.trim() ? row.openId.trim() : ctx.OPENID

  let custom = []
  if (Array.isArray(row.reportTags)) {
    for (let i = 0; i < row.reportTags.length; i++) {
      const s =
        typeof row.reportTags[i] === 'string'
          ? row.reportTags[i].trim().slice(0, MAX_TAG_LEN)
          : ''
      if (!s || custom.indexOf(s) >= 0) continue
      custom.push(s)
    }
  }

  const idx = custom.indexOf(rawTag)
  if (idx < 0) return { ok: true, tags: mergeDefaultTags(custom) }

  custom.splice(idx, 1)
  await usersCol.doc(openIdKey).update({ data: { reportTags: custom } })
  return { ok: true, tags: mergeDefaultTags(custom) }
}

module.exports = deleteReportTag
