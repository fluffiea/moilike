const { fail, text, id, toMs, cloudFileIds, getDoc } = require('../lib/util')
const { pageByTime } = require('../lib/paging')
const media = require('../lib/media')

const PAGE_SIZE = 10
const MAX_TEXT = 2000
const MAX_IMAGES = 9
const MAX_COMMENT = 500
const PREVIEW_CHARS = 80
const DAY_MS = 86400000

function postView(ctx, doc, people, urls) {
  const fc = doc.firstComment
  return {
    id: doc._id,
    isMine: doc.authorOpenId === ctx.openid,
    author: people.view(doc.authorOpenId, urls),
    text: doc.snippet || '',
    images: media.images(cloudFileIds(doc.images, MAX_IMAGES), urls),
    createdAtMs: toMs(doc.createdAt),
    commentCount: doc.commentCount || 0,
    firstComment: fc ? { name: people.view(fc.authorOpenId, urls).name, text: fc.text || '' } : null,
  }
}

function commentView(ctx, c, people) {
  return {
    id: c._id,
    authorName: people.view(c.authorOpenId, new Map()).name,
    isMine: c.authorOpenId === ctx.openid,
    text: c.text || '',
    parentId: c.parentId || '',
    depth: c.depth > 0 ? 1 : 0,
    createdAtMs: toMs(c.createdAt),
  }
}

function summaryView(doc, people) {
  const fc = doc.firstComment
  return {
    commentCount: doc.commentCount || 0,
    firstComment: fc ? { name: people.view(fc.authorOpenId, new Map()).name, text: fc.text || '' } : null,
  }
}

function firstCommentOf(c) {
  return c ? { id: c._id, authorOpenId: c.authorOpenId, text: (c.text || '').slice(0, PREVIEW_CHARS) } : null
}

/** 早期帖子没有冗余的评论摘要：读取时补算并写回，之后列表不再扫评论表 */
async function ensureCommentSummary(ctx, docs) {
  const missing = docs.filter((d) => typeof d.commentCount !== 'number')
  if (missing.length === 0) return
  const res = await ctx.col.comments
    .where({ dailyPostId: ctx._.in(missing.map((d) => d._id)) })
    .orderBy('createdAt', 'asc')
    .limit(1000)
    .get()
  const byPost = new Map()
  for (const c of res.data || []) {
    if (!byPost.has(c.dailyPostId)) byPost.set(c.dailyPostId, [])
    byPost.get(c.dailyPostId).push(c)
  }
  await Promise.all(
    missing.map((d) => {
      const list = byPost.get(d._id) || []
      d.commentCount = list.length
      d.firstComment = firstCommentOf(list[0])
      return ctx.col.daily.doc(d._id).update({ data: { commentCount: d.commentCount, firstComment: d.firstComment } })
    }),
  )
}

async function visiblePost(ctx, postId) {
  const v = await ctx.viewer()
  const doc = await getDoc(ctx.col.daily, postId)
  if (!doc) fail('NOT_FOUND', '这条日常不存在或已删除')
  if (!v.ids.includes(doc.authorOpenId)) fail('FORBIDDEN', '无权查看这条日常')
  return doc
}

async function ownPost(ctx, postId) {
  const doc = await visiblePost(ctx, postId)
  if (doc.authorOpenId !== ctx.openid) fail('FORBIDDEN', '只能操作自己的日常')
  return doc
}

async function render(ctx, docs) {
  const people = await ctx.people()
  const fileIds = [...people.avatarIds]
  for (const d of docs) fileIds.push(...cloudFileIds(d.images, MAX_IMAGES))
  const urls = await media.sign(ctx.cloud, fileIds)
  return docs.map((d) => postView(ctx, d, people, urls))
}

async function list(ctx, e) {
  const { ids } = await ctx.viewer()
  const dayStart = Number(e.dayStartMs)
  const day = Number.isFinite(dayStart) && dayStart > 0 ? { from: dayStart, to: dayStart + DAY_MS - 1 } : {}
  const { docs, nextCursor } = await pageByTime({
    col: ctx.col.daily,
    _: ctx._,
    where: { authorOpenId: ctx._.in(ids) },
    field: 'createdAt',
    cursor: e.cursor,
    size: PAGE_SIZE,
    ...day,
  })
  await ensureCommentSummary(ctx, docs)
  return { items: await render(ctx, docs), nextCursor }
}

async function get(ctx, e) {
  const doc = await visiblePost(ctx, id(e.id))
  const [comments] = await Promise.all([
    ctx.col.comments.where({ dailyPostId: doc._id }).orderBy('createdAt', 'asc').limit(200).get(),
    ensureCommentSummary(ctx, [doc]),
  ])
  const [post] = await render(ctx, [doc])
  const people = await ctx.people()
  return { post, comments: (comments.data || []).map((c) => commentView(ctx, c, people)) }
}

