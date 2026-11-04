const { fail, text, id, toMs, cloudFileIds, getDoc } = require('../lib/util')
const { pageByTime } = require('../lib/paging')
const media = require('../lib/media')

const PAGE_SIZE = 10
const MAX_BODY = 2000
const MAX_IMAGES = 9
const MAX_TAG_LEN = 16
const MAX_TAGS_PER_POST = 10
const MAX_CUSTOM_TAGS = 20
const DEFAULT_TAG = '干饭'
const FILTERS = ['all', 'await_me', 'mine', 'echoed']
/** 与 src/core/stickers.ts 的 id 保持一致 */
const STICKER_IDS = ['care', 'seen', 'eat', 'miss', 'ok', 'hug', 'proud', 'love']

function uniqueTags(arr, max) {
  const out = []
  for (const raw of Array.isArray(arr) ? arr : []) {
    const t = text(raw, MAX_TAG_LEN)
    if (t && !out.includes(t)) out.push(t)
    if (out.length >= max) break
  }
  return out
}

/** 默认标签恒在首位，其余为用户自定义 */
function tagOptions(userDoc) {
  const custom = uniqueTags(userDoc && userDoc.reportTags, MAX_CUSTOM_TAGS).filter((t) => t !== DEFAULT_TAG)
  return [DEFAULT_TAG, ...custom]
}

function stickerIdOf(doc) {
  return STICKER_IDS.includes(doc.partnerStickerId) ? doc.partnerStickerId : ''
}

/** 贴纸或旧文字评价都算已回应；只打开详情不单独成状态 */
function stateOf(doc) {
  if (stickerIdOf(doc) || toMs(doc.partnerEvaluatedAt)) return 'responded'
  return 'awaiting_response'
}

function awaitingCond(_, partnerId) {
  return {
    authorOpenId: partnerId,
    partnerStickerId: _.eq(null),
    partnerEvaluatedAt: _.eq(null),
  }
}

/** 对方发给我、且还没贴纸（旧评价也算出清）的条数 */
async function countAwaiting(ctx, partnerId) {
  if (!partnerId) return 0
  const res = await ctx.col.reports.where(awaitingCond(ctx._, partnerId)).count()
  return res.total || 0
}

function postView(ctx, doc, partnerId, people, urls) {
  const isMine = doc.authorOpenId === ctx.openid
  const fromPartner = !isMine && !!partnerId && doc.authorOpenId === partnerId
  return {
    id: doc._id,
    isMine,
    author: people.view(doc.authorOpenId, urls),
    body: doc.body || '',
    tags: uniqueTags(doc.tags, MAX_TAGS_PER_POST),
    images: media.images(cloudFileIds(doc.images, MAX_IMAGES), urls),
    recordAtMs: toMs(doc.recordAt),
    createdAtMs: toMs(doc.createdAt),
    state: stateOf(doc),
    partnerOpenedAt: toMs(doc.partnerOpenedAt) || toMs(doc.partnerReadAt) || 0,
    partnerStickerId: stickerIdOf(doc),
    partnerRespondedAt: toMs(doc.partnerRespondedAt) || toMs(doc.partnerEvaluatedAt) || 0,
    canRespond: fromPartner,
  }
}

async function render(ctx, docs, partnerId) {
  const people = await ctx.people()
  const fileIds = [...people.avatarIds]
  for (const d of docs) fileIds.push(...cloudFileIds(d.images, MAX_IMAGES))
  const urls = await media.sign(ctx.cloud, fileIds)
  return docs.map((d) => postView(ctx, d, partnerId, people, urls))
}

async function visiblePost(ctx, postId) {
  const v = await ctx.viewer()
  const doc = await getDoc(ctx.col.reports, postId)
  if (!doc) fail('NOT_FOUND', '这条报备不存在或已删除')
  if (!v.ids.includes(doc.authorOpenId)) fail('FORBIDDEN', '无权查看这条报备')
  return { doc, partnerId: v.partnerId }
}

