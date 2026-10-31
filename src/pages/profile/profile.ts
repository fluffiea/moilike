import type { User } from '../../types/api'
import { call } from '../../core/api'
import { PAGE_EDIT_PROFILE, PAGE_LOGIN, PAGE_PARTNER_HUB, PAGE_PREFERENCES } from '../../core/paths'
import { getUser, isRegistered, logout, on, setUser } from '../../core/store'
import { confirm } from '../../core/ui'

type View = {
  avatarUrl: string
  initial: string
  nickName: string
  signature: string
  partnerAvatarUrl: string
  partnerTitle: string
  partnerHint: string
}

function toView(u: User): View {
  const p = u.partner
  return {
    avatarUrl: u.avatarUrl,
    initial: u.nickName.slice(0, 1),
    nickName: u.nickName,
    signature: u.signature || '写点什么介绍自己吧',
    partnerAvatarUrl: p ? p.avatarUrl : '',
    partnerTitle: p ? `与 ${p.nickName} 已结伴` : '添加结伴对象',
    partnerHint: p ? '管理绑定与纪念日' : '与 Ta 绑定，解锁朝夕、信件与共鸣',
  }
}

Component<{ me: View | null; refreshing: boolean }, {}, WechatMiniprogram.Component.MethodOption, { off: () => void }, true>({
  data: { me: null, refreshing: false },
  methods: {
    onLoad() {
      const u = getUser()
      if (u) this.setData({ me: toView(u) })
      this.off = on('user', (next) => next && this.setData({ me: toView(next) }))
    },
    onUnload() {
      this.off()
    },

    async onRefresh() {
      this.setData({ refreshing: true })
      const r = await call('user.me', {})
      this.setData({ refreshing: false })
      if (r.ok && isRegistered(r.data.user)) setUser(r.data.user)
    },

    onAvatarError() {
      this.setData({ 'me.avatarUrl': '' })
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

    async onLogout() {
      const ok = await confirm({ title: '退出登录？', content: '本机会清除登录状态，下次进入时确认资料即可恢复。', confirmText: '退出' })
      if (!ok) return
      logout()
      wx.reLaunch({ url: PAGE_LOGIN })
    },
  },
})
