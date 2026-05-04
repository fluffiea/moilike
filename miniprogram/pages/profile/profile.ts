import { redirectIfNotAuthed } from '../../utils/auth-guard'
import type {
  PartnerActionVoidCloudResult,
  PartnerBindInboundItem,
  PartnerOutboundPendingItem,
  PartnerPanelCloudResult,
  UserCloudResult,
} from '../../types/cloud'
import { USER_CLOUD_FUNCTION } from '../../types/cloud'
import { PAGE_EDIT_PROFILE, PAGE_LOGIN, PAGE_PREFERENCES } from '../../constants/paths'
import type { MoPartner } from '../../types/user'
import {
  DEFAULT_AVATAR_PATH,
  avatarImageSrcWhileCloudPending,
  resolveAvatarForDisplay,
  resolveAvatarForDisplayList,
} from '../../utils/avatar-display'
import moSession from '../../utils/session'

type SettingId = 'editProfile' | 'changePassword' | 'preferences'

type ProfileMainTab = 'me' | 'partner'

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

function moPartnerWithPendingAvatarSrc(p: MoPartner): MoPartner {
  return { ...p, avatarUrl: avatarImageSrcWhileCloudPending(p.avatarUrl) }
}

Component({
  pageLifetimes: {
    show() {
      if (redirectIfNotAuthed()) return
      this.applyLocalUser()
      void this.refreshFromCloud()
      if (this.data.profileMainTab === 'partner') {
        void this.loadPartnerPanel()
      }
    },
  },
  data: {
    defaultAvatar: DEFAULT_AVATAR_PATH,
    profileMainTab: 'me' as ProfileMainTab,
    avatarUrl: DEFAULT_AVATAR_PATH,
    nickName: '未设置昵称',
    signature: '写点什么介绍自己吧。',
    tagLine: 'Moilike，只属于我们两个人',
    settingsRows: buildSettingsRows(),
    partner: null as MoPartner | null,
    partnerLoading: false,
    myBindCode: '',
    bindCodeDraft: '',
    inboundList: [] as PartnerBindInboundItem[],
    outboundPending: null as PartnerOutboundPendingItem | null,
  },
  methods: {
    applyLocalUser() {
      const u = moSession.loadMoUser()
      if (!u) return
      let partner: MoPartner | null = null
      if (u.partner != null) {
        partner = moPartnerWithPendingAvatarSrc(u.partner)
      }
      this.setData({
        avatarUrl: avatarImageSrcWhileCloudPending(u.avatarUrl),
        nickName: u.nickName || '未设置昵称',
        signature: u.signature || '写点什么介绍自己吧。',
        partner,
      })
      void this.resolveSessionAvatars()
    },
    /** cloud:// 经云函数换临时 HTTPS（客户端 getTempFileURL 读对方 avatars 会 STORAGE_EXCEED_AUTHORITY） */
    async resolveSessionAvatars() {
      const u = moSession.loadMoUser()
      if (!u) return
      try {
        const myAv = await resolveAvatarForDisplay(u.avatarUrl)
        let partner: MoPartner | null = null
        if (u.partner != null) {
          partner = {
            ...u.partner,
            avatarUrl: await resolveAvatarForDisplay(u.partner.avatarUrl),
          }
        }
        this.setData({ avatarUrl: myAv, partner })
      } catch {
        let partner: MoPartner | null = null
        if (u.partner != null) {
          partner = moPartnerWithPendingAvatarSrc(u.partner)
        }
        this.setData({
          avatarUrl: avatarImageSrcWhileCloudPending(u.avatarUrl),
          partner,
        })
      }
    },
    onMyAvatarError() {
      this.setData({ avatarUrl: DEFAULT_AVATAR_PATH })
    },
    onPartnerAvatarError() {
      this.setData({ 'partner.avatarUrl': DEFAULT_AVATAR_PATH })
    },
    onInboundAvatarError(e: WechatMiniprogram.ImageError) {
      const raw = e.currentTarget.dataset.index
      const idx = typeof raw === 'number' ? raw : parseInt(String(raw), 10)
      if (Number.isNaN(idx) || idx < 0) return
      this.setData({ [`inboundList[${idx}].fromAvatarUrl`]: DEFAULT_AVATAR_PATH })
    },
    onProfileMainTab(e: WechatMiniprogram.TouchEvent) {
      const tab = e.currentTarget.dataset.tab as ProfileMainTab | undefined
      if (tab !== 'me' && tab !== 'partner') return
      this.setData({ profileMainTab: tab })
      if (tab === 'partner') {
        void this.loadPartnerPanel()
      }
    },
    async loadPartnerPanel() {
      if (!wx.cloud) return
      this.setData({ partnerLoading: true })
      try {
        const res = await wx.cloud.callFunction({
          name: USER_CLOUD_FUNCTION,
          data: { action: 'getPartnerPanel' },
        })
        const result = res.result as PartnerPanelCloudResult
        if (!result || result.ok !== true) {
          const err = result && 'error' in result ? result.error : '加载失败'
          wx.showToast({ title: err || '加载失败', icon: 'none' })
          this.setData({ partnerLoading: false })
          return
        }
        moSession.saveMoUser(result.user)
        this.applyLocalUser()
        const inboundRaw = result.inbound
        const fromRefs = inboundRaw.map((row) => row.fromAvatarUrl)
        const resolvedFrom = await resolveAvatarForDisplayList(fromRefs)
        const inboundList = inboundRaw.map((row, i) => ({
          ...row,
          fromAvatarUrl: resolvedFrom[i] || DEFAULT_AVATAR_PATH,
        }))
        this.setData({
          myBindCode: result.myBindCode,
          inboundList,
          outboundPending: result.outboundPending,
          partnerLoading: false,
        })
      } catch (_e) {
        wx.showToast({ title: '网络异常', icon: 'none' })
        this.setData({ partnerLoading: false })
      }
    },
    onBindCodeInput(e: WechatMiniprogram.Input) {
      this.setData({ bindCodeDraft: e.detail.value || '' })
    },
    onCopyBindCode() {
      const code = this.data.myBindCode
      if (!code) {
        wx.showToast({ title: '暂无绑定码', icon: 'none' })
        return
      }
      wx.setClipboardData({
        data: code,
        success: () => {
          wx.showToast({ title: '已复制', icon: 'none' })
        },
      })
    },
    async onRequestBindTap() {
      if (this.data.outboundPending) {
        wx.showToast({ title: '请等待对方处理上一则申请', icon: 'none' })
        return
      }
      const raw = (this.data.bindCodeDraft || '').trim()
      if (!raw) {
        wx.showToast({ title: '请输入对方绑定码', icon: 'none' })
        return
      }
      if (!wx.cloud) return
      try {
        wx.showLoading({ title: '发送中', mask: true })
        const res = await wx.cloud.callFunction({
          name: USER_CLOUD_FUNCTION,
          data: { action: 'requestBind', bindCode: raw },
        })
        wx.hideLoading()
        const result = res.result as PartnerActionVoidCloudResult
        if (!result || result.ok !== true) {
          wx.showToast({ title: (result && 'error' in result && result.error) || '发送失败', icon: 'none' })
          return
        }
        wx.showToast({ title: '已发送', icon: 'success' })
        this.setData({ bindCodeDraft: '' })
        void this.loadPartnerPanel()
        void this.refreshFromCloud()
      } catch (_e) {
        wx.hideLoading()
        wx.showToast({ title: '网络异常', icon: 'none' })
      }
    },
    onRespondBind(e: WechatMiniprogram.TouchEvent) {
      const id = e.currentTarget.dataset.id as string | undefined
      const kind = e.currentTarget.dataset.kind as string | undefined
      const accept = kind === 'accept'
      if (!id) return
      if (accept) {
        wx.showModal({
          title: '建立恋爱关系',
          content: '同意后，双方将互为唯一对象，其他待处理申请会被关闭。',
          confirmText: '同意',
          cancelText: '再想想',
          confirmColor: '#4A6670',
          success: (r) => {
            if (r.confirm) {
              void this.submitRespondBind(id, true)
            }
          },
        })
        return
      }
      void this.submitRespondBind(id, false)
    },
    async submitRespondBind(requestId: string, accept: boolean) {
      if (!wx.cloud) return
      try {
        wx.showLoading({ title: '处理中', mask: true })
        const res = await wx.cloud.callFunction({
          name: USER_CLOUD_FUNCTION,
          data: { action: 'respondBind', requestId, accept },
        })
        wx.hideLoading()
        const result = res.result as PartnerActionVoidCloudResult
        if (!result || result.ok !== true) {
          wx.showToast({ title: (result && 'error' in result && result.error) || '操作失败', icon: 'none' })
          return
        }
        wx.showToast({ title: accept ? '已绑定' : '已拒绝', icon: 'none' })
        void this.loadPartnerPanel()
        void this.refreshFromCloud()
      } catch (_e) {
        wx.hideLoading()
        wx.showToast({ title: '网络异常', icon: 'none' })
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
    onSettingTap(e: WechatMiniprogram.TouchEvent) {
      const id = e.currentTarget.dataset.id as SettingId | undefined
      if (id === 'editProfile') {
        wx.navigateTo({ url: PAGE_EDIT_PROFILE })
        return
      }
      if (id === 'preferences') {
        wx.navigateTo({ url: PAGE_PREFERENCES })
        return
      }
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