function readPostInput(e) {
  const snippet = text(e.text, MAX_TEXT)
  const images = cloudFileIds(e.images, MAX_IMAGES)
  if (!snippet && images.length === 0) fail('INVALID', '写点什么或选一张图吧')
  return { snippet, images }
}

async function create(ctx, e) {
  await ctx.viewer()
  const input = readPostInput(e)
  const now = new Date()
  const data = { authorOpenId: ctx.openid, ...input, commentCount: 0, firstComment: null, createdAt: now, updatedAt: now }
  const res = await ctx.col.daily.add({ data })
  const [post] = await render(ctx, [{ ...data, _id: res._id }])
  return { post }
}

async function update(ctx, e) {
  const doc = await ownPost(ctx, id(e.id))
  const input = readPostInput(e)
  await ctx.col.daily.doc(doc._id).update({ data: { ...input, updatedAt: ctx.db.serverDate() } })
  await ensureCommentSummary(ctx, [doc])
  const [post] = await render(ctx, [{ ...doc, ...input }])
  return { post }
}

async function remove(ctx, e) {
  const doc = await ownPost(ctx, id(e.id))
  await Promise.all([
    ctx.col.daily.doc(doc._id).remove(),
    ctx.col.comments.where({ dailyPostId: doc._id }).remove(),
  ])
  return null
}

async function hasReplies(ctx, postId, commentId) {
  const r = await ctx.col.comments.where({ dailyPostId: postId, parentId: commentId }).count()
  return r.total > 0
}

async function ownComment(ctx, post, commentId) {
  const c = await getDoc(ctx.col.comments, commentId)
  if (!c || c.dailyPostId !== post._id) fail('NOT_FOUND', '评论不存在')
  if (c.authorOpenId !== ctx.openid) fail('FORBIDDEN', '只能操作自己的评论')
  if (await hasReplies(ctx, post._id, c._id)) fail('HAS_REPLIES', '已有回复的评论不能修改')
  return c
}

async function addComment(ctx, e) {
  const post = await visiblePost(ctx, id(e.postId))
  const body = text(e.text, MAX_COMMENT)
  if (!body) fail('INVALID', '评论不能为空')
  const parentId = id(e.parentId)
  if (parentId) {
    const parent = await getDoc(ctx.col.comments, parentId)
    if (!parent || parent.dailyPostId !== post._id) fail('NOT_FOUND', '原评论不存在')
    if (parent.depth > 0) fail('INVALID', '只能回复一级评论')
  }
  await ensureCommentSummary(ctx, [post])

  const data = {
    dailyPostId: post._id,
    authorOpenId: ctx.openid,
    text: body,
    parentId,
    depth: parentId ? 1 : 0,
    createdAt: new Date(),
  }
  const res = await ctx.col.comments.add({ data })
  const comment = { ...data, _id: res._id }
  const patch = { commentCount: ctx._.inc(1) }
  if (!post.firstComment) patch.firstComment = firstCommentOf(comment)
  await ctx.col.daily.doc(post._id).update({ data: patch })

  const people = await ctx.people()
  const next = { ...post, commentCount: post.commentCount + 1, firstComment: post.firstComment || firstCommentOf(comment) }
  return { comment: commentView(ctx, comment, people), summary: summaryView(next, people) }
}

async function updateComment(ctx, e) {
  const post = await visiblePost(ctx, id(e.postId))
  const body = text(e.text, MAX_COMMENT)
  if (!body) fail('INVALID', '评论不能为空')
  const c = await ownComment(ctx, post, id(e.commentId))
  await ctx.col.comments.doc(c._id).update({ data: { text: body } })
  await ensureCommentSummary(ctx, [post])
  if (post.firstComment && post.firstComment.id === c._id) {
    post.firstComment = firstCommentOf({ ...c, text: body })
    await ctx.col.daily.doc(post._id).update({ data: { firstComment: post.firstComment } })
  }
  const people = await ctx.people()
  return { comment: commentView(ctx, { ...c, text: body }, people), summary: summaryView(post, people) }
}

async function removeComment(ctx, e) {
  const post = await visiblePost(ctx, id(e.postId))
  const c = await ownComment(ctx, post, id(e.commentId))
  await ensureCommentSummary(ctx, [post])
  await ctx.col.comments.doc(c._id).remove()
  post.commentCount = Math.max(0, post.commentCount - 1)
  if (post.firstComment && post.firstComment.id === c._id) {
    const r = await ctx.col.comments.where({ dailyPostId: post._id }).orderBy('createdAt', 'asc').limit(1).get()
    post.firstComment = firstCommentOf((r.data || [])[0])
  }
  await ctx.col.daily.doc(post._id).update({
    data: { commentCount: post.commentCount, firstComment: post.firstComment },
  })
  return { summary: summaryView(post, await ctx.people()) }
}

module.exports = { list, get, create, update, remove, addComment, updateComment, removeComment }
