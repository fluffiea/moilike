/**
 * 列表首页 Storage 持久化：页面被杀后恢复时即时渲染缓存，再静默刷新。
 * 缓存仅存文本/元数据，图片临时链接过期后由后续静默刷新修复。
 */

const FEED_CACHE_TTL_MS = 5 * 60 * 1000

export interface FeedCacheEntry<T> {
  list: T[]
  savedAt: number
  coupleScopeKey: string
}

function buildKey(base: string): string {
  return 'mo_feed_' + base + '_v1'
}

export function saveFeedCache<T>(base: string, list: T[], coupleScopeKey: string): void {
  try {
    const entry: FeedCacheEntry<T> = { list, savedAt: Date.now(), coupleScopeKey }
    wx.setStorageSync(buildKey(base), entry)
  } catch {
    // Storage 满或不可用，静默忽略
  }
}

export function loadFeedCache<T>(base: string, coupleScopeKey: string): T[] | null {
  try {
    const raw = wx.getStorageSync(buildKey(base)) as unknown
    if (!raw || typeof raw !== 'object') return null
    const entry = raw as FeedCacheEntry<T>
    if (!Array.isArray(entry.list) || entry.list.length === 0) return null
    if (typeof entry.savedAt !== 'number' || Date.now() - entry.savedAt > FEED_CACHE_TTL_MS) return null
    if (typeof entry.coupleScopeKey !== 'string' || entry.coupleScopeKey !== coupleScopeKey) return null
    return entry.list
  } catch {
    return null
  }
}

export function removeFeedCache(base: string): void {
  try {
    wx.removeStorageSync(buildKey(base))
  } catch {
    // ignore
  }
}
