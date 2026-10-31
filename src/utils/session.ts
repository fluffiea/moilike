import type { MoUser } from '../types/user'
import {
  resonancePrefsSignature,
  invalidateResonancePrefsApplyCache,
} from '../constants/resonance-preferences'

const STORAGE_KEY = 'mo_user'
/** 用户主动退出后置位：登录页不得再根据云端资料自动恢复会话 */
const WAIT_EXPLICIT_RELOGIN_KEY = 'mo_wait_explicit_relogin'

/** 已下线功能曾写入的 key；仅做清理，禁止再写入（当前无条目） */
const LEGACY_STORAGE_KEYS_REMOVED = [] as const

/** 移除遗留 Storage，避免占配额或被误读 */
export function removeLegacyUnusedStorageKeys(): void {
  for (const k of LEGACY_STORAGE_KEYS_REMOVED) {
    try {
      wx.removeStorageSync(k)
    } catch {
      // ignore
    }
  }
}

export function loadMoUser(): MoUser | null {
  try {
    const v = wx.getStorageSync(STORAGE_KEY) as unknown
    if (v && typeof v === 'object' && 'openId' in v) {
      return v as MoUser
    }
  } catch {
    // ignore
  }
  return null
}

/** 用于列表/详情在 onShow 判断「本地会话里的昵称/头像是否相对上次有变」，从而触发重拉云列表（含 openId 防串号） */
export function moUserProfileDisplayStamp(): string {
  const u = loadMoUser()
  if (!u) return '|'
  const oid = typeof u.openId === 'string' ? u.openId.trim() : ''
  const nick = typeof u.nickName === 'string' ? u.nickName.trim() : ''
  const av = typeof u.avatarUrl === 'string' ? u.avatarUrl.trim() : ''
  let partner = ''
  if (u.partner && typeof u.partner === 'object') {
    const po = typeof u.partner.openId === 'string' ? u.partner.openId.trim() : ''
    const pn = typeof u.partner.nickName === 'string' ? u.partner.nickName.trim() : ''
    const pa = typeof u.partner.avatarUrl === 'string' ? u.partner.avatarUrl.trim() : ''
    partner = `${po}\u0002${pn}\u0002${pa}`
  }
  return `${oid}\u0001${nick}\u0001${av}\u0001${partner}`
}

/** 伴侣关系维度的列表作用域键（绑定/解绑后变化）；moments、resonance 等 Tab 共用 */
export function moCoupleScopeKey(): string {
  const u = loadMoUser()
  if (!u) return '|'
  const me = typeof u.openId === 'string' ? u.openId : ''
  let fromPartnerOpenId = ''
  if (typeof u.partnerOpenId === 'string' && u.partnerOpenId.trim()) {
    fromPartnerOpenId = u.partnerOpenId.trim()
  }
  let fromPartner = ''
  if (u.partner && typeof u.partner.openId === 'string' && u.partner.openId.trim()) {
    fromPartner = u.partner.openId.trim()
  }
  const partner = fromPartnerOpenId || fromPartner
  return `${me}|${partner}`
}

function syncGlobalMoUser(user: MoUser | undefined): void {
  try {
    const app = getApp<IAppOption>()
    app.globalData.moUser = user
  } catch {
    // App 未就绪时忽略，本地存储仍有效
  }
}

export function saveMoUser(user: MoUser): void {
  const prev = loadMoUser()
  try {
    wx.setStorageSync(STORAGE_KEY, user)
  } catch {
    return
  }
  syncGlobalMoUser(user)
  const prevOpenId = prev ? prev.openId : undefined
  const prevPrefs = prev ? prev.preferences : undefined
  if (
    resonancePrefsSignature(prevOpenId, prevPrefs) !==
    resonancePrefsSignature(user.openId, user.preferences)
  ) {
    invalidateResonancePrefsApplyCache()
  }
}

export function clearMoUser(): void {
  try {
    wx.removeStorageSync(STORAGE_KEY)
  } catch {
    // ignore
  }
  syncGlobalMoUser(undefined)
  invalidateResonancePrefsApplyCache()
  removeLegacyUnusedStorageKeys()
}

export function setWaitExplicitRelogin(): void {
  try {
    wx.setStorageSync(WAIT_EXPLICIT_RELOGIN_KEY, '1')
  } catch {
    // ignore
  }
}

export function loadWaitExplicitRelogin(): boolean {
  try {
    return wx.getStorageSync(WAIT_EXPLICIT_RELOGIN_KEY) === '1'
  } catch {
    return false
  }
}

export function clearWaitExplicitRelogin(): void {
  try {
    wx.removeStorageSync(WAIT_EXPLICIT_RELOGIN_KEY)
  } catch {
    // ignore
  }
}

/** 默认导出：便于工具链/IDE 对整模块做稳定绑定（与命名导出等价） */
export default {
  loadMoUser,
  saveMoUser,
  clearMoUser,
  removeLegacyUnusedStorageKeys,
  setWaitExplicitRelogin,
  loadWaitExplicitRelogin,
  clearWaitExplicitRelogin,
  moUserProfileDisplayStamp,
  moCoupleScopeKey,
}
