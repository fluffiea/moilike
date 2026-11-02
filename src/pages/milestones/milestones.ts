import type { User } from '../../types/api'
import { call } from '../../core/api'
import { fullDate } from '../../core/format'
import { PAGE_LOGIN, PAGE_PARTNER_HUB } from '../../core/paths'
import { getUser, isRegistered, logout, on, setUser } from '../../core/store'

const REFRESH_INTERVAL_MS = 30 * 1000

function sceneOf(u: User): 'needPartner' | 'needSet' | 'hero' {
  if (!u.partner) return 'needPartner'
  return u.togetherSinceMs ? 'hero' : 'needSet'
}

Component<
  {
    scene: 'needPartner' | 'needSet' | 'hero'
    me: { avatarUrl: string; initial: string }
    partner: { avatarUrl: string; initial: string; name: string }
    since: number
    sinceText: string
  },
  {},
  WechatMiniprogram.Component.MethodOption,
  { fetchedAt: number; offs: (() => void)[] },
  true
>({
  data: {
    scene: 'hero',
    me: { avatarUrl: '', initial: '' },
    partner: { avatarUrl: '', initial: '', name: '' },
    since: 0,
    sinceText: '',
  },
  methods: {
    onLoad() {
      const u = getUser()
      if (!isRegistered(u)) {
        wx.reLaunch({ url: PAGE_LOGIN })
        return
      }
      this.fetchedAt = 0
      this.render(u)
      this.offs = [on('user', (next) => next && this.render(next))]
    },
    onUnload() {
      if (this.offs) this.offs.forEach((off) => off())
    },
    onShow() {
      if (getUser() && Date.now() - this.fetchedAt > REFRESH_INTERVAL_MS) void this.refresh()
    },

    async refresh() {
      this.fetchedAt = Date.now()
      const r = await call('home.summary', {})
      if (!r.ok) return
      if (!isRegistered(r.data.user)) {
        logout()
        wx.reLaunch({ url: PAGE_LOGIN })
        return
      }
      setUser(r.data.user)
    },

    render(u: User) {
      const p = u.partner
      this.setData({
        scene: sceneOf(u),
        me: { avatarUrl: u.avatarUrl, initial: u.nickName.slice(0, 1) },
        partner: p
          ? { avatarUrl: p.avatarUrl, initial: p.nickName.slice(0, 1), name: `和 ${p.nickName}` }
          : { avatarUrl: '', initial: '', name: '' },
        since: u.togetherSinceMs || 0,
        sinceText: u.togetherSinceMs ? `那天是 ${fullDate(u.togetherSinceMs)}` : '',
      })
    },

    onAvatarError(e: WechatMiniprogram.TouchEvent) {
      const who = e.currentTarget.dataset.who as 'me' | 'partner'
      this.setData({ [`${who}.avatarUrl`]: '' })
    },
    onOpenPartnerHub() {
      wx.navigateTo({ url: PAGE_PARTNER_HUB })
    },
  },
})
