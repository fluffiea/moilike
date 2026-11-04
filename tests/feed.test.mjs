import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const root = fileURLToPath(new URL('..', import.meta.url))

/** @type {typeof import('../src/core/feed.ts')} */
let feedMod

before(async () => {
  globalThis.wx = {
    getStorageSync() {
      return ''
    },
    setStorageSync() {},
    removeStorageSync() {},
    showToast() {},
    setTabBarBadge() {},
    removeTabBarBadge() {},
  }
  const dir = await mkdtemp(join(tmpdir(), 'moilike-feed-'))
  const outfile = join(dir, 'feed.mjs')
  await build({
    entryPoints: [join(root, 'src/core/feed.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile,
    logLevel: 'silent',
  })
  feedMod = await import(pathToFileURL(outfile).href)
  await rm(dir, { recursive: true, force: true })
})

function host() {
  const calls = []
  return {
    calls,
    setData(patch) {
      calls.push(patch)
    },
  }
}

function ok(items, nextCursor = '') {
  return { ok: true, data: { items, nextCursor } }
}

function fail(message = '网络不好') {
  return { ok: false, code: 'NET', message }
}

function last(h) {
  return h.calls[h.calls.length - 1]
}

function keysOf(patch) {
  return Object.keys(patch)
}

test('sortKey 不改变翻页：仍按接口顺序追加，不重发整表', async () => {
  const h = host()
  const pages = [
    ok([{ id: 'old', t: 1 }], 'c'),
    ok([{ id: 'new', t: 9 }], ''),
  ]
  let i = 0
  const feed = new feedMod.Feed({
    host: h,
    path: 'feed',
    fetch: async () => pages[i++],
    view: (item) => item,
    sortKey: (item) => item.t,
  })
  await feed.refresh()
  h.calls.length = 0
  await feed.loadMore()
  const patch = last(h)
  assert.deepEqual(
    feed.raw.map((item) => item.id),
    ['old', 'new'],
  )
  assert.equal('feed.items[1]' in patch, true)
  assert.equal(patch['feed.items[1]'].id, 'new')
  assert.equal('feed.items' in patch, false)
  assert.equal(patch['feed.status'], 'ready')
  assert.equal(patch['feed.more'], 'end')
})

test('order 才在翻页时重排并重发整表', async () => {
  const h = host()
  const pages = [
    ok([{ id: 'done', unread: false, t: 10 }], 'c'),
    ok([{ id: 'wait', unread: true, t: 1 }], ''),
  ]
  let i = 0
  const feed = new feedMod.Feed({
    host: h,
    path: 'mine',
    fetch: async () => pages[i++],
    view: (item) => ({ id: item.id }),
    order: (items) =>
      items.slice().sort((a, b) => Number(b.unread) - Number(a.unread) || b.t - a.t),
  })
  await feed.refresh()
  h.calls.length = 0
  await feed.loadMore()
  const patch = last(h)
  assert.deepEqual(
    feed.raw.map((item) => item.id),
    ['wait', 'done'],
  )
  assert.deepEqual(
    patch['mine.items'].map((item) => item.id),
    ['wait', 'done'],
  )
  assert.equal(keysOf(patch).some((key) => key.startsWith('mine.items[')), false)
  assert.equal(patch['mine.status'], 'ready')
})

test('空列表翻页成功会把 status 从 loading 收回 ready，且仍是追加', async () => {
  const h = host()
  const pages = [ok([], 'c'), ok([{ id: 'a' }], '')]
  let i = 0
  const feed = new feedMod.Feed({
    host: h,
    path: 'tabs[1]',
    fetch: async () => pages[i++],
    view: (item) => item,
    pageErrorIfEmpty: true,
  })
  await feed.refresh()
  assert.equal(last(h)['tabs[1].status'], 'empty')
  h.calls.length = 0
  await feed.loadMore()
  const patch = last(h)
  assert.equal(patch['tabs[1].status'], 'ready')
  assert.equal(patch['tabs[1].items[0]'].id, 'a')
  assert.equal('tabs[1].items' in patch, false)
  assert.equal(feed.hasMore, false)
})

test('pageErrorIfEmpty 只在空列表翻页失败时标整页 error', async () => {
  async function run(pageErrorIfEmpty) {
    const h = host()
    const pages = [ok([], 'c'), fail('拉不到')]
    let i = 0
    const feed = new feedMod.Feed({
      host: h,
      path: 'feed',
      fetch: async () => pages[i++],
      view: (item) => item,
      pageErrorIfEmpty,
    })
    await feed.refresh()
    h.calls.length = 0
    await feed.loadMore()
    return last(h)
  }

  const optedIn = await run(true)
  assert.equal(optedIn['feed.status'], 'error')
  assert.equal(optedIn['feed.more'], 'idle')
  assert.equal(optedIn['feed.errorText'], '拉不到')

  const normal = await run(false)
  assert.equal(normal['feed.more'], 'error')
  assert.equal('feed.status' in normal, false)
})

test('有条目时翻页失败只标 more:error，即使开了 pageErrorIfEmpty', async () => {
  const h = host()
  const pages = [ok([{ id: 'a' }], 'c'), fail('下一页失败')]
  let i = 0
  const feed = new feedMod.Feed({
    host: h,
    path: 'feed',
    fetch: async () => pages[i++],
    view: (item) => item,
    pageErrorIfEmpty: true,
    sortKey: (item) => item.id.length,
  })
  await feed.refresh()
  h.calls.length = 0
  await feed.loadMore()
  const patch = last(h)
  assert.deepEqual(patch, { 'feed.more': 'error' })
  assert.equal(feed.raw.length, 1)
})

test('sortKey 仍只在单条更新时重排', async () => {
  const h = host()
  const feed = new feedMod.Feed({
    host: h,
    path: 'feed',
    fetch: async () => ok([{ id: 'a', t: 1 }], ''),
    view: (item) => item,
    sortKey: (item) => item.t,
  })
  await feed.refresh()
  feed.upsert({ id: 'b', t: 5 })
  assert.deepEqual(
    feed.raw.map((item) => item.id),
    ['b', 'a'],
  )
  const patch = last(h)
  assert.deepEqual(
    patch['feed.items'].map((item) => item.id),
    ['b', 'a'],
  )
})

test('清空且还有下一页才继续拉', () => {
  const { shouldContinueDrainedFeed } = feedMod
  assert.equal(shouldContinueDrainedFeed(0, true), true)
  assert.equal(shouldContinueDrainedFeed(0, false), false)
  assert.equal(shouldContinueDrainedFeed(2, true), false)
})
