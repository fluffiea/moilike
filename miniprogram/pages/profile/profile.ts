import { redirectIfNotAuthed } from '../../utils/auth-guard'
import type { UserCloudResult } from '../../types/cloud'
import { USER_CLOUD_FUNCTION } from '../../types/cloud'
import { PAGE_LOGIN } from '../../constants/paths'
import moSession from '../../utils/session'

type SettingId = 'editProfile' | 'changePassword' | 'preferences'

const SETTING_TITLES: Record<SettingId, string> = {
  editProfile: '编辑资料',
  changePassword: '修改密码',
  preferences: '偏好设置',
}

const SETTINGS_ITEMS: { id: SettingId; icon: string }[] = [
  { id: 'editProfile', icon: '✨' },
  { id: 'changePassword', icon: '🔒' },
  { id: 'preferences', icon: '☰' },
]

function buildSettingsRows(): { id: SettingId; label: string; icon: string }[] {
  return SETTINGS_ITEMS.map((row) => ({
    id: row.id,
    icon: row.icon,
    label: SETTING_TITLES[row.id],
  }))
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
    signature: '写点什么介绍自己吧。',
    tagLine: 'Moilike，只属于我们两个人',
    settingsRows: buildSettingsRows(),
  },
  methods: {
    applyLocalUser() {
      const u = moSession.loadMoUser()
      if (!u) return
      this.setData({
        avatarUrl: u.avatarUrl || '/images/default.png',
        nickName: u.nickName || '未设置昵称',
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
          moSession.saveMoUser(result.user)
          this.applyLocalUser()
          return
        }
        // 服务端无档案但本地仍有缓存（例如库被清空）：视为会话失效
        if (moSession.loadMoUser()) {
          moSession.clearMoUser()
          wx.reLaunch({ url: PAGE_LOGIN })
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
      wx.showModal({
        title: '退出登录',
        content: '确定要退出吗？',
        confirmText: '退出',
        cancelText: '取消',
        confirmColor: '#4A6670',
        success: (res) => {
          if (res.confirm) {
            this.performLogout()
          }
        },
      })
    },
    performLogout() {
      moSession.clearMoUser()
      moSession.setWaitExplicitRelogin()
      wx.reLaunch({ url: PAGE_LOGIN })
    },
  },
})
