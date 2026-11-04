/**
 * 小厨房：每人最多一间，创建后没有预置分类和菜品。
 * 谁建厨谁接单；伴侣只点已上架的菜。
 * 状态 pending → in_progress → done；下单方仅待接单可取消。没有拒单。
 *
 * 订单不保存快捷标签。份量在购物车和确认页调整。
 * 「常点」只在真实完成次数达到 OFTEN_AT 时出现，没有记录就不返回文案。
 */
const { fail, text, id, toMs, cloudFileIds, getDoc } = require('../lib/util')
const { pageByTime } = require('../lib/paging')
const media = require('../lib/media')

const PAGE_SIZE = 20
const LIST_CAP = 100
const ORDER_SCAN = 500
const MAX_KITCHEN_NAME = 20
const MAX_CATEGORY_NAME = 8
const MAX_DISH_NAME = 16
const MAX_DESC = 40
const MAX_NOTE = 80
const MAX_QTY = 99
const MAX_LINES = 30
const OFTEN_AT = 5

const STATUS_LABEL = {
  pending: '待接单',
  in_progress: '进行中',
  done: '完成',
  cancelled: '已取消',
}

function byCreatedAsc(docs) {
  return docs.slice().sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt) || String(a._id).localeCompare(String(b._id)))
}

async function fetchAll(col, where) {
  const res = await col.where(where).limit(LIST_CAP).get()
  return res.data || []
}

async function kitchenByOwner(ctx, ownerOpenId) {
  const rows = await fetchAll(ctx.col.kitchens, { ownerOpenId })
  return rows.sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt))[0] || null
}

async function ownKitchen(ctx) {
  await ctx.viewer()
  const kitchen = await kitchenByOwner(ctx, ctx.openid)
  if (!kitchen) fail('NO_KITCHEN', '先创建自己的小厨房')
  return kitchen
}

function kitchenView(doc) {
  return { id: doc._id, name: doc.name || '', createdAtMs: toMs(doc.createdAt) }
}

function requireName(raw, max, emptyMsg) {
  const name = text(raw, max)
  if (!name) fail('INVALID', emptyMsg)
  return name
}

async function categoriesOf(ctx, kitchenId) {
  return byCreatedAsc(await fetchAll(ctx.col.kCategories, { kitchenId }))
}

async function dishesOf(ctx, kitchenId) {
  return byCreatedAsc(await fetchAll(ctx.col.kDishes, { kitchenId }))
}

function coverView(fileId, urls) {
  if (typeof fileId !== 'string' || !fileId.startsWith('cloud://')) return null
  if (!urls.get(fileId)) return null
  return media.images([fileId], urls)[0]
}

function categoryView(doc, dishCount) {
  return { id: doc._id, name: doc.name || '', dishCount, createdAtMs: toMs(doc.createdAt) }
}

function dishView(doc, categoryName, urls) {
  return {
    id: doc._id,
    categoryId: doc.categoryId || '',
    categoryName: categoryName || '',
    name: doc.name || '',
    desc: doc.desc || '',
    cover: coverView(doc.coverFileId, urls),
    onShelf: doc.onShelf !== false,
    createdAtMs: toMs(doc.createdAt),
  }
}

async function pendingCount(ctx, ownerOpenId) {
  const res = await ctx.col.kOrders.where({ ownerOpenId, status: 'pending' }).count()
  return res.total || 0
}

async function mine(ctx) {
  await ctx.viewer()
  const kitchen = await kitchenByOwner(ctx, ctx.openid)
  return {
    kitchen: kitchen ? kitchenView(kitchen) : null,
    pendingCount: kitchen ? await pendingCount(ctx, ctx.openid) : 0,
  }
}

async function create(ctx, e) {
  await ctx.viewer()
  const name = requireName(e.name, MAX_KITCHEN_NAME, '先给厨房起个名字')
  if (await kitchenByOwner(ctx, ctx.openid)) fail('ALREADY_EXISTS', '已经有一间小厨房了')
  const now = new Date()
  const data = { ownerOpenId: ctx.openid, name, createdAt: now, updatedAt: now }
  const res = await ctx.col.kitchens.add({ data })
  return { kitchen: kitchenView({ ...data, _id: res._id }) }
}

