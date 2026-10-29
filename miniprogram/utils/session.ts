import type { MoUser } from '../types/user'

const STORAGE_KEY = 'mo_user'

export function loadMoUser(): MoUser | null {
  try {
    const value = wx.getStorageSync(STORAGE_KEY) as unknown
    if (!value || typeof value !== 'object') return null
    const row = value as { openId?: unknown; nickName?: unknown }
    if (typeof row.openId !== 'string' || !row.openId) return null
    if (typeof row.nickName !== 'string' || !row.nickName.trim()) return null
    return value as MoUser
  } catch {
    return null
  }
}

export function saveMoUser(user: MoUser): void {
  try {
    wx.setStorageSync(STORAGE_KEY, user)
  } catch {
    return
  }
  try {
    const app = getApp<IAppOption>()
    app.globalData.moUser = user
  } catch {
    return
  }
}

export function clearMoUser(): void {
  try {
    wx.removeStorageSync(STORAGE_KEY)
  } catch {
    return
  }
  try {
    const app = getApp<IAppOption>()
    app.globalData.moUser = undefined
  } catch {
    return
  }
}

export function userIsPaired(user: MoUser | null): boolean {
  if (!user) return false
  if (user.paired) return true
  if (typeof user.partnerOpenId === 'string' && user.partnerOpenId.trim()) return true
  if (user.partner && user.partner.openId) return true
  return false
}
