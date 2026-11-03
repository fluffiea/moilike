import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import Module, { createRequire } from 'node:module'
import { createFakeCloud } from './helpers/fake-cloud.mjs'

const originalLoad = Module._load
Module._load = function (request, ...rest) {
  if (request === 'wx-server-sdk') return { init() {}, DYNAMIC_CURRENT_ENV: 'test' }
  return originalLoad.call(this, request, ...rest)
}
const require = createRequire(import.meta.url)
const { handle } = require('../cloudfunctions/api/index.js')

let cloud
const call = async (who, route, data = {}) => handle({ route, ...data }, cloud.as(who))
const ok = async (who, route, data) => {
  const r = await call(who, route, data)
  assert.equal(r.ok, true, `${route} 失败：${r.code} ${r.message}`)
  return r.data
}
const failsWith = async (code, who, route, data) => {
  const r = await call(who, route, data)
  assert.equal(r.ok, false, `${route} 应失败`)
  assert.equal(r.code, code, r.message)
}

async function register(who, nickName) {
  return ok(who, 'user.saveProfile', { nickName, avatarFileId: `cloud://env/avatars/${who}.jpg` })
}

async function bindCouple() {
  await register('A', '阿杏')
  await register('B', '阿桃')
  const { bindCode } = await ok('A', 'user.partnerPanel')
  await ok('B', 'user.requestBind', { bindCode })
  const panel = await ok('A', 'user.partnerPanel')
  await ok('A', 'user.respondBind', { requestId: panel.inbound[0].id, accept: true })
}

function tableSize(name) {
  const t = cloud.tables.get(name)
  return t ? t.size : 0
}

beforeEach(() => {
  cloud = createFakeCloud()
})

test('建厨后是空厨房：没有预置分类和菜品', async () => {
  await register('A', '阿杏')
  assert.equal((await ok('A', 'kitchen.partner')).scene, 'unpaired')
  const { kitchen } = await ok('A', 'kitchen.create', { name: '  阿杏的小厨房  ' })
  assert.equal(kitchen.name, '阿杏的小厨房')
  assert.equal((await ok('A', 'kitchen.categories')).categories.length, 0)
  const board = await ok('A', 'kitchen.dishes')
  assert.equal(board.kitchen.name, '阿杏的小厨房')
  assert.equal(board.categories.length, 0)
  assert.equal(board.dishes.length, 0)
  assert.equal(tableSize('kitchen_categories'), 0)
  assert.equal(tableSize('kitchen_dishes'), 0)
  assert.equal((await ok('A', 'kitchen.mine')).pendingCount, 0)
  await failsWith('ALREADY_EXISTS', 'A', 'kitchen.create', { name: '另一间' })
  await failsWith('INVALID', 'A', 'kitchen.create', { name: '   ' })
  await failsWith('UNKNOWN_ROUTE', 'A', 'kitchen.reject')
  await failsWith('NO_PARTNER', 'A', 'kitchen.orderCreate', { items: [{ dishId: 'x', quantity: 1 }] })
})

test('点单三态：未结伴、对方未建厨、对方厨房空', async () => {
  await bindCouple()
  assert.equal((await ok('B', 'kitchen.partner')).scene, 'no_kitchen')
  await failsWith('NO_KITCHEN', 'B', 'kitchen.orderCreate', { items: [{ dishId: 'none', quantity: 1 }] })

  await ok('A', 'kitchen.create', { name: '阿杏的小厨房' })
  const empty = await ok('B', 'kitchen.partner')
  assert.equal(empty.scene, 'empty')
  assert.equal(empty.kitchen.name, '阿杏的小厨房')
  assert.deepEqual(empty.categories, [])
  assert.deepEqual(empty.dishes, [])

  const renamed = await ok('A', 'kitchen.rename', { name: '阿柚的小厨房' })
  assert.equal(renamed.kitchen.name, '阿柚的小厨房')
  assert.equal((await ok('B', 'kitchen.partner')).kitchen.name, '阿柚的小厨房')
})

