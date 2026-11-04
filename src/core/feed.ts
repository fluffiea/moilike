/**
 * 列表页通用控制器：首屏缓存 → 后台刷新、下拉刷新、触底分页、单条增删改。
 *
 * 渲染数据只放在 `${path}.items` 等少量字段里；原始数据留在控制器实例上。
 * 翻页只用 `${path}.items[n]` 路径追加，不重发整表。
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
   * 排序字段（倒序）。提供后，缓存首屏、刷新、翻页和单条更新都按它重排，
   * 不再只把下一页接在末尾。共鸣「我发的」靠它把未回心放到已回心前面。
   */
  sortKey?: (item: T) => number
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

  /** 有 sortKey 时复制后再排，避免改到缓存里的原数组 */
  private arrange(list: T[]): T[] {
    const sortKey = this.opts.sortKey
    if (!sortKey) return list
    return list.slice().sort((a, b) => sortKey(b) - sortKey(a))
  }

  private renderAll(): void {
    this.set({ items: this.views(this.raw), status: this.raw.length ? 'ready' : 'empty' })
  }

  /** 首屏：有缓存先画缓存，再静默刷新 */
  start(): void {
    const cached = this.opts.cacheName ? readCache<Page<T>>(this.opts.cacheName) : null
    if (cached && cached.items.length) {
      this.raw = this.arrange(cached.items)
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
    this.raw = this.arrange(r.data.items)
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
      if (this.raw.length) this.set({ more: 'error' })
      else this.set({ more: 'idle', status: 'error', errorText: r.message })
      return
    }
    const appended = this.raw.concat(r.data.items)
    this.cursor = r.data.nextCursor
    // 排序键和接口顺序不一致时（我发的未回优先），整表重排，日期分隔才不会断在错误的邻居上
    if (this.opts.sortKey) {
      this.raw = this.arrange(appended)
      this.set({
        items: this.views(this.raw),
        status: this.raw.length ? 'ready' : 'empty',
        more: this.cursor ? 'idle' : 'end',
      })
      return
    }
    const start = this.raw.length
    this.raw = appended
    const patch: Record<string, unknown> = { [`${this.opts.path}.more`]: this.cursor ? 'idle' : 'end' }
    this.views(this.raw, start).forEach((v, i) => {
      patch[`${this.opts.path}.items[${start + i}]`] = v
    })
    this.write(patch)
  }

  /** 新增置顶（或按 sortKey 排位），已存在则原位替换 */
  upsert(item: T): void {
    const { sortKey } = this.opts
    const i = this.raw.findIndex((x) => x.id === item.id)
    if (i >= 0 && !sortKey) {
      this.raw[i] = item
      this.write({ [`${this.opts.path}.items[${i}]`]: this.opts.view(item, this.raw[i - 1]) })
      return
    }
    if (i >= 0) this.raw[i] = item
    else this.raw.unshift(item)
    if (sortKey) this.raw = this.arrange(this.raw)
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

  /** 还有下一页。列表被回心清空时，页面用它决定要不要接着拉，而不是直接显示空态 */
  get hasMore(): boolean {
    return !!this.cursor
  }
}