async function rename(ctx, e) {
  const kitchen = await ownKitchen(ctx)
  const name = requireName(e.name, MAX_KITCHEN_NAME, '先给厨房起个名字')
  const updatedAt = new Date()
  await ctx.col.kitchens.doc(kitchen._id).update({ data: { name, updatedAt } })
  return { kitchen: kitchenView({ ...kitchen, name, updatedAt }) }
}

function withCounts(cats, rows) {
  return cats.map((c) => categoryView(c, rows.filter((d) => d.categoryId === c._id).length))
}

async function categories(ctx) {
  const kitchen = await ownKitchen(ctx)
  const [cats, rows] = await Promise.all([categoriesOf(ctx, kitchen._id), dishesOf(ctx, kitchen._id)])
  return { categories: withCounts(cats, rows) }
}

async function assertUniqueCategory(ctx, kitchenId, name, exceptId) {
  const cats = await categoriesOf(ctx, kitchenId)
  if (cats.some((c) => c._id !== exceptId && c.name === name)) fail('INVALID', '已经有这个分类了')
}

async function loadCategory(ctx, kitchen, rawId) {
  const doc = await getDoc(ctx.col.kCategories, id(rawId))
  if (!doc || doc.kitchenId !== kitchen._id) fail('NOT_FOUND', '这个分类不存在')
  return doc
}

async function createCategory(ctx, e) {
  const kitchen = await ownKitchen(ctx)
  const name = requireName(e.name, MAX_CATEGORY_NAME, '先写分类名')
  await assertUniqueCategory(ctx, kitchen._id, name, '')
  const now = new Date()
  const data = { kitchenId: kitchen._id, ownerOpenId: ctx.openid, name, createdAt: now, updatedAt: now }
  const res = await ctx.col.kCategories.add({ data })
  return { category: categoryView({ ...data, _id: res._id }, 0) }
}

async function renameCategory(ctx, e) {
  const kitchen = await ownKitchen(ctx)
  const doc = await loadCategory(ctx, kitchen, e.id)
  const name = requireName(e.name, MAX_CATEGORY_NAME, '先写分类名')
  await assertUniqueCategory(ctx, kitchen._id, name, doc._id)
  const updatedAt = new Date()
  await ctx.col.kCategories.doc(doc._id).update({ data: { name, updatedAt } })
  const dishes = await dishesOf(ctx, kitchen._id)
  return { category: categoryView({ ...doc, name, updatedAt }, dishes.filter((d) => d.categoryId === doc._id).length) }
}

async function removeCategory(ctx, e) {
  const kitchen = await ownKitchen(ctx)
  const doc = await loadCategory(ctx, kitchen, e.id)
  const dishes = await dishesOf(ctx, kitchen._id)
  if (dishes.some((d) => d.categoryId === doc._id)) fail('NOT_EMPTY', '分类里还有菜品，不能删除')
  await ctx.col.kCategories.doc(doc._id).remove()
  return null
}

function readCover(raw) {
  if (typeof raw !== 'string' || !raw) return ''
  return cloudFileIds([raw], 1)[0] || ''
}

function readShelf(v, fallback) {
  if (v === undefined || v === null) return fallback
  if (typeof v !== 'boolean') fail('INVALID', '上下架无效')
  return v
}

async function resolveCategory(ctx, kitchen, e) {
  const categoryId = id(e.categoryId)
  if (categoryId) return loadCategory(ctx, kitchen, categoryId)
  const name = text(e.newCategoryName, MAX_CATEGORY_NAME)
  if (!name) fail('INVALID', '请选择或新增分类')
  const found = (await categoriesOf(ctx, kitchen._id)).find((c) => c.name === name)
  if (found) return found
  const now = new Date()
  const data = { kitchenId: kitchen._id, ownerOpenId: ctx.openid, name, createdAt: now, updatedAt: now }
  const res = await ctx.col.kCategories.add({ data })
  return { ...data, _id: res._id }
}

