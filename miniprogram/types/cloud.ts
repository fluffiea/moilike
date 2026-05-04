import type { MoUser } from './user'

/** 云函数名，与 cloudfunctions/user 目录一致 */
export const USER_CLOUD_FUNCTION = 'user' as const

/** 云函数名，与 cloudfunctions/daily 目录一致 */
export const DAILY_CLOUD_FUNCTION = 'daily' as const

export type UserCloudResult =
  | { ok: true; user: MoUser | null }
  | { ok: false; error?: string }

/** 独白「对象」面板 · 收到的绑定申请 */
export type PartnerBindInboundItem = {
  id: string
  fromOpenId: string
  fromNickName: string
  fromAvatarUrl?: string
  timeLabel: string
}

/** 独白「对象」面板 · 我发出的待处理申请 */
export type PartnerOutboundPendingItem = {
  id: string
  toNickName: string
  toAvatarUrl?: string
  timeLabel: string
}

/** 云函数 user · action getPartnerPanel */
export type PartnerPanelCloudResult =
  | {
      ok: true
      user: MoUser
      myBindCode: string
      outboundPending: PartnerOutboundPendingItem | null
      inbound: PartnerBindInboundItem[]
    }
  | { ok: false; error?: string }

/** 云函数 user · requestBind / respondBind（reject 分支） */
export type PartnerActionVoidCloudResult = { ok: true } | { ok: false; error?: string }

/** 云函数 user · action getTempFileURLs（服务端换云存储临时链，解决对方 avatars 的 STORAGE_EXCEED_AUTHORITY） */
export type AvatarTempUrlsCloudResult =
  | { ok: true; urls: Record<string, string> }
  | { ok: false; error?: string }

/** 日常列表项（云函数 list/get/create/update 返回的公开字段） */
export type DailyPostPublic = {
  id: string
  userName: string
  time: string
  snippet: string
  images: string[]
  avatarUrl?: string
  avatarTone?: 'mist' | 'dew' | 'bloom' | 'meadow'
  imageLayout?: 'short' | 'normal' | 'tall'
  isMine?: boolean
}

export type DailyListCloudResult =
  | { ok: true; list: DailyPostPublic[]; hasMore: boolean; nextOffset: number }
  | { ok: false; error?: string }

export type DailyPostCloudResult =
  | { ok: true; post: DailyPostPublic }
  | { ok: false; error?: string }

export type DailyVoidCloudResult = { ok: true } | { ok: false; error?: string }
