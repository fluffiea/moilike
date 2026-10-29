import { TAB_TODAY } from '../../constants/paths'
import { fetchProfile, syncProfile } from '../../utils/api/user-api'
import { readChrome } from '../../utils/chrome'
import { formatBizError, showCloudInvokeErrorToast } from '../../utils/cloud-invoke'
import { loadMoUser, saveMoUser } from '../../utils/session'

Component({
  data: {
    sessionPhase: 'checking' as 'checking' | 'form',
    statusBarHeight: 20,
    nickName: '',
    avatarUrl: '/images/default.png',
    hasChosenAvatar: false,
    submitting: false,
  },
  lifetimes: {
    attached() {
      const chrome = readChrome()
      this.setData({ statusBarHeight: chrome.statusBarHeight })
      if (loadMoUser()) {
        wx.switchTab({ url: TAB_TODAY })
        return
      }
      void this.bootstrap()
    },
  },
  methods: {
    async bootstrap() {
      if (!wx.cloud) {
        this.setData({ sessionPhase: 'form' })
        return
      }
      try {
        const res = await fetchProfile()
        if (res.ok && res.user && res.user.nickName && res.user.nickName.trim()) {
          saveMoUser(res.user)
          wx.switchTab({ url: TAB_TODAY })
          return
        }
        if (res.ok && res.user) {
          this.setData({
            nickName: res.user.nickName || '',
            avatarUrl: res.user.avatarDisplay || '/images/default.png',
          })
        }
      } catch (err) {
        showCloudInvokeErrorToast(err, 'user')
      }
      this.setData({ sessionPhase: 'form' })
    },

    onChooseAvatar(e: { detail: { avatarUrl: string } }) {
      const url = e.detail.avatarUrl
      if (url) this.setData({ avatarUrl: url, hasChosenAvatar: true })
    },

    onNick(e: WechatMiniprogram.Input) {
      this.setData({ nickName: e.detail.value })
    },

    async onSubmit() {
      if (this.data.submitting) return
      if (!wx.cloud) {
        wx.showToast({ title: '当前环境不支持云开发', icon: 'none' })
        return
      }
      const nickName = this.data.nickName.trim()
      if (!nickName) {
        wx.showToast({ title: '请填写昵称', icon: 'none' })
        return
      }
      const chosen = this.data.hasChosenAvatar || this.data.avatarUrl.indexOf('cloud://') === 0
      if (!chosen) {
        wx.showToast({ title: '请选择头像', icon: 'none' })
        return
      }
      this.setData({ submitting: true })
      wx.showLoading({ title: '登录中' })
      try {
        await new Promise<void>((resolve, reject) => {
          wx.login({ success: () => resolve(), fail: (err) => reject(err) })
        })
        let avatarForCloud = ''
        if (this.data.avatarUrl.indexOf('cloud://') === 0) {
          avatarForCloud = this.data.avatarUrl
        } else {
          const up = await wx.cloud.uploadFile({
            cloudPath: 'avatars/' + Date.now() + '-' + Math.floor(Math.random() * 10000) + '.jpg',
            filePath: this.data.avatarUrl,
          })
          avatarForCloud = up.fileID
        }
        const res = await syncProfile(nickName, avatarForCloud)
        wx.hideLoading()
        if (!res.ok || !res.user) {
          const message = res.ok ? '登录失败' : formatBizError(res.error)
          wx.showToast({ title: message, icon: 'none' })
          this.setData({ submitting: false })
          return
        }
        saveMoUser(res.user)
        wx.switchTab({ url: TAB_TODAY })
      } catch (err) {
        wx.hideLoading()
        this.setData({ submitting: false })
        showCloudInvokeErrorToast(err, 'user')
      }
    },
  },
})
