import type { MoUser } from '../types/user'

const STORAGE_KEY = 'mo_user'
/** 用户主动退出后置位：登录页不得再根据云端资料自动恢复会话 */
const WAIT_EXPLICIT_RELOGIN_KEY = 'mo_wait_explicit_relogin'

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
  setWaitExplicitRelogin,
  loadWaitExplicitRelogin,
  clearWaitExplicitRelogin,
}
