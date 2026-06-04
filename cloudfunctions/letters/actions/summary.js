/**
 * action: summary - 获取信件汇总（总数 + 最近 3 条标题）
 * 供朝夕页信件入口卡片使用。
 * @param {{ event: Record<string, unknown>, db: any, _: any, lettersCol: any, helpers: any, OPENID: string }} ctx
 */
async function summary(ctx) {
  const { db, _, lettersCol, helpers, OPENID } = ctx
  const { toPublicLetter } = helpers

  const query = _.or([
    { senderId: OPENID },
    { receiverId: OPENID },
  ])

  const [countRes, listRes] = await Promise.all([
    lettersCol.where(query).count(),
    lettersCol
      .where(query)
      .orderBy('createdAt', 'desc')
      .limit(3)
      .get(),
  ])

  const total = countRes.total || 0
  const rawList = listRes.data || []
  const recent = rawList.map((doc) => toPublicLetter({ ...doc }, OPENID))

  return { ok: true, total, recent }
}

module.exports = summary
