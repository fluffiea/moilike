/**
 * 旧报备 → V1 餐食。纯映射，不碰存储。
 *
 * 源：旧环境集合 report_posts，由操作者导入新环境集合 legacy_reports。
 * 餐次按北京时间（UTC+8）切分，与小程序本地规则的钟点边界一致。
 * dayKey 用记录时刻的北京时间日历日，不把 0:00–5:00 并进前一天。
 */

const MAPPING_NOTES = [
  '旧集合 report_posts 导入为新环境 legacy_reports（保留 _id）。',
  'authorOpenId → authorOpenId；authorNickName / authorAvatarUrl 原样带上。',
  'body → text，截断 200。空正文允许。',
  'images[] 为 cloud:// fileID。跨环境无法直接读旧 fileID。',
  '请在旧环境对每张图 getTempFileURL，把 https 链接按相同顺序写入 imageTempUrls。',
  '迁移时下载 imageTempUrls 并上传到新云存储 meals/{openId}/legacy-{id}-{i}.jpg，meals.images 只写新 fileID。',
  '若 fileID 已属于当前环境则直接沿用。缺临时链接的记录不会写入，返回 needsMedia。',
  '没有图片的旧报备跳过（V1 至少 1 张）。',
  'recordAt → recordAt。餐次：北京时间 5:00–11:00 早餐，11:00–16:00 午餐，其余晚餐。',
  'dayKey 为 recordAt 的北京时间日历日（YYYY-MM-DD）。',
  'partnerReadAt → partnerReadAt。',
  'partnerEvalText → response.note（截断 50）；partnerEvaluatedAt → response.updatedAt。',
  '旧数据没有贴纸，sticker 留空。',
  'tags、评价以外的共鸣字段丢弃。浮生 dailies 不在 V1，不迁移。',
  '用 legacyReportId 去重，重复执行不会再插同一条。',
  '结伴不走这个函数：users.partnerOpenId 直接导入，或登录时读 legacy_users。',
].join('\n')

function pad2(n) {
  const v = Math.floor(Math.abs(n))
  return v < 10 ? '0' + v : String(v)
}

function inferSlot(hour, minute) {
  const mins = hour * 60 + minute
  if (mins >= 5 * 60 && mins < 11 * 60) return 'breakfast'
  if (mins >= 11 * 60 && mins < 16 * 60) return 'lunch'
  return 'dinner'
}

function shanghaiParts(ms) {
  const shifted = new Date(ms + 8 * 3600 * 1000)
  return {
    y: shifted.getUTCFullYear(),
    mo: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    h: shifted.getUTCHours(),
    mi: shifted.getUTCMinutes(),
  }
}

function dayKeyFromParts(parts) {
  return parts.y + '-' + pad2(parts.mo) + '-' + pad2(parts.day)
}

function cleanText(value, max) {
  if (typeof value !== 'string') return ''
  const stripped = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim()
  return stripped.length > max ? stripped.slice(0, max) : stripped
}

function toMs(value) {
  if (value instanceof Date) {
    const t = value.getTime()
    return Number.isNaN(t) ? 0 : t
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? 0 : parsed
  }
  if (value && typeof value === 'object') {
    if (Object.prototype.hasOwnProperty.call(value, '$date')) return toMs(value.$date)
    if (typeof value.getTime === 'function') return toMs(value.getTime())
  }
  return 0
}

function mapLegacyReport(doc) {
  if (!doc || typeof doc !== 'object') return { ok: false, reason: 'empty' }
  const legacyReportId = doc._id != null ? String(doc._id) : ''
  if (!legacyReportId) return { ok: false, reason: 'no-id' }
  const authorOpenId = typeof doc.authorOpenId === 'string' ? doc.authorOpenId.trim() : ''
  if (!authorOpenId) return { ok: false, reason: 'no-author' }
  const recordAtMs = toMs(doc.recordAt)
  if (!recordAtMs) return { ok: false, reason: 'bad-time' }
  const rawImages = Array.isArray(doc.images) ? doc.images : []
  const images = []
  for (let i = 0; i < rawImages.length && images.length < 9; i++) {
    const item = rawImages[i]
    if (typeof item === 'string' && item.indexOf('cloud://') === 0) images.push(item)
  }
  if (images.length === 0) return { ok: false, reason: 'no-image' }
  const temps = Array.isArray(doc.imageTempUrls) ? doc.imageTempUrls : []
  const sources = []
  for (let i = 0; i < images.length; i++) {
    const tempUrl = typeof temps[i] === 'string' ? temps[i].trim() : ''
    sources.push({ fileID: images[i], tempUrl: tempUrl })
  }
  const parts = shanghaiParts(recordAtMs)
  const note = cleanText(doc.partnerEvalText, 50)
  const evaluatedMs = toMs(doc.partnerEvaluatedAt)
  let response = null
  if (note || evaluatedMs) {
    response = {
      sticker: '',
      note: note,
      updatedAtMs: evaluatedMs || recordAtMs,
    }
  }
  return {
    ok: true,
    meal: {
      legacyReportId: legacyReportId,
      authorOpenId: authorOpenId,
      authorNickName: cleanText(doc.authorNickName, 32),
      authorAvatarUrl: typeof doc.authorAvatarUrl === 'string' ? doc.authorAvatarUrl.slice(0, 2048) : '',
      text: cleanText(doc.body, 200),
      slot: inferSlot(parts.h, parts.mi),
      dayKey: dayKeyFromParts(parts),
      recordAtMs: recordAtMs,
      partnerReadAtMs: toMs(doc.partnerReadAt),
      response: response,
      sources: sources,
    },
  }
}

module.exports = {
  MAPPING_NOTES,
  inferSlot,
  shanghaiParts,
  dayKeyFromParts,
  cleanText,
  toMs,
  mapLegacyReport,
}
