import { redirectIfNotAuthed } from '../../../utils/auth-guard'
import {
  USER_CLOUD_FUNCTION,
  type PartnerActionVoidCloudResult,
  type PartnerBindInboundItem,
  type PartnerOutboundPendingItem,
  type PartnerPanelCloudResult,
  type SetTogetherSinceCloudResult,
} from '../../../types/cloud'
import { TAB_PROFILE } from '../../../constants/paths'
import type { MoPartner, MoUser } from '../../../types/user'
import {
  floorToMinuteMs,
  formatMsToDateStr,
  formatMsToTimeStr,
  formatTogetherSavedLabelCn,
  parseLocalDateTimeToMs,
} from '../../../utils/together-since'
import { togetherSinceMsFromUser } from '../../../utils/togetherSinceMs'
import {
  DEFAULT_AVATAR_PATH,
  moPartnerWithPendingAvatarSrc,
  resolveAvatarForDisplay,
  resolveAvatarForDisplayList,
} from '../../../utils/display/avatar-display'
import moSession from '../../../utils/session'

const NETWORK_UNSTABLE_TOAST = '网络不太稳定，请稍后再试'

function messageFromPartnerCloudFailure(
  result:
    | PartnerPanelCloudResult
    | PartnerActionVoidCloudResult
    | SetTogetherSinceCloudResult
    | undefined,
  fallback: string,
): string {
  if (result && result.ok === false) {
    const e = result.error
    if (typeof e === 'string' && e.trim()) return e
  }
  return fallback
}