async function loadDish(ctx, kitchen, rawId) {
  const doc = await getDoc(ctx.col.kDishes, id(rawId))
  if (!doc || doc.kitchenId !== kitchen._id) fail('NOT_FOUND', '这道菜不存在或已删除')
  return doc
}

async function paintDish(ctx, doc, categoryName) {
  const urls = await media.sign(ctx.cloud, [doc.coverFileId])
  return dishView(doc, categoryName, urls)
}

/** 菜单页一次拿齐，避免厨房、分类、菜品各打一轮。withSales 只给点单预览自己的厨房用 */
async function dishes(ctx, e) {
  const kitchen = await ownKitchen(ctx)
  const [cats, rows] = await Promise.all([categoriesOf(ctx, kitchen._id), dishesOf(ctx, kitchen._id)])
  const names = new Map(cats.map((c) => [c._id, c.name || '']))
  const withSales = !!(e && e.withSales === true)
  const [urls, counts] = await Promise.all([
    media.sign(ctx.cloud, rows.map((d) => d.coverFileId)),
    withSales ? doneCountMap(ctx, kitchen._id) : Promise.resolve(null),
  ])
  return {
    kitchen: kitchenView(kitchen),
    categories: withCounts(cats, rows),
    dishes: rows.map((d) => {
      const view = dishView(d, names.get(d.categoryId) || '', urls)
      if (!counts) return view
      const doneCount = counts.get(d._id) || 0
      return { ...view, doneCount, salesLabel: salesLabel(doneCount) }
    }),
  }
}

async function dish(ctx, e) {
  const kitchen = await ownKitchen(ctx)
  const doc = await loadDish(ctx, kitchen, e.id)
  const cat = await getDoc(ctx.col.kCategories, doc.categoryId)
  const categoryName = cat && cat.kitchenId === kitchen._id ? cat.name : ''
  return { dish: await paintDish(ctx, doc, categoryName) }
}

async function createDish(ctx, e) {
  const kitchen = await ownKitchen(ctx)
  const name = requireName(e.name, MAX_DISH_NAME, '先写菜品名称')
  const category = await resolveCategory(ctx, kitchen, e)
  const now = new Date()
  const data = {
    kitchenId: kitchen._id,
    ownerOpenId: ctx.openid,
    categoryId: category._id,
    name,
    desc: text(e.desc, MAX_DESC),
    coverFileId: readCover(e.coverFileId),
    onShelf: readShelf(e.onShelf, true),
    createdAt: now,
    updatedAt: now,
  }
  const res = await ctx.col.kDishes.add({ data })
  return { dish: await paintDish(ctx, { ...data, _id: res._id }, category.name) }
}

async function updateDish(ctx, e) {
  const kitchen = await ownKitchen(ctx)
  const doc = await loadDish(ctx, kitchen, e.id)
  const name = requireName(e.name, MAX_DISH_NAME, '先写菜品名称')
  const category = await resolveCategory(ctx, kitchen, e)
  const patch = {
    categoryId: category._id,
    name,
    desc: text(e.desc, MAX_DESC),
    coverFileId: readCover(e.coverFileId),
    onShelf: readShelf(e.onShelf, doc.onShelf !== false),
    updatedAt: new Date(),
  }
  await ctx.col.kDishes.doc(doc._id).update({ data: patch })
  return { dish: await paintDish(ctx, { ...doc, ...patch }, category.name) }
}

async function removeDish(ctx, e) {
  const kitchen = await ownKitchen(ctx)
  const doc = await loadDish(ctx, kitchen, e.id)
  await ctx.col.kDishes.doc(doc._id).remove()
  return null
}

function salesLabel(count) {
  if (!count) return ''
  if (count >= OFTEN_AT) return '常点'
  return `我们点过 ${count} 次`
}

