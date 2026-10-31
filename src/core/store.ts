/**
 * 全局状态：当前用户、跨页事件、页面间交接数据、列表缓存。
 * 运行时一律读内存；Storage 只用于冷启动恢复。
 */
import type { CommentSummary, DailyPost, LetterItem, ReportPost, User } from '../types/api'

const USER_KEY = 'mo_user_v2'
const LOGGED_OUT_KEY = 'mo_logged_out'
const CACHE_PREFIX = 'mo_cache:'

/** 旧版本写过的 key，启动时清理 */
const LEGACY_KEYS = [
  'mo_user',
  'mo_wait_explicit_relogin',
  'mo_feed_daily_v1',
  'mo_feed_report_all_v1',
  'mo_feed_report_action_needed_v1',
  'mo_feed_report_mine_v1',
  'moilike_daily_compose_edit_staging',
  'moilike_report_compose_edit_staging',
  'moilike_daily_camera_prefill',
  'moilike_report_camera_prefill',
]

let user: User | null = null

function readStorage<T>(key: string): T | null {
  try {
    const v = wx.getStorageSync(key)
    return v === '' || v == null ? null : (v as T)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: unknown): void {
  try {
    wx.setStorageSync(key, value)
  } catch {
    // 存储满时放弃持久化，内存状态不受影响
  }
}

/** 从旧版会话迁移：保留登录态，资料由首页刷新补齐 */
function migrateLegacy(): void {
  const old = readStorage<{ openId?: string; nickName?: string; signature?: string; avatarUrl?: string }>('mo_user')
  if (old && old.openId && old.nickName && !readStorage(USER_KEY)) {
    writeStorage(USER_KEY, {
      openId: old.openId,
      nickName: old.nickName,
      signature: old.signature || '',
      avatarFileId: old.avatarUrl || '',
      avatarUrl: '',
      togetherSinceMs: null,
      preferences: { resonanceReportFilter: 'mine' },
      partner: null,
    } as User)
  }
  if (readStorage('mo_wait_explicit_relogin') === '1') writeStorage(LOGGED_OUT_KEY, true)
  for (const k of LEGACY_KEYS) wx.removeStorage({ key: k, fail: () => {} })
}

export function initStore(): void {
  migrateLegacy()
  user = readStorage<User>(USER_KEY)
}

export const getUser = (): User | null => user
export const isRegistered = (u: User | null): u is User => !!u && !!u.nickName

export function setUser(next: User): void {
  const scopeChanged = !user || user.openId !== next.openId || partnerId(user) !== partnerId(next)
  user = next
  writeStorage(USER_KEY, next)
  if (scopeChanged) clearCache()
  emit('user', next)
}

export function logout(): void {
  user = null
  wx.removeStorageSync(USER_KEY)
  writeStorage(LOGGED_OUT_KEY, true)
  clearCache()
  emit('user', null)
}

export const isLoggedOut = (): boolean => readStorage(LOGGED_OUT_KEY) === true
export const clearLoggedOut = (): void => wx.removeStorageSync(LOGGED_OUT_KEY)

const partnerId = (u: User | null): string => (u && u.partner ? u.partner.openId : '')

/* ---------- 事件 ---------- */

export interface Events {
  user: User | null
  'daily:upsert': DailyPost
  'daily:remove': string
  'daily:summary': { id: string; summary: CommentSummary }
  'report:upsert': ReportPost
  'report:remove': string
  'letter:upsert': LetterItem
  'letter:remove': string
}

type Listener<K extends keyof Events> = (payload: Events[K]) => void
const listeners: { [K in keyof Events]?: Listener<K>[] } = {}

/** 返回取消订阅函数，页面/组件在 detached 时调用 */
export function on<K extends keyof Events>(event: K, fn: Listener<K>): () => void {
  const list = (listeners[event] || (listeners[event] = [])) as Listener<K>[]
  list.push(fn)
  return () => {
    const i = list.indexOf(fn)
    if (i >= 0) list.splice(i, 1)
  }
}

export function emit<K extends keyof Events>(event: K, payload: Events[K]): void {
  const list = listeners[event] as Listener<K>[] | undefined
  if (list) list.slice().forEach((fn) => fn(payload))
}

/* ---------- 页面交接：列表 → 详情 / 编辑，先用已有数据渲染，不再走 Storage ---------- */

const handoffs = new Map<string, unknown>()

export function handoff(key: string, value: unknown): void {
  handoffs.set(key, value)
}

export function takeHandoff<T>(key: string): T | null {
  const v = handoffs.get(key)
  handoffs.delete(key)
  return v === undefined ? null : (v as T)
}

/* ---------- 列表缓存：按「本人 + 伴侣」分区 ---------- */

/** 服务端签名链接有效期 2 小时，超过该时长的缓存不再用于首屏 */
export const CACHE_MAX_AGE_MS = 100 * 60 * 1000

function cacheKey(name: string): string {
  return `${CACHE_PREFIX}${user ? user.openId : ''}:${partnerId(user)}:${name}`
}

export function readCache<T>(name: string): T | null {
  const entry = readStorage<{ savedAt: number; value: T }>(cacheKey(name))
  if (!entry || Date.now() - entry.savedAt > CACHE_MAX_AGE_MS) return null
  return entry.value
}

export function writeCache(name: string, value: unknown): void {
  writeStorage(cacheKey(name), { savedAt: Date.now(), value })
}

function clearCache(): void {
  try {
    for (const k of wx.getStorageInfoSync().keys) {
      if (k.startsWith(CACHE_PREFIX)) wx.removeStorageSync(k)
    }
  } catch {
    // ignore
  }
}
