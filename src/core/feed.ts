/**
 * 列表页通用控制器：首屏缓存 → 后台刷新、下拉刷新、触底分页、单条增删改。
 *
 * 渲染数据只放在 `${path}.items` 等少量字段里；原始数据留在控制器实例上。
 * 翻页默认只用 `${path}.items[n]` 追加，不重发整表。
 * 只有显式提供 `order` 时，翻页才重排已加载条目并重发整表。
 */
import type { Page, Result } from '../types/api'
import { readCache, writeCache } from './store'

export type FeedStatus = 'loading' | 'ready' | 'empty' | 'error'
export type MoreStatus = 'idle' | 'loading' | 'end' | 'error'

export type FeedData<V> = {
  items: V[]
  status: FeedStatus
  more: MoreStatus
  refreshing: boolean
  errorText: string
}

export function emptyFeed<V>(): FeedData<V> {
  return { items: [], status: 'loading', more: 'idle', refreshing: false, errorText: '' }
}

/**
 * 列表被清空且还有下一页时，应继续翻页，而不是当成空态。
 * 共鸣「等我回声」在回心移出最后一条后用它，与排序无关。
 */
export function shouldContinueDrainedFeed(itemCount: number, hasMore: boolean): boolean {
  return itemCount === 0 && hasMore
}

type Host = { setData(data: Record<string, unknown>): void }

export type FeedOptions<T extends { id: string }, V> = {
  host: Host
  /** data 中的路径，如 'feed' 或 'tabs[1]' */
  path: string
  /** 只缓存不带筛选条件的首页 */
  cacheName?: string
  fetch: (cursor: string) => Promise<Result<Page<T>>>
  /** prev 为列表中的上一条，用于决定是否显示日期分隔 */
  view: (item: T, prev: T | undefined) => V
  /**
   * 单条新增或改时间后按它倒序插回原位。
   * 不参与翻页：下一页仍按接口顺序追加。
   */
  sortKey?: (item: T) => number
  /**
   * 展示顺序与接口分页序不同时提供。
   * 首屏、刷新、翻页、单条更新都按它重排已加载条目，翻页因此重发整表。
   * 目前没有列表用到；需要整表重排时用这个，不要用 sortKey 代替。
   */
  order?: (items: T[]) => T[]
  /**
   * 翻页失败且当前一条都没有时，把整页标成 error。
   * 只给共鸣「等我回声」：那一栏会在本页被回心清空后主动接着拉。
   * 信件、记账、厨房不要开，空列表上的翻页失败仍只标 more:error。
   */
  pageErrorIfEmpty?: boolean
}

export class Feed<T extends { id: string }, V> {
  raw: T[] = []
  loadedAt = 0
  private cursor = ''
  private busy = false
  private disposed = false

  constructor(private opts: FeedOptions<T, V>) {}

  /** 被新的列表（如切换筛选条件）取代后调用，丢弃仍在途的请求结果 */
  dispose(): void {
    this.disposed = true
  }

  private write(data: Record<string, unknown>): void {
    if (!this.disposed) this.opts.host.setData(data)
  }