async function ownPost(ctx, postId) {
  const r = await visiblePost(ctx, postId)
  if (r.doc.authorOpenId !== ctx.openid) fail('FORBIDDEN', '只能操作自己的报备')
  return r
}

/** 对方发的报备，打开和回心都走这里 */
async function partnerPost(ctx, postId) {
  const r = await visiblePost(ctx, postId)
  if (r.doc.authorOpenId === ctx.openid || r.doc.authorOpenId !== r.partnerId) {
    fail('FORBIDDEN', '只有对方可以回应这条报备')
  }
  return r
}

/** 已共鸣：已回心的报备（有效贴纸或旧文字评价任一存在），只读档案用 */
function echoedOr(_) {
  return [{ partnerStickerId: _.in(STICKER_IDS) }, { partnerEvaluatedAt: _.neq(null) }]
}

async function list(ctx, e) {
  const { _ } = ctx
  const { ids, partnerId } = await ctx.viewer()
  const filter = FILTERS.includes(e.filter) ? e.filter : 'all'
  let where = { authorOpenId: _.in(ids) }
  if (filter === 'mine') where = { authorOpenId: ctx.openid }
  if (filter === 'echoed') {
    const { docs, nextCursor } = await pageByTime({
      col: ctx.col.reports,
      _,
      where,
      or: echoedOr(_),
      field: 'recordAt',
      cursor: e.cursor,
      size: PAGE_SIZE,
    })
    // 档案页不需要待回计数，省掉一次 count 查询
    return { items: await render(ctx, docs, partnerId), nextCursor, awaitMeCount: 0 }
  }
  if (filter === 'await_me') {
    const awaitMeCount = await countAwaiting(ctx, partnerId)
    if (!partnerId) return { items: [], nextCursor: '', awaitMeCount: 0 }
    where = awaitingCond(_, partnerId)
    const { docs, nextCursor } = await pageByTime({
      col: ctx.col.reports,
      _,
      where,
      field: 'recordAt',
      cursor: e.cursor,
      size: PAGE_SIZE,
    })
    return { items: await render(ctx, docs, partnerId), nextCursor, awaitMeCount }
  }
  const { docs, nextCursor } = await pageByTime({
    col: ctx.col.reports,
    _,
    where,
    field: 'recordAt',
    cursor: e.cursor,
    size: PAGE_SIZE,
  })
  return { items: await render(ctx, docs, partnerId), nextCursor, awaitMeCount: await countAwaiting(ctx, partnerId) }
}

async function get(ctx, e) {
  const { doc, partnerId } = await visiblePost(ctx, id(e.id))
  const [post] = await render(ctx, [doc], partnerId)
  return { post }
}

function readPostInput(e) {
  const input = {
    body: text(e.body, MAX_BODY),
    images: cloudFileIds(e.images, MAX_IMAGES),
    tags: uniqueTags(e.tags, MAX_TAGS_PER_POST),
  }
  if (!input.body && input.images.length === 0 && input.tags.length === 0) fail('INVALID', '写点内容、选个标签或配张图吧')
  const ms = Number(e.recordAtMs)
  if (Number.isFinite(ms) && ms > 0) {
    const recordAtMs = Math.floor(ms / 60000) * 60000
    if (recordAtMs > Date.now() + 60000) fail('INVALID', '不能记录未来的时间')
    input.recordAt = new Date(recordAtMs)
  }
  return input
}

async function create(ctx, e) {
  const { partnerId } = await ctx.viewer()
  const input = readPostInput(e)
  const now = new Date()
  const data = {
    authorOpenId: ctx.openid,
    recordAt: now,
    ...input,
    partnerOpenedAt: null,
    partnerStickerId: null,
    partnerRespondedAt: null,
    partnerReadAt: null,
    partnerEvalText: '',
    partnerEvaluatedAt: null,
    createdAt: now,
    updatedAt: now,
  }
  const res = await ctx.col.reports.add({ data })
  const [post] = await render(ctx, [{ ...data, _id: res._id }], partnerId)
  return { post }
}