Component({
  pageLifetimes: {
    show() {
      if (redirectIfNotAuthed()) return
      this.applyLocalPartner()
      void this.loadPartnerPanel()
    },
  },
  data: {
    defaultAvatar: DEFAULT_AVATAR_PATH,
    partner: null as MoPartner | null,
    partnerLoading: true,
    myBindCode: '',
    bindCodeDraft: '',
    inboundList: [] as PartnerBindInboundItem[],
    outboundPending: null as PartnerOutboundPendingItem | null,
    togetherDateStr: '',
    togetherTimeStr: '',
    togetherSavedLabel: '',
  },
  methods: {
    syncTogetherPickersFromUser(u: MoUser | null) {
      const now = Date.now()
      const emptyLabelPickers = {
        togetherSavedLabel: '',
        togetherDateStr: formatMsToDateStr(now),
        togetherTimeStr: formatMsToTimeStr(now),
      }
      const ms = u ? togetherSinceMsFromUser(u) : null
      if (ms == null) {
        this.setData(emptyLabelPickers)
        return
      }
      this.setData({
        togetherSavedLabel: formatTogetherSavedLabelCn(ms),
        togetherDateStr: formatMsToDateStr(ms),
        togetherTimeStr: formatMsToTimeStr(ms),
      })
    },
    applyLocalPartner() {
      const u = moSession.loadMoUser()
      if (!u) return
      const partner = u.partner != null ? moPartnerWithPendingAvatarSrc(u.partner) : null
      this.setData({ partner })
      this.syncTogetherPickersFromUser(u)
      void this.resolvePartnerAvatar()
    },
    async resolvePartnerAvatar() {
      const u = moSession.loadMoUser()
      if (!u || u.partner == null) return
      try {
        const avatarUrl = await resolveAvatarForDisplay(u.partner.avatarUrl)
        this.setData({
          partner: { ...u.partner, avatarUrl },
        })
      } catch {
        this.setData({
          partner: moPartnerWithPendingAvatarSrc(u.partner),
        })
      }
    },
    onNavBack() {
      wx.navigateBack({
        fail: () => {
          wx.switchTab({ url: TAB_PROFILE })
        },
      })
    },
    onPartnerAvatarError() {
      this.setData({ 'partner.avatarUrl': DEFAULT_AVATAR_PATH })
    },
    onInboundAvatarError(e: WechatMiniprogram.ImageError) {
      const raw = e.currentTarget.dataset.index
      const idx = typeof raw === 'number' ? raw : parseInt(String(raw), 10)
      if (!Number.isInteger(idx) || idx < 0) return
      this.setData({ [`inboundList[${idx}].fromAvatarUrl`]: DEFAULT_AVATAR_PATH })
    },
    async loadPartnerPanel() {
      if (!wx.cloud) {
        this.setData({ partnerLoading: false })
        return
      }
      this.setData({ partnerLoading: true })
      try {
        const res = await wx.cloud.callFunction({
          name: USER_CLOUD_FUNCTION,
          data: { action: 'getPartnerPanel' },
        })
        const result = res.result as PartnerPanelCloudResult
        if (!result || result.ok !== true) {
          wx.showToast({
            title: messageFromPartnerCloudFailure(result, '同步失败，请稍后再试'),
            icon: 'none',
          })
          return
        }
        moSession.saveMoUser(result.user)
        this.applyLocalPartner()
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
        })
      } catch (_e) {
        wx.showToast({ title: NETWORK_UNSTABLE_TOAST, icon: 'none' })
      } finally {
        this.setData({ partnerLoading: false })
      }
    },
    onBindCodeInput(e: WechatMiniprogram.Input) {
      this.setData({ bindCodeDraft: e.detail.value || '' })
    },
    onCopyBindCode() {
      const code = this.data.myBindCode
      if (!code) {
        wx.showToast({ title: '暂时还没有绑定码', icon: 'none' })
        return
      }
      wx.setClipboardData({
        data: code,
        success: () => {
          wx.showToast({ title: '已复制到剪贴板', icon: 'none' })
        },
      })
    },
    async onRequestBindTap() {
      if (this.data.outboundPending) {
        wx.showToast({ title: '上一则申请还在等对方回应', icon: 'none' })
        return
      }
      const raw = (this.data.bindCodeDraft || '').trim()
      if (!raw) {
        wx.showToast({ title: '请先填写对方的绑定码', icon: 'none' })
        return
      }
      if (!wx.cloud) return
      try {
        wx.showLoading({ title: '发送中…', mask: true })
        const res = await wx.cloud.callFunction({
          name: USER_CLOUD_FUNCTION,
          data: { action: 'requestBind', bindCode: raw },
        })
        wx.hideLoading()
        const result = res.result as PartnerActionVoidCloudResult
        if (!result || result.ok !== true) {
          wx.showToast({
            title: messageFromPartnerCloudFailure(result, '未能发出邀请，请稍后再试'),
            icon: 'none',
          })
          return
        }
        wx.showToast({ title: '邀请已发出', icon: 'success' })
        this.setData({ bindCodeDraft: '' })
        void this.loadPartnerPanel()
      } catch (_e) {
        wx.hideLoading()
        wx.showToast({ title: NETWORK_UNSTABLE_TOAST, icon: 'none' })
      }
    },
    onRespondBind(e: WechatMiniprogram.TouchEvent) {
      const id = e.currentTarget.dataset.id as string | undefined
      const kind = e.currentTarget.dataset.kind as string | undefined
      const accept = kind === 'accept'
      if (!id) return
      if (accept) {
        wx.showModal({
          title: '确认与对方结伴',
          content: '同意后，你们将成为彼此唯一的结伴对象；其余待处理的申请将一并关闭。',
          confirmText: '同意结伴',
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
        wx.showLoading({ title: '处理中…', mask: true })
        const res = await wx.cloud.callFunction({
          name: USER_CLOUD_FUNCTION,
          data: { action: 'respondBind', requestId, accept },
        })
        wx.hideLoading()
        const result = res.result as PartnerActionVoidCloudResult
        if (!result || result.ok !== true) {
          wx.showToast({
            title: messageFromPartnerCloudFailure(result, '未能完成操作，请稍后再试'),
            icon: 'none',
          })
          return
        }
        wx.showToast({ title: accept ? '结伴成功' : '已拒绝', icon: 'none' })
        void this.loadPartnerPanel()
      } catch (_e) {
        wx.hideLoading()
        wx.showToast({ title: NETWORK_UNSTABLE_TOAST, icon: 'none' })
      }
    },
    onTogetherDateChange(e: WechatMiniprogram.PickerChange) {
      this.applyTogetherPickerValue(e, 'togetherDateStr')
    },
    onTogetherTimeChange(e: WechatMiniprogram.PickerChange) {
      this.applyTogetherPickerValue(e, 'togetherTimeStr')
    },
    applyTogetherPickerValue(e: WechatMiniprogram.PickerChange, field: 'togetherDateStr' | 'togetherTimeStr') {
      const v = e.detail && typeof e.detail.value === 'string' ? e.detail.value : ''
      if (!v) return
      if (field === 'togetherDateStr') {
        this.setData({ togetherDateStr: v })
      } else {
        this.setData({ togetherTimeStr: v })
      }
    },
    async onSaveTogetherSinceTap() {
      if (!wx.cloud) return
      const dateStr = this.data.togetherDateStr
      const timeStr = this.data.togetherTimeStr
      const parsed = parseLocalDateTimeToMs(dateStr, timeStr)
      if (!Number.isFinite(parsed)) {
        wx.showToast({ title: '请先选齐日期与时间', icon: 'none' })
        return
      }
      const sinceMs = floorToMinuteMs(parsed)
      if (!Number.isFinite(sinceMs)) {
        wx.showToast({ title: '时间无效', icon: 'none' })
        return
      }
      try {
        wx.showLoading({ title: '保存中…', mask: true })
        const res = await wx.cloud.callFunction({
          name: USER_CLOUD_FUNCTION,
          data: { action: 'setTogetherSince', togetherSinceMs: sinceMs },
        })
        wx.hideLoading()
        const result = res.result as SetTogetherSinceCloudResult
        if (!result || result.ok !== true || !result.user) {
          wx.showToast({
            title: messageFromPartnerCloudFailure(result, '保存失败，请稍后再试'),
            icon: 'none',
          })
          return
        }
        moSession.saveMoUser(result.user)
        this.applyLocalPartner()
        wx.showToast({ title: '纪念日已保存', icon: 'success' })
      } catch (_e) {
        wx.hideLoading()
        wx.showToast({ title: NETWORK_UNSTABLE_TOAST, icon: 'none' })
      }
    },
  },
})
