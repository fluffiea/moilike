import { redirectIfNotAuthed } from '../../utils/auth-guard'
import { clearMoUser, loadMoUser, saveMoUser } from '../../utils/session'
import type { UserCloudResult } from '../../types/cloud'
import { USER_CLOUD_FUNCTION } from '../../types/cloud'

type SettingId = 'editProfile' | 'changePassword' | 'preferences'

const SETTING_TITLES: Record<SettingId, string> = {
  editProfile: '编辑资料',
  changePassword: '修改密码',
  preferences: '偏好设置',
}

Component({
  pageLifetimes: {
    show() {
      if (redirectIfNotAuthed()) return
      this.applyLocalUser()
      void this.refreshFromCloud()
    },
  },
  data: {
    avatarUrl: '/images/default.png',
    nickName: '未设置昵称',
    handle: '@未设置',
    signature: '写点什么介绍自己吧。',
    tagLine: '✦ Moilike · 只属于我们两个人 ✦',
    settingsRows: [
      { id: 'editProfile', label: '编辑资料', icon: '✨' },
      { id: 'changePassword', label: '修改密码', icon: '🔒' },
      { id: 'preferences', label: '偏好设置', icon: '☰' },
    ],
  },
  methods: {
    applyLocalUser() {
      const u = loadMoUser()
      if (!u) return
      const compact = (u.nickName != null ? u.nickName : '').replace(/\s/g, '')
      const handle = compact ? `@${compact.slice(0, 12)}` : '@未设置'
      this.setData({
        avatarUrl: u.avatarUrl || '/images/default.png',
        nickName: u.nickName || '未设置昵称',
        handle,
        signature: u.signature || '写点什么介绍自己吧。',
      })
    },
    async refreshFromCloud() {
      if (!wx.cloud) return
      try {
        const res = await wx.cloud.callFunction({
          name: USER_CLOUD_FUNCTION,
          data: { action: 'getProfile' },
        })
        const result = res.result as UserCloudResult
        if (!result || result.ok !== true) return
        if (result.user) {
          saveMoUser(result.user)
          this.applyLocalUser()
          return
        }
        // 服务端无档案但本地仍有缓存（例如库被清空）：视为会话失效
        if (loadMoUser()) {
          clearMoUser()
          wx.reLaunch({ url: '/pages/login/login' })
        }
      } catch {
        // 离线时忽略
      }
    },
    onSettingTap(e: WechatMiniprogram.TouchEvent) {
      const id = e.currentTarget.dataset.id as SettingId | undefined
      const title = id && id in SETTING_TITLES ? SETTING_TITLES[id] : '该功能'
      wx.showToast({ title: `${title}，敬请期待`, icon: 'none' })
    },
    onLogoutTap() {
      clearMoUser()
      wx.reLaunch({ url: '/pages/login/login' })
    },
  },
})