  private set(patch: Partial<FeedData<V>>): void {
    const data: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) data[`${this.opts.path}.${k}`] = v
    this.write(data)
  }

  private views(list: T[], from = 0): V[] {
    return list.slice(from).map((item, i) => this.opts.view(item, list[from + i - 1]))
  }

  /** 有 order 时复制后再排，避免改到缓存或接口返回的原数组 */
  private ordered(list: T[]): T[] {
    const { order } = this.opts
    return order ? order(list.slice()) : list
  }

  private renderAll(): void {
    this.set({ items: this.views(this.raw), status: this.raw.length ? 'ready' : 'empty' })
  }

  /** 首屏：有缓存先画缓存，再静默刷新 */
  start(): void {
    const cached = this.opts.cacheName ? readCache<Page<T>>(this.opts.cacheName) : null
    if (cached && cached.items.length) {
      this.raw = this.ordered(cached.items)
      this.cursor = cached.nextCursor
      this.renderAll()
      this.set({ more: this.cursor ? 'idle' : 'end' })
    }
    void this.refresh()
  }

  /** 超过 maxAgeMs 未刷新时静默刷新，用于页面重新显示 */
  refreshIfStale(maxAgeMs: number): void {
    if (Date.now() - this.loadedAt > maxAgeMs) void this.refresh()
  }

  async refresh(pullDown = false): Promise<void> {
    if (this.busy) {
      if (pullDown) this.set({ refreshing: false })
      return
    }
    this.busy = true
    if (pullDown) this.set({ refreshing: true })
    const r = await this.opts.fetch('')
    this.busy = false
    if (!r.ok) {
      if (this.raw.length) {
        this.set({ refreshing: false })
        wx.showToast({ title: r.message, icon: 'none' })
      } else {
        this.set({ refreshing: false, status: 'error', errorText: r.message })
      }
      return
    }
    this.raw = this.ordered(r.data.items)
    this.cursor = r.data.nextCursor
    this.loadedAt = Date.now()
    this.set({
      items: this.views(this.raw),
      status: this.raw.length ? 'ready' : 'empty',
      more: this.cursor ? 'idle' : 'end',
      refreshing: false,
    })
    if (this.opts.cacheName && !this.disposed) writeCache(this.opts.cacheName, r.data)
  }

  async loadMore(): Promise<void> {
    if (this.busy || !this.cursor) return
    this.busy = true
    this.set({ more: 'loading' })
    const r = await this.opts.fetch(this.cursor)
    this.busy = false
    if (!r.ok) {
      if (!this.raw.length && this.opts.pageErrorIfEmpty) {
        this.set({ more: 'idle', status: 'error', errorText: r.message })
      } else {
        this.set({ more: 'error' })
      }
      return
    }
    const more: MoreStatus = r.data.nextCursor ? 'idle' : 'end'
    this.cursor = r.data.nextCursor
    if (this.opts.order) {
      this.raw = this.ordered(this.raw.concat(r.data.items))
      this.set({
        items: this.views(this.raw),
        status: this.raw.length ? 'ready' : 'empty',
        more,
      })
      return
    }
    const start = this.raw.length
    this.raw = this.raw.concat(r.data.items)
    const patch: Record<string, unknown> = {
      [`${this.opts.path}.more`]: more,
      // 与 order、sortKey 无关。等我回声会先把空列表标成 loading，成功后这里回到 ready 或 empty。
      [`${this.opts.path}.status`]: this.raw.length ? 'ready' : 'empty',
    }
    this.views(this.raw, start).forEach((v, i) => {
      patch[`${this.opts.path}.items[${start + i}]`] = v
    })
    this.write(patch)
  }

  /** 新增置顶（或按 sortKey / order 排位），已存在则原位替换 */
  upsert(item: T): void {
    const i = this.raw.findIndex((x) => x.id === item.id)
    if (this.opts.order) {
      if (i >= 0) this.raw[i] = item
      else this.raw.unshift(item)
      this.raw = this.ordered(this.raw)
      this.renderAll()
      return
    }
    const { sortKey } = this.opts
    if (i >= 0 && !sortKey) {
      this.raw[i] = item
      this.write({ [`${this.opts.path}.items[${i}]`]: this.opts.view(item, this.raw[i - 1]) })
      return
    }
    if (i >= 0) this.raw[i] = item
    else this.raw.unshift(item)
    if (sortKey) this.raw.sort((a, b) => sortKey(b) - sortKey(a))
    this.renderAll()
  }

  remove(id: string): void {
    const before = this.raw.length
    this.raw = this.raw.filter((x) => x.id !== id)
    if (this.raw.length !== before) this.renderAll()
  }

  patch(id: string, fn: (item: T) => T): void {
    const i = this.raw.findIndex((x) => x.id === id)
    if (i >= 0) this.upsert(fn(this.raw[i]))
  }

  find(id: string): T | undefined {
    return this.raw.find((x) => x.id === id)
  }

  /** 还有下一页。列表被回心清空时，页面用它决定要不要接着拉 */
  get hasMore(): boolean {
    return !!this.cursor
  }
}
