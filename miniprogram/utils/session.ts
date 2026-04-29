import type { MoUser } from '../types/user'

const STORAGE_KEY = 'mo_user'

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

function syncGlobalMoUser(user: MoUser | undefined): void {
  try {
    const app = getApp<IAppOption>()
    app.globalData.moUser = user
  } catch {
    // App 未就绪时忽略，本地存储仍有效
  }
}

export function saveMoUser(user: MoUser): void {
  wx.setStorageSync(STORAGE_KEY, user)
  syncGlobalMoUser(user)
}

export function clearMoUser(): void {
  try {
    wx.removeStorageSync(STORAGE_KEY)
  } catch {
    // ignore
  }
  syncGlobalMoUser(undefined)
}
