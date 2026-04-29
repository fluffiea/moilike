import type { UserCloudResult } from '../../types/cloud'
import { USER_CLOUD_FUNCTION } from '../../types/cloud'
import type { MoUser } from '../../types/user'
import { formatUserCloudBizError, showCloudInvokeErrorToast } from '../../utils/cloud-invoke'
import { clearMoUser, loadMoUser, saveMoUser } from '../../utils/session'

/** 服务端已有昵称则视为已注册，可直接进主流程 */
function isRegisteredUser(u: MoUser | null | undefined): boolean {
  return !!u && typeof u.nickName === 'string' && u.nickName.trim().length > 0
}

Component({
  data: {
    /** checking：正在拉会话；needProfile：需补全头像+昵称 */
    sessionPhase: 'checking' as 'checking' | 'needProfile',
    nickName: '',
    avatarUrl: '/images/default.png',
    hasChosenAvatar: false,
    submitting: false,
  },
  lifetimes: {
    attached() {
      void this.bootstrapEntry()
    },
  },
  methods: {
    /** 已注册：进 Tab；未注册或换机无缓存：展示表单（仅头像+昵称） */
    async bootstrapEntry() {
      this.setData({ sessionPhase: 'checking' })
      const local = loadMoUser()

      if (!wx.cloud) {
        if (isRegisteredUser(local)) {
          wx.switchTab({ url: '/pages/milestones/milestones' })
          return
        }
        this.setData({ sessionPhase: 'needProfile' })
        return
      }

      try {
        const res = await wx.cloud.callFunction({
          name: USER_CLOUD_FUNCTION,
          data: { action: 'getProfile' },
        })
        const result = res.result as UserCloudResult | undefined

        if (result && result.ok === true && !result.user) {
          clearMoUser()
          this.setData({ sessionPhase: 'needProfile' })
          return
        }

        if (result && result.ok === true && result.user) {
          const serverUser = result.user
          if (isRegisteredUser(serverUser)) {
            saveMoUser(serverUser)
            wx.switchTab({ url: '/pages/milestones/milestones' })
            return
          }
          this.applyPrefill(serverUser)
          this.setData({ sessionPhase: 'needProfile' })
          return
        }
      } catch (err) {
        if (isRegisteredUser(local)) {
          wx.switchTab({ url: '/pages/milestones/milestones' })
          return
        }
        showCloudInvokeErrorToast(err)
      }

      if (local && !isRegisteredUser(local)) {
        this.applyPrefill(local)
      }
      this.setData({ sessionPhase: 'needProfile' })
    },

    applyPrefill(u: MoUser) {
      const cloudAv =
        u.avatarUrl && u.avatarUrl.startsWith('cloud://') ? u.avatarUrl : ''
      this.setData({
        nickName: u.nickName != null ? u.nickName : '',
        avatarUrl: cloudAv || '/images/default.png',
        hasChosenAvatar: false,
      })
    },

    onChooseAvatar(e: { detail: { avatarUrl: string } }) {
      const url = e.detail.avatarUrl
      if (url) {
        this.setData({ avatarUrl: url, hasChosenAvatar: true })
      }
    },
    onNickNameInput(e: WechatMiniprogram.Input) {
      this.setData({ nickName: e.detail.value })
    },

    async onSubmit() {
      if (!wx.cloud) {
        wx.showToast({ title: '当前环境不支持云开发', icon: 'none' })
        return
      }
      const nickName = this.data.nickName.trim()
      if (!nickName) {
        wx.showToast({ title: '请填写昵称', icon: 'none' })
        return
      }
      const avPath = this.data.avatarUrl
      const hasCloudAvatar =
        typeof avPath === 'string' && avPath.startsWith('cloud://')
      if (!hasCloudAvatar && !this.data.hasChosenAvatar) {
        wx.showToast({ title: '请选择头像', icon: 'none' })
        return
      }
      if (this.data.submitting) return
      this.setData({ submitting: true })
      wx.showLoading({ title: '登录中' })
      try {
        await new Promise<void>((resolve, reject) => {
          wx.login({ success: () => resolve(), fail: (e) => reject(e) })
        })
        let avatarForCloud = ''
        if (typeof this.data.avatarUrl === 'string' && this.data.avatarUrl.startsWith('cloud://')) {
          avatarForCloud = this.data.avatarUrl
        } else if (this.data.hasChosenAvatar && this.data.avatarUrl) {
          try {
            const up = await wx.cloud.uploadFile({
              cloudPath: `avatars/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`,
              filePath: this.data.avatarUrl,
            })
            avatarForCloud = up.fileID
          } catch {
            wx.showToast({ title: '头像上传失败，请重试', icon: 'none' })
            return
          }
        }
        if (!avatarForCloud.trim()) {
          wx.showToast({ title: '请选择头像', icon: 'none' })
          return
        }
        const res = await wx.cloud.callFunction({
          name: USER_CLOUD_FUNCTION,
          data: {
            action: 'syncProfile',
            nickName,
            signature: '',
            avatarUrl: avatarForCloud,
          },
        })
        const result = res.result as UserCloudResult | undefined
        if (!result || result.ok !== true) {
          const raw =
            result && result.ok === false && result.error != null ? result.error : '登录失败'
          wx.showToast({ title: formatUserCloudBizError(raw), icon: 'none', duration: 4500 })
          return
        }
        if (!result.user) {
          wx.showToast({ title: '同步后未返回用户数据', icon: 'none' })
          return
        }
        saveMoUser(result.user)
        wx.switchTab({ url: '/pages/milestones/milestones' })
      } catch (err) {
        showCloudInvokeErrorToast(err)
      } finally {
        wx.hideLoading()
        this.setData({ submitting: false })
      }
    },
  },
})
