import type { User } from '../../types/api'
import { call } from '../../core/api'
import { fullDate } from '../../core/format'
import { PAGE_LETTER_DETAIL, PAGE_LETTER_LIST, PAGE_LOGIN, PAGE_PARTNER_HUB } from '../../core/paths'
import { getUser, isRegistered, logout, on, readCache, setUser, writeCache } from '../../core/store'

type Letters = { total: number; recent: { id: string; title: string }[] }

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
    letters: Letters & { totalText: string }
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
    letters: { total: 0, recent: [], totalText: '' },
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
      const cached = readCache<Letters>('letters-summary')
      if (cached) this.renderLetters(cached)
      this.offs = [
        on('user', (next) => next && this.render(next)),
        on('letter:upsert', () => (this.fetchedAt = 0)),
        on('letter:remove', () => (this.fetchedAt = 0)),
      ]
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
      this.renderLetters(r.data.letters)
      writeCache('letters-summary', r.data.letters)
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
        sinceText: u.togetherSinceMs ? `${fullDate(u.togetherSinceMs)}，悄悄从这一秒数起` : '',
      })
    },

    renderLetters(letters: Letters) {
      this.setData({ letters: { ...letters, totalText: `${letters.total} 封` } })
    },

    onAvatarError(e: WechatMiniprogram.TouchEvent) {
      const who = e.currentTarget.dataset.who as 'me' | 'partner'
      this.setData({ [`${who}.avatarUrl`]: '' })
    },
    onOpenPartnerHub() {
      wx.navigateTo({ url: PAGE_PARTNER_HUB })
    },
    onOpenLetters() {
      wx.navigateTo({ url: PAGE_LETTER_LIST })
    },
    onOpenLetter(e: WechatMiniprogram.TouchEvent) {
      wx.navigateTo({ url: `${PAGE_LETTER_DETAIL}?id=${e.currentTarget.dataset.id}` })
    },
  },
})