async function doneCountMap(ctx, kitchenId) {
  const res = await ctx.col.kOrders.where({ kitchenId, status: 'done' }).limit(ORDER_SCAN).get()
  const map = new Map()
  for (const order of res.data || []) {
    const seen = new Set()
    for (const it of order.items || []) {
      const dishId = it && it.dishId
      if (!dishId || seen.has(dishId)) continue
      seen.add(dishId)
      map.set(dishId, (map.get(dishId) || 0) + 1)
    }
  }
  return map
}

async function partner(ctx) {
  const v = await ctx.viewer()
  if (!v.partnerId) return { scene: 'unpaired', kitchen: null, categories: [], dishes: [] }
  const kitchen = await kitchenByOwner(ctx, v.partnerId)
  if (!kitchen) return { scene: 'no_kitchen', kitchen: null, categories: [], dishes: [] }
  const [cats, rows] = await Promise.all([categoriesOf(ctx, kitchen._id), dishesOf(ctx, kitchen._id)])
  const onShelf = rows.filter((d) => d.onShelf !== false)
  const brief = { id: kitchen._id, name: kitchen.name || '' }
  if (onShelf.length === 0) return { scene: 'empty', kitchen: brief, categories: [], dishes: [] }
  const counts = await doneCountMap(ctx, kitchen._id)
  const urls = await media.sign(ctx.cloud, onShelf.map((d) => d.coverFileId))
  return {
    scene: 'menu',
    kitchen: brief,
    categories: cats.map((c) => ({ id: c._id, name: c.name || '' })),
    dishes: onShelf.map((d) => {
      const doneCount = counts.get(d._id) || 0
      return {
        id: d._id,
        categoryId: d.categoryId || '',
        name: d.name || '',
        desc: d.desc || '',
        cover: coverView(d.coverFileId, urls),
        doneCount,
        salesLabel: salesLabel(doneCount),
      }
    }),
  }
}

function readItems(raw) {
  if (!Array.isArray(raw) || raw.length === 0) fail('INVALID', '先选一份心意')
  if (raw.length > MAX_LINES) fail('INVALID', '一次最多 30 行')
  return raw.map((row) => {
    const dishId = id(row && row.dishId)
    const quantity = row && row.quantity
    if (!dishId) fail('INVALID', '菜品无效')
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY) fail('INVALID', '份量要在 1 到 99 之间')
    return { dishId, quantity }
  })
}

function linesOf(doc) {
  return (doc.items || []).map((it) => ({
    dishId: it.dishId || '',
    name: it.name || '',
    quantity: it.quantity || 0,
  }))
}

function myOrderView(doc) {
  return {
    id: doc._id,
    status: doc.status,
    statusLabel: STATUS_LABEL[doc.status] || '',
    note: doc.note || '',
    lines: linesOf(doc),
    createdAtMs: toMs(doc.createdAt),
    canCancel: doc.status === 'pending',
    canReorder: doc.status === 'done',
  }
}

function opsView(doc, people, urls) {
  const who = people.view(doc.ordererOpenId, urls)
  const lines = linesOf(doc)
  const names = []
  for (const line of lines) {
    if (line.name && !names.includes(line.name)) names.push(line.name)
  }
  return {
    id: doc._id,
    status: doc.status,
    statusLabel: STATUS_LABEL[doc.status] || '',
    ordererName: who.name,
    ordererAvatar: who.avatarUrl,
    names: names.join('、'),
    lines,
    note: doc.note || '',
    createdAtMs: toMs(doc.createdAt),
    canAccept: doc.status === 'pending',
    canComplete: doc.status === 'in_progress',
  }
}