async function update(ctx, e) {
  const { doc, partnerId } = await ownPost(ctx, id(e.id))
  const input = readPostInput(e)
  // 只改正文、图、标签和时间，对方的打开与贴纸原样保留
  await ctx.col.reports.doc(doc._id).update({ data: { ...input, updatedAt: ctx.db.serverDate() } })
  const [post] = await render(ctx, [{ ...doc, ...input }], partnerId)
  return { post }
}

async function remove(ctx, e) {
  const { doc } = await ownPost(ctx, id(e.id))
  await ctx.col.reports.doc(doc._id).remove()
  return null
}

/** 进详情时静默记下打开时间；已打开则不改时间，也不动贴纸 */
async function open(ctx, e) {
  const { doc, partnerId } = await partnerPost(ctx, id(e.id))
  if (toMs(doc.partnerOpenedAt) || toMs(doc.partnerReadAt)) {
    const [post] = await render(ctx, [doc], partnerId)
    return { post }
  }
  const now = new Date()
  const patch = { partnerOpenedAt: now, partnerReadAt: now, updatedAt: now }
  await ctx.col.reports.doc(doc._id).update({ data: patch })
  const [post] = await render(ctx, [{ ...doc, ...patch }], partnerId)
  return { post }
}

/** 贴一张贴纸 = 已阅 + 轻回应；再贴覆盖上一张，只留最新 */
async function respond(ctx, e) {
  const stickerId = id(e.stickerId)
  if (!STICKER_IDS.includes(stickerId)) fail('INVALID', '没有这张贴纸')
  const { doc, partnerId } = await partnerPost(ctx, id(e.id))
  const now = new Date()
  const patch = {
    partnerStickerId: stickerId,
    partnerRespondedAt: now,
    updatedAt: now,
  }
  if (!toMs(doc.partnerOpenedAt)) patch.partnerOpenedAt = toMs(doc.partnerReadAt) ? doc.partnerReadAt : now
  if (!toMs(doc.partnerReadAt)) patch.partnerReadAt = now
  await ctx.col.reports.doc(doc._id).update({ data: patch })
  const [post] = await render(ctx, [{ ...doc, ...patch }], partnerId)
  return { post, awaitMeCount: await countAwaiting(ctx, partnerId) }
}

async function tags(ctx) {
  const { me } = await ctx.viewer()
  return { tags: tagOptions(me) }
}

async function saveCustomTags(ctx, custom) {
  await ctx.col.users.doc(ctx.openid).update({ data: { reportTags: custom } })
  return { tags: [DEFAULT_TAG, ...custom] }
}

async function addTag(ctx, e) {
  const tag = text(e.tag, MAX_TAG_LEN)
  if (!tag) fail('INVALID', '标签不能为空')
  const { me } = await ctx.viewer()
  const options = tagOptions(me)
  if (options.includes(tag)) return { tags: options }
  const custom = options.slice(1)
  if (custom.length >= MAX_CUSTOM_TAGS) fail('LIMIT', `自定义标签最多 ${MAX_CUSTOM_TAGS} 个`)
  return saveCustomTags(ctx, [...custom, tag])
}

async function removeTag(ctx, e) {
  const tag = text(e.tag, MAX_TAG_LEN)
  if (tag === DEFAULT_TAG) fail('INVALID', '默认标签不能删除')
  const { me } = await ctx.viewer()
  const custom = tagOptions(me).slice(1)
  if (!custom.includes(tag)) return { tags: [DEFAULT_TAG, ...custom] }
  return saveCustomTags(ctx, custom.filter((t) => t !== tag))
}

module.exports = {
  list,
  get,
  create,
  update,
  remove,
  open,
  respond,
  tags,
  addTag,
  removeTag,
  countAwaiting,
  STICKER_IDS,
}
