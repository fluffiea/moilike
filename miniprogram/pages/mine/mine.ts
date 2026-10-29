import requireAuth from '../../behaviors/require-auth'
import { PAGE_LOGIN, PAGE_PAIR } from '../../constants/paths'
import type { MoUser } from '../../types/user'
import { refreshSession, syncProfile } from '../../utils/api/user-api'
import { redirectIfNotAuthed } from '../../utils/auth-guard'
import { readChrome, syncTab } from '../../utils/chrome'
import { formatBizError, showCloudInvokeErrorToast } from '../../utils/cloud-invoke'
import { loadMoUser, saveMoUser, userIsPaired } from '../../utils/session'

Component({
  behaviors: [requireAuth],
  data: {
    statusBarHeight: 20,
    nickName: '',
    avatar: '/images/default.png',
    paired: false,
    badge: '未结伴',
    showPartner: false,
    partnerName: '',
    partnerAvatar: '/images/default.png',
  },
  methods: {
    onLoad() {
      const chrome = readChrome()
      this.setData({ statusBarHeight: chrome.statusBarHeight })
      const local = loadMoUser()
      if (local) this.paint(local)
    },

    onShow() {
      if (redirectIfNotAuthed()) return
      syncTab(this, 1)
      void this.refresh()
    },

    paint(user: MoUser) {
      const paired = userIsPaired(user)
      const partnerName = user.partner && user.partner.nickName ? user.partner.nickName : ''
      const partnerAvatar =
        user.partner && user.partner.avatarDisplay ? user.partner.avatarDisplay : '/images/default.png'
      this.setData({
        nickName: user.nickName,
        avatar: user.avatarDisplay || '/images/default.png',
        paired: paired,
        badge: paired ? '已结伴' : '未结伴',
        showPartner: paired,
        partnerName: partnerName,
        partnerAvatar: partnerAvatar,
      })
    },

    async refresh() {
      try {
        const user = await refreshSession()
        if (!user) {
          wx.reLaunch({ url: PAGE_LOGIN })
          return
        }
        this.paint(user)
      } catch (err) {
        showCloudInvokeErrorToast(err, 'user')
      }
    },

    onPartner() {
      if (this.data.paired) return
      wx.navigateTo({ url: PAGE_PAIR })
    },

    async onAvatar(e: { detail: { avatarUrl: string } }) {
      const path = e.detail.avatarUrl
      const user = loadMoUser()
      if (!path || !user) return
      wx.showLoading({ title: '更新头像' })
      try {
        const up = await wx.cloud.uploadFile({
          cloudPath: 'avatars/' + Date.now() + '-' + Math.floor(Math.random() * 10000) + '.jpg',
          filePath: path,
        })
        const res = await syncProfile(user.nickName, up.fileID)
        wx.hideLoading()
        if (!res.ok) {
          wx.showToast({ title: formatBizError(res.error), icon: 'none' })
          return
        }
        if (!res.user) {
          wx.showToast({ title: '更新失败', icon: 'none' })
          return
        }
        saveMoUser(res.user)
        this.paint(res.user)
      } catch (err) {
        wx.hideLoading()
        showCloudInvokeErrorToast(err, 'user')
      }
    },
  },
})
