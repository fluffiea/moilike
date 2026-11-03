import type { User } from '../../types/api'
import { call } from '../../core/api'
import { beijingMonthKey, formatYuan } from '../../core/ledger'
import { PAGE_EDIT_PROFILE, PAGE_KITCHEN_CREATE, PAGE_KITCHEN_OPS, PAGE_LEDGER, PAGE_LOGIN, PAGE_PARTNER_HUB, PAGE_PREFERENCES } from '../../core/paths'
import { getUser, isRegistered, logout, on, setUser } from '../../core/store'
import { confirm } from '../../core/ui'

type View = {
  avatarUrl: string
  initial: string
  nickName: string
  signature: string
  hasSignature: boolean
  bound: boolean
  partnerAvatarUrl: string
  partnerName: string
  partnerInitial: string
}

function toView(u: User): View {
  const p = u.partner
  return {
    avatarUrl: u.avatarUrl,
    initial: u.nickName.slice(0, 1),
    nickName: u.nickName,
    signature: u.signature || '写点什么介绍自己吧',
    hasSignature: Boolean(u.signature),
    bound: Boolean(p),
    partnerAvatarUrl: p ? p.avatarUrl : '',
    partnerName: p ? p.nickName : '',
    partnerInitial: p ? p.nickName.slice(0, 1) : '',
  }
}

Component<
  { me: View | null; refreshing: boolean; spentLabel: string; pendingLabel: string; hasKitchen: boolean },
  {},
  WechatMiniprogram.Component.MethodOption,
  { off: () => void; kitchenKnown: boolean },
  true
>({
  data: { me: null, refreshing: false, spentLabel: '', pendingLabel: '', hasKitchen: false },
  methods: {
    onLoad() {
      const u = getUser()
      if (u) this.setData({ me: toView(u) })
      this.off = on('user', (next) => next && this.setData({ me: toView(next) }))
    },
    onUnload() {
      this.off()
    },

    onShow() {
      void this.loadSpent()
      void this.loadKitchen()
    },

    async loadSpent() {
      const r = await call('expense.monthSummary', { month: beijingMonthKey(), scope: 'total' })
      if (r.ok) this.setData({ spentLabel: `本月已花 ${formatYuan(r.data.totalFen)}` })
    },

    async onRefresh() {
      this.setData({ refreshing: true })
      const r = await call('user.me', {})
      this.setData({ refreshing: false })
      if (r.ok && isRegistered(r.data.user)) setUser(r.data.user)
      void this.loadSpent()
      void this.loadKitchen()
    },

    async loadKitchen() {
      if (!isRegistered(getUser())) return
      const r = await call('kitchen.mine', {})
      if (!r.ok) return
      const n = r.data.pendingCount
      this.kitchenKnown = true
      this.setData({
        hasKitchen: Boolean(r.data.kitchen),
        pendingLabel: n > 99 ? '99+' : n > 0 ? String(n) : '',
      })
    },

    onAvatarError(e: WechatMiniprogram.TouchEvent) {
      const who = e.currentTarget.dataset.who as 'me' | 'partner'
      if (who === 'partner') this.setData({ 'me.partnerAvatarUrl': '' })
      else this.setData({ 'me.avatarUrl': '' })
    },
    onEdit() {
      wx.navigateTo({ url: PAGE_EDIT_PROFILE })
    },
    onPreferences() {
      wx.navigateTo({ url: PAGE_PREFERENCES })
    },
    onPartner() {
      wx.navigateTo({ url: PAGE_PARTNER_HUB })
    },
    onLedger() {
      wx.navigateTo({ url: PAGE_LEDGER })
    },
    async onKitchen() {
      if (!this.kitchenKnown) await this.loadKitchen()
      wx.navigateTo({ url: this.data.hasKitchen ? PAGE_KITCHEN_OPS : PAGE_KITCHEN_CREATE })
    },

    async onLogout() {
      const ok = await confirm({ title: '退出登录？', content: '本机会清除登录状态，下次进入时确认资料即可恢复。', confirmText: '退出' })
      if (!ok) return
      logout()
      wx.reLaunch({ url: PAGE_LOGIN })
    },
  },
})
