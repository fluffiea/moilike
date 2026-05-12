import requireAuth from '../../behaviors/require-auth'
import { PAGE_PARTNER_HUB } from '../../constants/paths'
import { USER_CLOUD_FUNCTION, type UserCloudResult } from '../../types/cloud'
import type { MoUser } from '../../types/user'
import {
  DEFAULT_AVATAR_PATH,
  resolveAvatarForDisplay,
} from '../../utils/display/avatar-display'
import moSession from '../../utils/session'
import {
  formatDurationGridStrings,
  formatTogetherSubtitleCn,
  splitDurationFromMs,
} from '../../utils/together-since'
import { togetherSinceMsFromUser } from '../../utils/togetherSinceMs'

type MilestonesScene = 'empty' | 'needPartner' | 'needSet' | 'hero'

type MilestonesPageData = {
  msBoot: boolean
  scene: MilestonesScene
  defaultAvatar: string
  myAvatarUrl: string
  partnerAvatarUrl: string
  partnerNickLine: string
  togetherSubtitle: string
  togetherDaysStr: string
  togetherHoursStr: string
  togetherMinutesStr: string
  togetherSecondsStr: string
}

interface MilestonesCustomInstanceProperty {
  _msTogetherTicker: number
}

type MilestonesMethods = WechatMiniprogram.Component.MethodOption

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

Component<MilestonesPageData, {}, MilestonesMethods, MilestonesCustomInstanceProperty>({
  behaviors: [requireAuth],
  data: {
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
      if (this.data.scene === 'hero') {
        this.startTogetherTicker()
      }
    },
    stopTogetherTicker() {
      if (this._msTogetherTicker) {
        clearInterval(this._msTogetherTicker)
        this._msTogetherTicker = 0
      }
    },
    startTogetherTicker() {
      this.stopTogetherTicker()
      this._msTogetherTicker = setInterval(() => {
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
      if (this.data.scene !== 'hero') return
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
