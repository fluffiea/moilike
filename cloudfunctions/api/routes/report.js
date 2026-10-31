const { fail, text, id, toMs, cloudFileIds, getDoc } = require('../lib/util')
const { pageByTime } = require('../lib/paging')
const media = require('../lib/media')

const PAGE_SIZE = 10
const MAX_BODY = 2000
const MAX_IMAGES = 9
const MAX_EVAL = 500
const MAX_TAG_LEN = 16
const MAX_TAGS_PER_POST = 10
const MAX_CUSTOM_TAGS = 20
const DEFAULT_TAG = '干饭'
const FILTERS = ['all', 'action_needed', 'mine']

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

function stateOf(doc) {
  if (!toMs(doc.partnerReadAt)) return 'pending_read'
  if (!toMs(doc.partnerEvaluatedAt)) return 'read'
  return 'evaluated'
}

function postView(ctx, doc, partnerId, people, urls) {
  const isMine = doc.authorOpenId === ctx.openid
  const state = stateOf(doc)
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
    state,
    evalText: doc.partnerEvalText || '',
    canMarkRead: fromPartner && state === 'pending_read',
    canEvaluate: fromPartner && state === 'read',
    canEditEval: fromPartner && state === 'evaluated',
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

/** 对方的报备，且处于期望状态 */
async function partnerPost(ctx, postId, states) {
  const r = await visiblePost(ctx, postId)
  if (r.doc.authorOpenId === ctx.openid || r.doc.authorOpenId !== r.partnerId) fail('FORBIDDEN', '只有对方可以处理这条报备')
  if (!states.includes(stateOf(r.doc))) fail('STATE', '报备状态已变化，请刷新')
  return r
}

async function list(ctx, e) {
  const { _ } = ctx
  const { ids, partnerId } = await ctx.viewer()
  const filter = FILTERS.includes(e.filter) ? e.filter : 'all'
  let where = { authorOpenId: _.in(ids) }
  if (filter === 'mine') where = { authorOpenId: ctx.openid }
  if (filter === 'action_needed') {
    if (!partnerId) return { items: [], nextCursor: '' }
    where = { authorOpenId: partnerId, partnerEvaluatedAt: _.eq(null) }
  }
  const { docs, nextCursor } = await pageByTime({
    col: ctx.col.reports,
    _,
    where,
    field: 'recordAt',
    cursor: e.cursor,
    size: PAGE_SIZE,
  })
  return { items: await render(ctx, docs, partnerId), nextCursor }
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
  if (Number.isFinite(ms) && ms > 0) input.recordAt = new Date(Math.floor(ms / 60000) * 60000)
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
  await ctx.col.reports.doc(doc._id).update({ data: { ...input, updatedAt: ctx.db.serverDate() } })
  const [post] = await render(ctx, [{ ...doc, ...input }], partnerId)
  return { post }
}

async function remove(ctx, e) {
  const { doc } = await ownPost(ctx, id(e.id))
  await ctx.col.reports.doc(doc._id).remove()
  return null
}

async function markRead(ctx, e) {
  const { doc, partnerId } = await partnerPost(ctx, id(e.id), ['pending_read'])
  const now = new Date()
  await ctx.col.reports.doc(doc._id).update({ data: { partnerReadAt: now, updatedAt: now } })
  const [post] = await render(ctx, [{ ...doc, partnerReadAt: now }], partnerId)
  return { post }
}

async function evaluate(ctx, e) {
  const evalText = text(e.text, MAX_EVAL)
  if (!evalText) fail('INVALID', '评价不能为空')
  const { doc, partnerId } = await partnerPost(ctx, id(e.id), ['read', 'evaluated'])
  const now = new Date()
  const patch = { partnerEvalText: evalText, partnerEvaluatedAt: now, updatedAt: now }
  await ctx.col.reports.doc(doc._id).update({ data: patch })
  const [post] = await render(ctx, [{ ...doc, ...patch }], partnerId)
  return { post }
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

module.exports = { list, get, create, update, remove, markRead, evaluate, tags, addTag, removeTag }
