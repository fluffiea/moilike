/**
 * 批量把 legacy_users 写成 users 结伴。登录时的 ensureUserFromLegacy 不需要口令。
 * 云开发控制台为该云函数配置环境变量 MIGRATE_KEY 后，调用时传入相同 key。
 */
async function migrateLegacyPairs(ctx) {
  const { event, db, usersCol, helpers } = ctx
  const denied = helpers.rejectMigrateKey(event)
  if (denied) return denied

  let limit = 10
  if (typeof event.limit === 'number' && event.limit >= 1 && event.limit <= 50) {
    limit = Math.floor(event.limit)
  }
  let offset = 0
  if (typeof event.offset === 'number' && event.offset >= 0) offset = Math.floor(event.offset)

  let rows = []
  try {
    const res = await db.collection(helpers.LEGACY_USERS).skip(offset).limit(limit).get()
    rows = res.data || []
  } catch (err) {
    if (helpers.isCollectionMissing(err)) {
      return { ok: false, error: '请先把旧 users 导入集合 legacy_users' }
    }
    throw err
  }

  let paired = 0
  let unpaired = 0
  const failed = []
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const openId =
      row && typeof row.openId === 'string' && row.openId.trim()
        ? row.openId.trim()
        : row && row._id
          ? String(row._id)
          : ''
    if (!openId) {
      unpaired += 1
      continue
    }
    try {
      const doc = await helpers.ensureUserFromLegacy(db, usersCol, openId)
      if (doc && helpers.partnerIdOf(doc)) paired += 1
      else unpaired += 1
    } catch (err) {
      failed.push({ openId: openId, error: err && err.message ? String(err.message) : '失败' })
    }
  }

  return {
    ok: true,
    scanned: rows.length,
    paired: paired,
    unpaired: unpaired,
    failed: failed,
    nextOffset: offset + rows.length,
    done: rows.length < limit,
  }
}

module.exports = migrateLegacyPairs
