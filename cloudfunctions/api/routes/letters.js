const { fail, text, id, toMs, cloudFileIds, getDoc } = require('../lib/util')
const { pageByTime } = require('../lib/paging')
const media = require('../lib/media')

const PAGE_SIZE = 20
const MAX_TITLE = 200
const MAX_CONTENT = 5000
const MAX_IMAGES = 9
const MAX_TYPE = 20
const LIST_THUMBS = 3
const PREVIEW_CHARS = 120

function isParticipant(ctx, doc) {
  return doc.senderId === ctx.openid || doc.receiverId === ctx.openid
}

async function list(ctx, e) {
  await ctx.viewer()
  const { docs, nextCursor } = await pageByTime({
    col: ctx.col.letters,
    _: ctx._,
    where: null,
    or: [{ senderId: ctx.openid }, { receiverId: ctx.openid }],
    field: 'createdAt',
    cursor: e.cursor,
    size: PAGE_SIZE,
  })
  const thumbIds = docs.map((d) => cloudFileIds(d.images, LIST_THUMBS))
  const urls = await media.sign(ctx.cloud, thumbIds.flat())
  const items = docs.map((d, i) => {
    const content = (d.content || '').trim().replace(/\s+/g, ' ')
    return {
      id: d._id,
      isMine: d.senderId === ctx.openid,
      title: d.title || '',
      preview: content.length > PREVIEW_CHARS ? content.slice(0, PREVIEW_CHARS - 1) + '…' : content,
      type: d.type || 'text',
      thumbs: media.images(thumbIds[i], urls).map((m) => m.thumb),
      createdAtMs: toMs(d.createdAt),
    }
  })
  return { items, nextCursor }
}

async function render(ctx, doc) {
  const people = await ctx.people()
  const images = cloudFileIds(doc.images, MAX_IMAGES)
  const urls = await media.sign(ctx.cloud, images)
  return {
    id: doc._id,
    isMine: doc.senderId === ctx.openid,
    title: doc.title || '',
    content: doc.content || '',
    type: doc.type || 'text',
    images: media.images(images, urls),
    createdAtMs: toMs(doc.createdAt),
    fromName: people.view(doc.senderId, urls).name,
  }
}

async function get(ctx, e) {
  await ctx.viewer()
  const doc = await getDoc(ctx.col.letters, id(e.id))
  if (!doc) fail('NOT_FOUND', '这封信不存在或已删除')
  if (!isParticipant(ctx, doc)) fail('FORBIDDEN', '无权查看这封信')
  return { letter: await render(ctx, doc) }
}

async function create(ctx, e) {
  const { partnerId } = await ctx.requirePartner()
  const content = text(e.content, MAX_CONTENT)
  if (!content) fail('INVALID', '信的内容不能为空')
  const now = new Date()
  const data = {
    title: text(e.title, MAX_TITLE),
    content,
    type: text(e.type, MAX_TYPE) || 'text',
    images: cloudFileIds(e.images, MAX_IMAGES),
    senderId: ctx.openid,
    receiverId: partnerId,
    createdAt: now,
    updatedAt: now,
  }
  const res = await ctx.col.letters.add({ data })
  return { letter: await render(ctx, { ...data, _id: res._id }) }
}

async function remove(ctx, e) {
  await ctx.viewer()
  const doc = await getDoc(ctx.col.letters, id(e.id))
  if (!doc) fail('NOT_FOUND', '这封信不存在或已删除')
  if (doc.senderId !== ctx.openid) fail('FORBIDDEN', '只能删除自己寄出的信')
  await ctx.col.letters.doc(doc._id).remove()
  return null
}

module.exports = { list, get, create, remove }
