import requireAuth from '../../behaviors/require-auth'
import { PAGE_PARTNER_HUB } from '../../constants/paths'
import { USER_CLOUD_FUNCTION, type UserCloudResult } from '../../types/cloud'
import type { MoUser } from '../../types/user'
import {
  DEFAULT_AVATAR_PATH,
  resolveAvatarForDisplay,
} from '../../utils/avatar-display'
import moSession from '../../utils/session'
import {
  formatDurationGridStrings,
  formatTogetherSubtitleCn,
  splitDurationFromMs,
} from '../../utils/together-since'
import { togetherSinceMsFromUser } from '../../utils/togetherSinceMs'

const TOGETHER_TICKER = '_msTogetherTicker'

type MilestonesScene = 'empty' | 'needPartner' | 'needSet' | 'hero'

/** 拉最新资料写入本地会话；失败时静默，仍可用 Storage 中的用户展示朝夕 */
async function refreshSessionProfileFromCloud(): Promise<void> {
  if (!wx.cloud) return
  try {
    const res = await wx.cloud.callFunction({
      name: USER_CLOUD_FUNCTION,
      data: { action: 'getProfile' },
    })
    const r = res.result as UserCloudResult
    if (r && r.ok === true && r.user) {
      moSession.saveMoUser(r.user)
    }
  } catch {
    // ignore
  }
}

async function resolveDisplayAvatarUrl(raw: string | undefined): Promise<string> {
  const s = typeof raw === 'string' ? raw.trim() : ''
  if (s.length === 0) return DEFAULT_AVATAR_PATH
  try {
    return await resolveAvatarForDisplay(s)
  } catch {
    return DEFAULT_AVATAR_PATH
  }
}

Component({
  behaviors: [requireAuth],
  data: {
    /** 首帧与拉云前为 true，避免误显「未登录」占位 */
    msBoot: true,
    scene: 'empty' as MilestonesScene,
    defaultAvatar: DEFAULT_AVATAR_PATH,
    myAvatarUrl: DEFAULT_AVATAR_PATH,
    partnerAvatarUrl: DEFAULT_AVATAR_PATH,
    partnerNickLine: '',
    togetherSubtitle: '',
    togetherDaysStr: '0',
    togetherHoursStr: '00',
    togetherMinutesStr: '00',
    togetherSecondsStr: '00',
  },
  pageLifetimes: {
    show() {
      this.stopTogetherTicker()
      void this.onShowBootstrap()
    },
    hide() {
      this.stopTogetherTicker()
    },
  },
  lifetimes: {
    detached() {
      this.stopTogetherTicker()
    },
  },
  methods: {
    async onShowBootstrap() {
      await this.bootstrap()
      if ((this.data.scene as MilestonesScene) === 'hero') {
        this.startTogetherTicker()
      }
    },
    stopTogetherTicker() {
      const ext = this as WechatMiniprogram.IAnyObject
      const id = ext[TOGETHER_TICKER]
      if (id) {
        clearInterval(id)
        ext[TOGETHER_TICKER] = 0
      }
    },
    startTogetherTicker() {
      this.stopTogetherTicker()
      const ext = this as WechatMiniprogram.IAnyObject
      ext[TOGETHER_TICKER] = setInterval(() => {
        this.refreshTogetherDurationOnly()
      }, 1000)
    },
    async bootstrap() {
      try {
        await refreshSessionProfileFromCloud()
        await this.applySceneFromUser(moSession.loadMoUser())
      } finally {
        this.setData({ msBoot: false })
      }
    },
    async applySceneFromUser(u: MoUser | null) {
      if (!u) {
        this.setData({ scene: 'empty' })
        return
      }
      const hasPartner =
        u.partner != null &&
        typeof u.partner.openId === 'string' &&
        u.partner.openId.length > 0
      if (!hasPartner) {
        this.setData({ scene: 'needPartner' })
        return
      }
      const since = togetherSinceMsFromUser(u)
      if (since == null) {
        this.setData({ scene: 'needSet' })
        return
      }

      const partner = u.partner
      const myAv = await resolveDisplayAvatarUrl(u.avatarUrl)
      const paAv = await resolveDisplayAvatarUrl(
        typeof partner.avatarUrl === 'string' ? partner.avatarUrl : undefined,
      )

      const pn = partner.nickName.trim()
      const nickLine = pn.length > 0 ? `和 ${pn}` : '和 Ta'

      const sub = formatTogetherSubtitleCn(since)
      const parts = splitDurationFromMs(since, Date.now())
      const grid = formatDurationGridStrings(parts)
      this.setData({
        scene: 'hero',
        myAvatarUrl: myAv,
        partnerAvatarUrl: paAv,
        partnerNickLine: nickLine,
        togetherSubtitle: sub,
        ...grid,
      })
    },
    refreshTogetherDurationOnly() {
      if ((this.data.scene as MilestonesScene) !== 'hero') return
      const u = moSession.loadMoUser()
      const since = togetherSinceMsFromUser(u)
      if (since == null) return
      const parts = splitDurationFromMs(since, Date.now())
      this.setData(formatDurationGridStrings(parts))
    },
    onOpenPartnerHub() {
      wx.navigateTo({ url: PAGE_PARTNER_HUB })
    },
    onMyAvatarError() {
      this.setData({ myAvatarUrl: DEFAULT_AVATAR_PATH })
    },
    onPartnerAvatarError() {
      this.setData({ partnerAvatarUrl: DEFAULT_AVATAR_PATH })
    },
  },
})
