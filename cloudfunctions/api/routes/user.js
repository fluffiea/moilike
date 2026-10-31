const { fail, text, id, toMs, getDoc, isCollectionMissing, isNotFound } = require('../lib/util')
const { partnerIdOf } = require('../lib/context')
const media = require('../lib/media')
const { REPORT_FILTERS, publicUser, freshUser } = require('../lib/profile')

const BIND_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

async function me(ctx) {
  return { user: (await publicUser(ctx)).user }
}

async function saveProfile(ctx, e) {
  const nickName = text(e.nickName, 32)
  if (!nickName) fail('INVALID', '请填写昵称')
  const existing = await ctx.me()
  const avatarIn = id(e.avatarFileId)
  const avatarUrl = avatarIn.startsWith('cloud://') ? avatarIn : (existing && existing.avatarUrl) || ''
  if (!avatarUrl) fail('INVALID', '请选择头像')

  const patch = { nickName, avatarUrl, updatedAt: ctx.db.serverDate() }
  if (typeof e.signature === 'string') patch.signature = text(e.signature, 120)
  const doc = ctx.col.users.doc(ctx.openid)
  if (existing) {
    await doc.update({ data: patch })
  } else {
    await doc.set({
      data: { openId: ctx.openid, signature: '', partnerOpenId: null, createdAt: ctx.db.serverDate(), ...patch },
    })
  }
  return { user: await freshUser(ctx) }
}

async function savePreferences(ctx, e) {
  await ctx.viewer()
  const raw = e.preferences && e.preferences.resonanceReportFilter
  if (!REPORT_FILTERS.includes(raw)) fail('INVALID', '无效的偏好设置')
  await ctx.col.users.doc(ctx.openid).update({
    data: { preferences: { resonanceReportFilter: raw }, updatedAt: ctx.db.serverDate() },
  })
  return { user: await freshUser(ctx) }
}

async function setTogetherSince(ctx, e) {
  const { partnerId } = await ctx.requirePartner()
  const raw = Number(e.togetherSinceMs)
  if (!Number.isFinite(raw)) fail('INVALID', '时间无效')
  const since = Math.floor(raw / 60000) * 60000
  if (since > Date.now() + 120000) fail('INVALID', '不能选择未来的时间')
  if (since < new Date(1970, 0, 2).getTime()) fail('INVALID', '日期太早了')

  const data = { togetherSinceMs: since, updatedAt: ctx.db.serverDate() }
  await Promise.all([
    ctx.col.users.doc(ctx.openid).update({ data }),
    ctx.col.users.doc(partnerId).update({ data }),
  ])
  return { user: await freshUser(ctx) }
}

/** bind_requests 集合可能还没建（第一次有人申请前），按空处理 */
async function pendingRequests(ctx, where, limit) {
  try {
    const r = await ctx.col.binds.where({ ...where, status: 'pending' }).limit(limit).get()
    return r.data || []
  } catch (e) {
    if (isCollectionMissing(e)) return []
    throw e
  }
}

async function ensureBindCode(ctx, me) {
  const existing = typeof me.bindCode === 'string' ? me.bindCode.trim().toUpperCase() : ''
  if (existing.length >= 6) return existing
  for (let attempt = 0; attempt < 16; attempt++) {
    let code = ''
    for (let i = 0; i < 8; i++) code += BIND_ALPHABET[Math.floor(Math.random() * BIND_ALPHABET.length)]
    const hit = await ctx.col.users.where({ bindCode: code }).count()
    if (hit.total > 0) continue
    await ctx.col.users.doc(ctx.openid).update({ data: { bindCode: code, updatedAt: ctx.db.serverDate() } })
    return code
  }
  return fail('INTERNAL', '生成绑定码失败，请稍后重试')
}

async function partnerPanel(ctx) {
  const { me } = await ctx.viewer()
  const [bindCode, outRows, inRows] = await Promise.all([
    ensureBindCode(ctx, me),
    pendingRequests(ctx, { fromOpenId: ctx.openid }, 1),
    pendingRequests(ctx, { toOpenId: ctx.openid }, 20),
  ])
  const avatarIds = [...outRows.map((r) => r.toAvatarUrl), ...inRows.map((r) => r.fromAvatarUrl)]
  const { user, urls } = await publicUser(ctx, avatarIds)
  const out = outRows[0]
  return {
    user,
    bindCode,
    outbound: out
      ? { id: out._id, name: out.toNickName || '对方', avatarUrl: media.avatar(out.toAvatarUrl, urls), createdAtMs: toMs(out.createdAt) }
      : null,
    inbound: inRows
      .map((r) => ({
        id: r._id,
        name: r.fromNickName || '用户',
        avatarUrl: media.avatar(r.fromAvatarUrl, urls),
        createdAtMs: toMs(r.createdAt),
      }))
      .sort((a, b) => b.createdAtMs - a.createdAtMs),
  }
}

