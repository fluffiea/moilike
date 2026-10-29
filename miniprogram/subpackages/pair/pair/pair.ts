import requireAuth from '../../../behaviors/require-auth'
import { TAB_TODAY } from '../../../constants/paths'
import { confirmPair, getInvite, refreshInvite, refreshSession } from '../../../utils/api/user-api'
import { redirectIfNotAuthed } from '../../../utils/auth-guard'
import { readChrome } from '../../../utils/chrome'
import { formatBizError, showCloudInvokeErrorToast } from '../../../utils/cloud-invoke'
import { saveMoUser, userIsPaired } from '../../../utils/session'

function formatCode(code: string): string {
  if (code.length !== 6) return code
  return code.slice(0, 3) + ' ' + code.slice(3)
}

function codeCells(raw: string): string[] {
  const digits = raw.replace(/\D/g, '').slice(0, 6)
  const cells: string[] = []
  for (let i = 0; i < 6; i++) cells.push(i < digits.length ? digits.charAt(i) : '')
  return cells
}

Component({
  behaviors: [requireAuth],
  data: {
    statusBarHeight: 20,
    safeBottom: 0,
    inviteCode: '',
    codeLabel: '··· ···',
    paired: false,
    pairedLabel: '',
    codeInput: '',
    cells: ['', '', '', '', '', ''] as string[],
    busy: false,
  },
  methods: {
    onLoad() {
      if (redirectIfNotAuthed()) return
      const chrome = readChrome()
      this.setData({ statusBarHeight: chrome.statusBarHeight, safeBottom: chrome.safeBottom })
    },

    onShow() {
      if (redirectIfNotAuthed()) return
      void this.load()
    },

    onBack() {
      wx.navigateBack({
        fail: () => {
          wx.switchTab({ url: TAB_TODAY })
        },
      })
    },

    async load() {
      try {
        const user = await refreshSession()
        const paired = userIsPaired(user)
        const name = user && user.partner && user.partner.nickName ? user.partner.nickName : ''
        const invite = await getInvite()
        if (!invite.ok) {
          wx.showToast({ title: formatBizError(invite.error), icon: 'none' })
          this.setData({
            paired: paired,
            pairedLabel: paired ? (name ? '已和' + name + '结伴' : '已结伴') : '',
          })
          return
        }
        this.setData({
          inviteCode: invite.inviteCode,
          codeLabel: formatCode(invite.inviteCode),
          paired: paired || invite.paired,
          pairedLabel: paired || invite.paired ? (name ? '已和' + name + '结伴' : '已结伴') : '',
        })
      } catch (err) {
        showCloudInvokeErrorToast(err, 'user')
      }
    },

    onCopy() {
      if (!this.data.inviteCode) return
      wx.setClipboardData({ data: this.data.inviteCode })
    },

    async onRefresh() {
      if (this.data.paired || this.data.busy) return
      this.setData({ busy: true })
      wx.showLoading({ title: '刷新中' })
      try {
        const res = await refreshInvite()
        wx.hideLoading()
        this.setData({ busy: false })
        if (!res.ok) {
          wx.showToast({ title: formatBizError(res.error), icon: 'none' })
          return
        }
        this.setData({ inviteCode: res.inviteCode, codeLabel: formatCode(res.inviteCode) })
      } catch (err) {
        wx.hideLoading()
        this.setData({ busy: false })
        showCloudInvokeErrorToast(err, 'user')
      }
    },

    onCode(e: WechatMiniprogram.Input) {
      const digits = e.detail.value.replace(/\D/g, '').slice(0, 6)
      this.setData({ codeInput: digits, cells: codeCells(digits) })
    },

    async onConfirm() {
      if (this.data.paired || this.data.busy) return
      if (this.data.codeInput.length !== 6) {
        wx.showToast({ title: '请输入 6 位邀请码', icon: 'none' })
        return
      }
      this.setData({ busy: true })
      wx.showLoading({ title: '结伴中' })
      try {
        const res = await confirmPair(this.data.codeInput)
        wx.hideLoading()
        this.setData({ busy: false })
        if (!res.ok) {
          wx.showToast({ title: formatBizError(res.error), icon: 'none' })
          return
        }
        if (res.user) saveMoUser(res.user)
        const name = res.user && res.user.partner && res.user.partner.nickName ? res.user.partner.nickName : ''
        this.setData({
          paired: true,
          pairedLabel: name ? '已和' + name + '结伴' : '已结伴',
        })
        wx.showToast({ title: '已结伴', icon: 'none' })
      } catch (err) {
        wx.hideLoading()
        this.setData({ busy: false })
        showCloudInvokeErrorToast(err, 'user')
      }
    },
  },
})
