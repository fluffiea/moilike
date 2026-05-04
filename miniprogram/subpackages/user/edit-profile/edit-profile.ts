import { redirectIfNotAuthed } from '../../../utils/auth-guard'
import type { UserCloudResult } from '../../../types/cloud'
import { USER_CLOUD_FUNCTION } from '../../../types/cloud'
import { PAGE_LOGIN, TAB_PROFILE } from '../../../constants/paths'
import { formatUserCloudBizError, showCloudInvokeErrorToast } from '../../../utils/cloud-invoke'
import moSession from '../../../utils/session'
import {
  DEFAULT_AVATAR_PATH,
  avatarImageSrcWhileCloudPending,
  resolveAvatarForDisplay,
} from '../../../utils/avatar-display'

function isPersistedRemoteAvatarRef(ref: string): boolean {
  const s = ref.trim()
  return s.startsWith('cloud://') || /^https?:\/\//i.test(s)
}

Component({
  lifetimes: {
    attached() {
      if (moSession.loadMoUser()) {
        this.refreshFormFromSession()
      }
    },
  },
  pageLifetimes: {
    show() {
      if (redirectIfNotAuthed()) return
      this.refreshFormFromSession()
      void this.refreshFromCloud()
    },
  },
  data: {
    nickName: '',
    signature: '',
    avatarUrl: '/images/default.png',
    /** 与 moSession 中一致的云 fileID / https；展示与保存均直连 */
    avatarPersistedRef: '',
    hasChosenAvatar: false,
    submitting: false,
  },
  methods: {
    refreshFormFromSession() {
      const u = moSession.loadMoUser()
      if (!u) return
      const raw = typeof u.avatarUrl === 'string' ? u.avatarUrl.trim() : ''
      let display = DEFAULT_AVATAR_PATH
      if (raw && raw !== DEFAULT_AVATAR_PATH) {
        display = avatarImageSrcWhileCloudPending(raw)
      }
      this.setData({
        nickName: u.nickName != null ? u.nickName : '',
        signature: u.signature != null ? u.signature : '',
        hasChosenAvatar: false,
        avatarPersistedRef: raw,
        avatarUrl: display,
      })
      void this.resolvePersistedAvatarForDisplay(raw)
    },

    async resolvePersistedAvatarForDisplay(rawPersisted: string) {
      if (!rawPersisted || rawPersisted === DEFAULT_AVATAR_PATH) return
      if (!rawPersisted.startsWith('cloud://')) return
      if (this.data.hasChosenAvatar) return
      try {
        const url = await resolveAvatarForDisplay(rawPersisted)
        if (url && url !== DEFAULT_AVATAR_PATH) {
          this.setData({ avatarUrl: url })
        }
      } catch {
        // 保持占位默认图
      }
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
          this.refreshFormFromSession()
          return
        }
        if (moSession.loadMoUser()) {
          moSession.clearMoUser()
          wx.reLaunch({ url: PAGE_LOGIN })
        }
      } catch {
        // 离线时忽略
      }
    },

    onChooseAvatar(e: WechatMiniprogram.CustomEvent<{ avatarUrl: string }>) {
      const url = e.detail.avatarUrl
      if (url) {
        this.setData({ avatarUrl: url, hasChosenAvatar: true })
      }
    },

    onNickInput(e: WechatMiniprogram.Input) {
      this.setData({ nickName: e.detail.value })
    },

    onSignatureInput(e: WechatMiniprogram.Input) {
      this.setData({ signature: e.detail.value })
    },

    onNavBack() {
      wx.navigateBack({
        fail: () => {
          wx.switchTab({ url: TAB_PROFILE })
        },
      })
    },

    async onSave() {
      if (!wx.cloud) {
        wx.showToast({ title: '当前环境不支持云开发', icon: 'none' })
        return
      }
      const nickName = this.data.nickName.trim()
      if (!nickName) {
        wx.showToast({ title: '请填写昵称', icon: 'none' })
        return
      }

      const displayPath = this.data.avatarUrl
      const persisted = (this.data.avatarPersistedRef || '').trim()

      if (!this.data.hasChosenAvatar && !isPersistedRemoteAvatarRef(persisted)) {
        wx.showToast({ title: '请选择头像', icon: 'none' })
        return
      }

      if (this.data.submitting) return
      this.setData({ submitting: true })
      wx.showLoading({ title: '保存中' })
      try {
        await new Promise<void>((resolve, reject) => {
          wx.login({ success: () => resolve(), fail: (err) => reject(err) })
        })

        let avatarForCloud = ''

        if (this.data.hasChosenAvatar) {
          const avPath = displayPath
          if (typeof avPath === 'string' && avPath.startsWith('cloud://')) {
            avatarForCloud = avPath
          } else if (typeof avPath === 'string' && /^https?:\/\//i.test(avPath)) {
            avatarForCloud = avPath
          } else if (avPath && avPath !== '/images/default.png') {
            try {
              const up = await wx.cloud.uploadFile({
                cloudPath: `avatars/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`,
                filePath: avPath,
              })
              avatarForCloud = up.fileID
            } catch {
              wx.showToast({ title: '头像上传失败，请重试', icon: 'none' })
              return
            }
          }
        } else if (isPersistedRemoteAvatarRef(persisted)) {
          avatarForCloud = persisted
        }

        if (!avatarForCloud.trim()) {
          wx.showToast({ title: '请选择头像', icon: 'none' })
          return
        }

        const signature = this.data.signature.trim()
        const res = await wx.cloud.callFunction({
          name: USER_CLOUD_FUNCTION,
          data: {
            action: 'syncProfile',
            nickName,
            signature,
            avatarUrl: avatarForCloud,
          },
        })
        const result = res.result as UserCloudResult | undefined
        if (!result || result.ok !== true) {
          const raw =
            result && result.ok === false && result.error != null ? result.error : '保存失败'
          wx.showToast({ title: formatUserCloudBizError(raw), icon: 'none', duration: 4500 })
          return
        }
        if (!result.user) {
          wx.showToast({ title: '同步后未返回用户数据', icon: 'none' })
          return
        }
        moSession.saveMoUser(result.user)
        wx.navigateBack({
          fail: () => {
            wx.switchTab({ url: TAB_PROFILE })
          },
        })
      } catch (err) {
        showCloudInvokeErrorToast(err)
      } finally {
        wx.hideLoading()
        this.setData({ submitting: false })
      }
    },
  },
})