async function orderCreate(ctx, e) {
  const { partnerId } = await ctx.requirePartner()
  const kitchen = await kitchenByOwner(ctx, partnerId)
  if (!kitchen) fail('NO_KITCHEN', '对方还没有开厨房')
  const items = readItems(e.items)
  const ids = [...new Set(items.map((it) => it.dishId))]
  const res = await ctx.col.kDishes.where({ _id: ctx._.in(ids) }).limit(ids.length).get()
  const byId = new Map((res.data || []).map((d) => [d._id, d]))
  const snapshots = items.map((it) => {
    const row = byId.get(it.dishId)
    if (!row || row.kitchenId !== kitchen._id || row.onShelf === false) fail('INVALID', '菜单里没有这道心意')
    return { dishId: row._id, name: row.name || '', quantity: it.quantity }
  })
  const now = new Date()
  const data = {
    kitchenId: kitchen._id,
    ownerOpenId: kitchen.ownerOpenId,
    ordererOpenId: ctx.openid,
    status: 'pending',
    note: text(e.note, MAX_NOTE),
    items: snapshots,
    createdAt: now,
    updatedAt: now,
    acceptedAt: null,
    completedAt: null,
    cancelledAt: null,
  }
  const added = await ctx.col.kOrders.add({ data })
  return { order: myOrderView({ ...data, _id: added._id }) }
}

async function myOrders(ctx, e) {
  await ctx.viewer()
  const { docs, nextCursor } = await pageByTime({
    col: ctx.col.kOrders,
    _: ctx._,
    where: { ordererOpenId: ctx.openid },
    field: 'createdAt',
    cursor: e.cursor,
    size: PAGE_SIZE,
  })
  return { items: docs.map(myOrderView), nextCursor }
}

async function loadOrder(ctx, rawId) {
  const doc = await getDoc(ctx.col.kOrders, id(rawId))
  if (!doc) fail('NOT_FOUND', '这份订单不存在')
  return doc
}

async function cancel(ctx, e) {
  await ctx.viewer()
  const doc = await loadOrder(ctx, e.id)
  if (doc.ordererOpenId !== ctx.openid) fail('FORBIDDEN', '只能取消自己的订单')
  if (doc.status !== 'pending') fail('INVALID', '只有待接单可以取消')
  const patch = { status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() }
  await ctx.col.kOrders.doc(doc._id).update({ data: patch })
  return { order: myOrderView({ ...doc, ...patch }) }
}

const OPS = ['pending', 'in_progress', 'done']

async function ops(ctx, e) {
  await ownKitchen(ctx)
  if (!OPS.includes(e.status)) fail('INVALID', '订单状态无效')
  const { docs, nextCursor } = await pageByTime({
    col: ctx.col.kOrders,
    _: ctx._,
    where: { ownerOpenId: ctx.openid, status: e.status },
    field: 'createdAt',
    cursor: e.cursor,
    size: PAGE_SIZE,
  })
  const people = await ctx.people()
  const urls = await media.sign(ctx.cloud, people.avatarIds)
  return { items: docs.map((d) => opsView(d, people, urls)), nextCursor }
}

async function transition(ctx, e, from, to, stamp) {
  const kitchen = await ownKitchen(ctx)
  const doc = await loadOrder(ctx, e.id)
  if (doc.ownerOpenId !== ctx.openid || doc.kitchenId !== kitchen._id) fail('FORBIDDEN', '只能处理自己厨房的订单')
  if (doc.status !== from) {
    fail('INVALID', to === 'in_progress' ? '这份心意已经不在待接单' : '只有进行中可以完成')
  }
  const patch = { status: to, updatedAt: new Date(), ...stamp }
  await ctx.col.kOrders.doc(doc._id).update({ data: patch })
  const people = await ctx.people()
  const urls = await media.sign(ctx.cloud, people.avatarIds)
  return { order: opsView({ ...doc, ...patch }, people, urls) }
}

async function accept(ctx, e) {
  return transition(ctx, e, 'pending', 'in_progress', { acceptedAt: new Date() })
}

async function complete(ctx, e) {
  return transition(ctx, e, 'in_progress', 'done', { completedAt: new Date() })
}

module.exports = {
  mine,
  create,
  rename,
  categories,
  createCategory,
  renameCategory,
  removeCategory,
  dishes,
  dish,
  createDish,
  updateDish,
  removeDish,
  partner,
  orderCreate,
  myOrders,
  cancel,
  ops,
  accept,
  complete,
}
