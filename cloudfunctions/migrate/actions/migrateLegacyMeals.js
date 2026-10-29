const { mapLegacyReport } = require('../mapping')
const { rewriteSources } = require('../media')

function isCollectionMissing(err) {
  if (!err) return false
  const msg = String(err.errMsg || err.message || '').toLowerCase()
  return (
    msg.indexOf('database_collection_not_exist') >= 0 ||
    msg.indexOf('db or table not exist') >= 0 ||
    msg.indexOf('collection not exist') >= 0 ||
    msg.indexOf('collection_not_exists') >= 0
  )
}

async function migrateLegacyMeals(ctx) {
  const { event, db, cloud } = ctx
  const dryRun = event.dryRun === true
  let limit = 3
  if (typeof event.limit === 'number' && event.limit >= 1 && event.limit <= 10) {
    limit = Math.floor(event.limit)
  }
  let offset = 0
  if (typeof event.offset === 'number' && event.offset >= 0) offset = Math.floor(event.offset)

  let rows = []
  try {
    const res = await db.collection('legacy_reports').skip(offset).limit(limit).get()
    rows = res.data || []
  } catch (err) {
    if (isCollectionMissing(err)) {
      return { ok: false, error: '请先把旧 report_posts 导入集合 legacy_reports' }
    }
    throw err
  }

  const envId = cloud.getWXContext ? cloud.getWXContext().ENV || '' : ''
  const mealsCol = db.collection('meals')
  let created = 0
  let skippedExisting = 0
  let skippedNoImage = 0
  const needsMedia = []
  const skipped = []
  const planned = []
  const failed = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const mapped = mapLegacyReport(row)
    const id = row && row._id ? String(row._id) : ''
    if (!mapped.ok) {
      if (mapped.reason === 'no-image') skippedNoImage += 1
      skipped.push({ id: id, reason: mapped.reason })
      continue
    }
    const meal = mapped.meal
    if (dryRun) {
      planned.push({
        legacyReportId: meal.legacyReportId,
        dayKey: meal.dayKey,
        slot: meal.slot,
        text: meal.text,
        imageCount: meal.sources.length,
        tempUrlCount: meal.sources.filter((item) => item.tempUrl).length,
      })
      continue
    }
    try {
      const dup = await mealsCol.where({ legacyReportId: meal.legacyReportId }).limit(1).get()
      if (dup.data && dup.data.length > 0) {
        skippedExisting += 1
        continue
      }
      const rewritten = await rewriteSources(cloud, meal.sources, meal.authorOpenId, meal.legacyReportId, envId)
      if (rewritten.pending.length > 0 || rewritten.images.length !== meal.sources.length) {
        needsMedia.push({ id: meal.legacyReportId, fileIDs: rewritten.pending })
        continue
      }
      const response = meal.response
        ? {
            sticker: '',
            note: meal.response.note,
            updatedAt: new Date(meal.response.updatedAtMs),
          }
        : null
      await mealsCol.add({
        data: {
          legacyReportId: meal.legacyReportId,
          source: 'legacy',
          authorOpenId: meal.authorOpenId,
          authorNickName: meal.authorNickName,
          authorAvatarUrl: meal.authorAvatarUrl,
          images: rewritten.images,
          text: meal.text,
          slot: meal.slot,
          dayKey: meal.dayKey,
          recordAt: new Date(meal.recordAtMs),
          partnerReadAt: meal.partnerReadAtMs ? new Date(meal.partnerReadAtMs) : null,
          response: response,
          createdAt: new Date(meal.recordAtMs),
          migratedAt: db.serverDate(),
          updatedAt: db.serverDate(),
        },
      })
      created += 1
    } catch (err) {
      failed.push({ id: meal.legacyReportId, error: err && err.message ? String(err.message) : '失败' })
    }
  }

  return {
    ok: true,
    dryRun: dryRun,
    scanned: rows.length,
    created: created,
    skippedExisting: skippedExisting,
    skippedNoImage: skippedNoImage,
    skipped: skipped,
    needsMedia: needsMedia,
    planned: planned,
    failed: failed,
    nextOffset: offset + rows.length,
    done: rows.length < limit,
  }
}

module.exports = migrateLegacyMeals