test('分类和菜品都要自己建；空分类才能删；下架不出现在对方菜单', async () => {
  await bindCouple()
  await ok('A', 'kitchen.create', { name: '阿杏的小厨房' })
  await failsWith('INVALID', 'A', 'kitchen.createDish', { name: '抱抱' })
  await failsWith('NO_KITCHEN', 'B', 'kitchen.updateDish', { id: 'nope', name: '抱抱', categoryId: 'nope' })

  const { dish } = await ok('A', 'kitchen.createDish', {
    name: '抱抱',
    newCategoryName: '心意',
    desc: '累的时候给我一个拥抱',
    coverFileId: 'https://evil.example/a.jpg',
    onShelf: true,
  })
  assert.equal(dish.categoryName, '心意')
  assert.equal(dish.cover, null)
  assert.equal(dish.onShelf, true)
  const cats = await ok('A', 'kitchen.categories')
  assert.equal(cats.categories.length, 1)
  assert.equal(cats.categories[0].name, '心意')
  assert.equal(cats.categories[0].dishCount, 1)
  await failsWith('INVALID', 'A', 'kitchen.createCategory', { name: '心意' })
  await failsWith('NOT_EMPTY', 'A', 'kitchen.removeCategory', { id: cats.categories[0].id })

  const off = await ok('A', 'kitchen.updateDish', {
    id: dish.id,
    name: '抱抱',
    categoryId: dish.categoryId,
    desc: dish.desc,
    coverFileId: '',
    onShelf: false,
  })
  assert.equal(off.dish.onShelf, false)
  assert.equal((await ok('B', 'kitchen.partner')).scene, 'empty')
  await failsWith('INVALID', 'B', 'kitchen.orderCreate', { items: [{ dishId: dish.id, quantity: 1 }] })

  await ok('A', 'kitchen.updateDish', {
    id: dish.id,
    name: '抱抱',
    categoryId: dish.categoryId,
    onShelf: true,
    coverFileId: 'cloud://env/kitchen/hug.jpg',
  })
  const menu = await ok('B', 'kitchen.partner')
  assert.equal(menu.scene, 'menu')
  assert.equal(menu.dishes.length, 1)
  assert.equal(menu.dishes[0].doneCount, 0)
  assert.equal(menu.dishes[0].salesLabel, '')
  assert.match(menu.dishes[0].cover.thumb, /imageMogr2\/thumbnail\/600x600$/)

  const extra = await ok('A', 'kitchen.createCategory', { name: '日常' })
  const withEmpty = await ok('B', 'kitchen.partner')
  assert.deepEqual(withEmpty.categories.map((c) => c.name), ['心意', '日常'])
  assert.equal(withEmpty.dishes.length, 1)

  await ok('A', 'kitchen.removeDish', { id: dish.id })
  await ok('A', 'kitchen.removeCategory', { id: cats.categories[0].id })
  await ok('A', 'kitchen.removeCategory', { id: extra.category.id })
  assert.equal((await ok('A', 'kitchen.categories')).categories.length, 0)
  assert.equal((await ok('B', 'kitchen.partner')).scene, 'empty')
})

