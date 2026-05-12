/**
 * action: listReportTags - 标签列表
 * @param {{ usersCol: any, helpers: any }} ctx
 */
async function listReportTags(ctx) {
  const { usersCol, helpers } = ctx
  const { getUserDocRow } = require('../../common/utils')
  const { mergeDefaultTags } = helpers
  const row = await getUserDocRow(usersCol, ctx.OPENID)
  const raw = row && typeof row === 'object' && row.reportTags ? row.reportTags : []
  return { ok: true, tags: mergeDefaultTags(raw) }
}

module.exports = listReportTags