async function requestBind(ctx, e) {
  const code = typeof e.bindCode === 'string' ? e.bindCode.replace(/\s+/g, '').toUpperCase() : ''
  if (code.length < 6) fail('INVALID', '请输入对方的绑定码')
  const { me, partnerId } = await ctx.viewer()
  if (partnerId) fail('ALREADY_BOUND', '你已经有结伴对象了')
  if ((await pendingRequests(ctx, { fromOpenId: ctx.openid }, 1)).length > 0) {
    fail('PENDING', '你已发出申请，请等待对方回应')
  }
  const hit = await ctx.col.users.where({ bindCode: code }).limit(2).get()
  if (hit.data.length !== 1) fail('NOT_FOUND', '没有找到这个绑定码')
  const target = hit.data[0]
  const targetId = target.openId || target._id
  if (targetId === ctx.openid) fail('INVALID', '不能和自己结伴')
  if (partnerIdOf(target)) fail('ALREADY_BOUND', '对方已经有结伴对象了')

  await ctx.col.binds.add({
    data: {
      fromOpenId: ctx.openid,
      toOpenId: targetId,
      fromNickName: me.nickName || '未命名',
      fromAvatarUrl: me.avatarUrl || '',
      toNickName: target.nickName || '未命名',
      toAvatarUrl: target.avatarUrl || '',
      status: 'pending',
      createdAt: ctx.db.serverDate(),
    },
  })
  return null
}

async function voidPendingForPair(ctx, a, b) {
  const { _ } = ctx
  try {
    await ctx.col.binds
      .where(_.and([{ status: 'pending' }, _.or([{ fromOpenId: _.in([a, b]) }, { toOpenId: _.in([a, b]) }])]))
      .update({ data: { status: 'voided', closedAt: ctx.db.serverDate() } })
  } catch (e) {
    console.error('voidPendingForPair', e)
  }
}

async function respondBind(ctx, e) {
  const requestId = id(e.requestId)
  if (!requestId) fail('INVALID', '缺少申请')
  const { partnerId } = await ctx.viewer()
  const req = await getDoc(ctx.col.binds, requestId)
  if (!req || req.toOpenId !== ctx.openid) fail('NOT_FOUND', '申请不存在或已失效')
  if (req.status !== 'pending') fail('HANDLED', '这条申请已经处理过了')

  if (e.accept !== true) {
    await ctx.col.binds.doc(requestId).update({ data: { status: 'rejected', respondedAt: ctx.db.serverDate() } })
    return { user: await freshUser(ctx) }
  }

  const fromId = req.fromOpenId
  const now = ctx.db.serverDate()
  const from = await getDoc(ctx.col.users, fromId)
  if (!from) fail('NOT_FOUND', '对方资料不存在')
  if (partnerId || partnerIdOf(from)) {
    await ctx.col.binds.doc(requestId).update({ data: { status: 'voided', closedAt: now } })
    fail('ALREADY_BOUND', '对方状态已变化，无法接受')
  }
  // 事务内再校验一次，防止两条申请被同时同意
  try {
    await ctx.db.runTransaction(async (t) => {
      const users = t.collection('users')
      const [from, to] = await Promise.all([users.doc(fromId).get(), users.doc(ctx.openid).get()])
      if (partnerIdOf(from.data) || partnerIdOf(to.data)) fail('ALREADY_BOUND', '对方状态已变化，无法接受')
      // togetherSinceMs 置空：新的一对需要重新设置纪念日
      const reset = { togetherSinceMs: null, partner: null, updatedAt: now }
      await users.doc(fromId).update({ data: { partnerOpenId: ctx.openid, ...reset } })
      await users.doc(ctx.openid).update({ data: { partnerOpenId: fromId, ...reset } })
      await t.collection('bind_requests').doc(requestId).update({ data: { status: 'accepted', respondedAt: now } })
    })
  } catch (err) {
    if (err && err.code === 'ALREADY_BOUND') {
      await ctx.col.binds.doc(requestId).update({ data: { status: 'voided', closedAt: now } })
    }
    if (isNotFound(err)) fail('NOT_FOUND', '对方资料不存在')
    throw err
  }
  await voidPendingForPair(ctx, fromId, ctx.openid)
  return { user: await freshUser(ctx) }
}

module.exports = {
  me,
  saveProfile,
  savePreferences,
  setTogetherSince,
  partnerPanel,
  requestBind,
  respondBind,
}