test('下单状态机：待接单可取消，接单后完成；不能拒单；销量只算完成', async () => {
  await bindCouple()
  await ok('A', 'kitchen.create', { name: '阿杏的小厨房' })
  await ok('B', 'kitchen.create', { name: '阿桃的小厨房' })
  const { dish } = await ok('A', 'kitchen.createDish', { name: '抱抱', newCategoryName: '心意', desc: '抱一下' })
  const { dish: walk } = await ok('A', 'kitchen.createDish', { name: '散步', categoryId: dish.categoryId })

  await failsWith('NOT_FOUND', 'B', 'kitchen.updateDish', { id: dish.id, name: '偷改', categoryId: dish.categoryId })
  await failsWith('INVALID', 'A', 'kitchen.orderCreate', { items: [{ dishId: dish.id, quantity: 1 }] })
  await failsWith('INVALID', 'B', 'kitchen.orderCreate', { items: [] })
  await failsWith('INVALID', 'B', 'kitchen.orderCreate', { items: [{ dishId: dish.id, quantity: 0 }] })
  await failsWith('INVALID', 'B', 'kitchen.orderCreate', { items: [{ dishId: dish.id, quantity: 1, tags: ['月售'] }] })

  const created = await ok('B', 'kitchen.orderCreate', {
    items: [
      { dishId: dish.id, quantity: 3, tags: ['想你了', '今天就要', '今天就要'] },
      { dishId: walk.id, quantity: 1, tags: [] },
    ],
    note: '今天加班有点累，想要抱抱',
  })
  assert.equal(created.order.status, 'pending')
  assert.equal(created.order.canCancel, true)
  assert.equal(created.order.canReorder, false)
  assert.equal(created.order.note, '今天加班有点累，想要抱抱')
  assert.deepEqual(created.order.lines[0].tags, ['今天就要', '想你了'])
  assert.equal(created.order.lines[0].quantity, 3)
  assert.equal(created.order.lines[0].name, '抱抱')
  assert.equal('cover' in created.order, false)
  assert.equal((await ok('A', 'kitchen.mine')).pendingCount, 1)
  assert.equal((await ok('B', 'kitchen.mine')).pendingCount, 0)
  assert.equal((await ok('B', 'kitchen.partner')).dishes[0].salesLabel, '')

  const pendingOps = await ok('A', 'kitchen.ops', { status: 'pending' })
  assert.equal(pendingOps.items.length, 1)
  assert.equal(pendingOps.items[0].names, '抱抱、散步')
  assert.equal(pendingOps.items[0].canAccept, true)
  assert.equal(pendingOps.items[0].canComplete, false)
  assert.equal(pendingOps.items[0].ordererName, '阿桃')
  assert.equal((await ok('B', 'kitchen.ops', { status: 'pending' })).items.length, 0)
  assert.equal((await ok('A', 'kitchen.myOrders')).items.length, 0)

  await failsWith('FORBIDDEN', 'A', 'kitchen.cancel', { id: created.order.id })
  await failsWith('FORBIDDEN', 'B', 'kitchen.accept', { id: created.order.id })
  await failsWith('INVALID', 'A', 'kitchen.complete', { id: created.order.id })
  await failsWith('UNKNOWN_ROUTE', 'A', 'kitchen.reject', { id: created.order.id })

  const cancelled = await ok('B', 'kitchen.cancel', { id: created.order.id })
  assert.equal(cancelled.order.status, 'cancelled')
  assert.equal(cancelled.order.canCancel, false)
  assert.equal((await ok('A', 'kitchen.mine')).pendingCount, 0)
  assert.equal((await ok('A', 'kitchen.ops', { status: 'pending' })).items.length, 0)
  assert.equal((await ok('B', 'kitchen.partner')).dishes.find((d) => d.id === dish.id).doneCount, 0)
  await failsWith('INVALID', 'B', 'kitchen.cancel', { id: created.order.id })

  const again = await ok('B', 'kitchen.orderCreate', {
    items: [{ dishId: dish.id, quantity: 4, tags: ['周末'] }],
    note: '不要带进再来一单',
  })
  const accepted = await ok('A', 'kitchen.accept', { id: again.order.id })
  assert.equal(accepted.order.status, 'in_progress')
  assert.equal(accepted.order.canComplete, true)
  assert.equal((await ok('A', 'kitchen.ops', { status: 'pending' })).items.length, 0)
  assert.equal((await ok('A', 'kitchen.ops', { status: 'in_progress' })).items.length, 1)
  await failsWith('INVALID', 'B', 'kitchen.cancel', { id: again.order.id })
  await failsWith('INVALID', 'A', 'kitchen.accept', { id: again.order.id })
  assert.equal((await ok('B', 'kitchen.partner')).dishes.find((d) => d.id === dish.id).salesLabel, '')

  const done = await ok('A', 'kitchen.complete', { id: again.order.id })
  assert.equal(done.order.status, 'done')
  assert.equal((await ok('A', 'kitchen.ops', { status: 'done' })).items.length, 1)
  assert.equal((await ok('A', 'kitchen.ops', { status: 'in_progress' })).items.length, 0)
  await failsWith('INVALID', 'A', 'kitchen.complete', { id: again.order.id })
  await failsWith('INVALID', 'B', 'kitchen.cancel', { id: again.order.id })

  const mine = await ok('B', 'kitchen.myOrders')
  const finished = mine.items.find((o) => o.id === again.order.id)
  assert.equal(finished.canReorder, true)
  assert.equal(finished.canCancel, false)
  assert.equal(finished.note, '不要带进再来一单')
  assert.equal(finished.lines[0].name, '抱抱')
  const counted = (await ok('B', 'kitchen.partner')).dishes.find((d) => d.id === dish.id)
  assert.equal(counted.doneCount, 1, '同一单多份只计 1 次，取消的那单不计')
  assert.equal(counted.salesLabel, '我们点过 1 次')

  await ok('A', 'kitchen.updateDish', { id: dish.id, name: '改名后的抱抱', categoryId: dish.categoryId, onShelf: true })
  const kept = (await ok('B', 'kitchen.myOrders')).items.find((o) => o.id === again.order.id)
  assert.equal(kept.lines[0].name, '抱抱', '订单保留下单时的名称')

  for (let i = 0; i < 4; i++) {
    const row = await ok('B', 'kitchen.orderCreate', { items: [{ dishId: dish.id, quantity: 1 }] })
    await ok('A', 'kitchen.accept', { id: row.order.id })
    await ok('A', 'kitchen.complete', { id: row.order.id })
  }
  const often = (await ok('B', 'kitchen.partner')).dishes.find((d) => d.name === '改名后的抱抱')
  assert.equal(often.doneCount, 5)
  assert.equal(often.salesLabel, '常点')
})
