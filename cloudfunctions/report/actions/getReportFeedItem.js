/**
 * action: getReportFeedItem - 获取报备动态卡片（委托 getReport）
 * @param {{ event: Record<string, unknown> }} ctx
 */
async function getReportFeedItem(ctx) {
  const { event } = ctx
  let rawId = ''
  if (typeof event.id === 'string') rawId = event.id
  else if (typeof event.postId === 'string') rawId = event.postId
  const id = rawId.trim()
  if (!id) return { ok: false, error: '缺少 id' }
  const getReport = require('./getReport')
  return getReport({ ...ctx, event: { ...event, action: 'getReport', id } })
}

module.exports = getReportFeedItem
