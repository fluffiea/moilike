import { redirectIfNotAuthed } from '../../utils/auth-guard'
import type { UserCloudResult } from '../../types/cloud'
import { USER_CLOUD_FUNCTION } from '../../types/cloud'
import {
  PAGE_EDIT_PROFILE,
  PAGE_LOGIN,
  PAGE_PARTNER_HUB,
  PAGE_PREFERENCES,
} from '../../constants/paths'
import type { MoPartner } from '../../types/user'
import {
  DEFAULT_AVATAR_PATH,
  avatarImageSrcWhileCloudPending,
  moPartnerWithPendingAvatarSrc,
  resolveAvatarForDisplay,
} from '../../utils/display/avatar-display'
import moSession from '../../utils/session'

type SettingId = 'editProfile' | 'preferences'

const SETTINGS_ROWS: { id: SettingId; label: string; iconGlyph: string }[] = [
  { id: 'editProfile', label: '编辑资料', iconGlyph: '✎' },
  { id: 'preferences', label: '偏好设置', iconGlyph: '◈' },
]

const SETTING_NAV_URL: Record<SettingId, string> = {
  editProfile: PAGE_EDIT_PROFILE,
  preferences: PAGE_PREFERENCES,
}

interface ProfileCustomInstanceProperty {
  _lastProfileFetchMs: number
}

Component<{}, {}, {}, ProfileCustomInstanceProperty>({
  pageLifetimes: {
    show() {
      if (redirectIfNotAuthed()) return
      this.applyLocalUser()
      void this.refreshFromCloud()
    },
  },
  data: {
    defaultAvatar: DEFAULT_AVATAR_PATH,
    avatarUrl: DEFAULT_AVATAR_PATH,
    nickName: '未设置昵称',
    signature: '写点什么介绍自己吧。',
    tagLine: '',
    settingsRows: SETTINGS_ROWS,
    /** 独白摘要行：是否已绑定对象（详情见 partner-hub） */
    partner: null as MoPartner | null,
    profileBooted: false,
    refreshTriggered: false,
  },
  methods: {
    applyLocalUser() {
      const u = moSession.loadMoUser()
      if (!u) return
      const partner = u.partner != null ? moPartnerWithPendingAvatarSrc(u.partner) : null

      // 避免重复 setData 导致 <image> 闪烁：如果当前已显示有效 HTTPS URL，
      // 就不要因为 cloud:// 降级回默认占位图，等 resolveSessionAvatars 完成后再更新。
      const pendingAvatar = avatarImageSrcWhileCloudPending(u.avatarUrl)
      const curAvatar = this.data.avatarUrl
      const keepCurrent = pendingAvatar === DEFAULT_AVATAR_PATH
        && curAvatar
        && curAvatar !== DEFAULT_AVATAR_PATH
        && /^https?:\/\//i.test(curAvatar)

      if (keepCurrent && partner && partner.avatarUrl === DEFAULT_AVATAR_PATH) {
        const curPartnerAv = this.data.partner && this.data.partner.avatarUrl
        if (curPartnerAv && curPartnerAv !== DEFAULT_AVATAR_PATH && /^https?:\/\//i.test(curPartnerAv)) {
          partner.avatarUrl = curPartnerAv
        }
      }

      this.setData({
        avatarUrl: keepCurrent ? curAvatar : pendingAvatar,
        nickName: u.nickName || '未设置昵称',
        signature: u.signature || '写点什么介绍自己吧。',
        partner,
        profileBooted: true,
      })
      void this.resolveSessionAvatars()
    },
    /** cloud:// 经云函数换临时 HTTPS（客户端 getTempFileURL 读对方 avatars 会 STORAGE_EXCEED_AUTHORITY） */
    async resolveSessionAvatars() {
      const u = moSession.loadMoUser()
      if (!u) return
      const partnerFallback = u.partner != null ? moPartnerWithPendingAvatarSrc(u.partner) : null
      try {
        const myAv = await resolveAvatarForDisplay(u.avatarUrl)
        if (u.partner == null) {
          this.setData({ avatarUrl: myAv, partner: null })
          return
        }
        const avatarUrl = await resolveAvatarForDisplay(u.partner.avatarUrl)
        this.setData({
          avatarUrl: myAv,
          partner: { ...u.partner, avatarUrl },
        })
      } catch {
        this.setData({
          avatarUrl: avatarImageSrcWhileCloudPending(u.avatarUrl),
          partner: partnerFallback,
        })
      }
    },
    onMyAvatarError() {
      this.setData({ avatarUrl: DEFAULT_AVATAR_PATH })
    },
    onPartnerPeekAvatarError() {
      this.setData({ 'partner.avatarUrl': DEFAULT_AVATAR_PATH })
    },
    onCoupleHubTap() {
      wx.navigateTo({ url: PAGE_PARTNER_HUB })
    },
    async refreshFromCloud() {
      if (!wx.cloud) return
      // 60 秒内不重复拉取 profile，减少云函数调用
      const now = Date.now()
      if (this._lastProfileFetchMs && now - this._lastProfileFetchMs < 60000) return
      try {
        const res = await wx.cloud.callFunction({
          name: USER_CLOUD_FUNCTION,
          data: { action: 'getProfile' },
        })
        const result = res.result as UserCloudResult
        if (!result || result.ok !== true) return
        this._lastProfileFetchMs = Date.now()
        if (result.user) {
          moSession.saveMoUser(result.user)
          this.applyLocalUser()
          return
        }
        if (moSession.loadMoUser()) {
          moSession.clearMoUser()
          wx.reLaunch({ url: PAGE_LOGIN })
        }
      } catch (_e) {
        // 离线时忽略
      }
    },
    onRefresh() {
      this.setData({ refreshTriggered: true })
      void this.refreshFromCloud().finally(() => {
        this.setData({ refreshTriggered: false })
      })
    },
    onSettingTap(e: WechatMiniprogram.TouchEvent) {
      const id = e.currentTarget.dataset.id as SettingId | undefined
      if (!id) return
      const url = SETTING_NAV_URL[id]
      if (!url) return
      wx.navigateTo({ url })
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
