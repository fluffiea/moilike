import type { MoUser } from './user'

/** 云函数名，与 cloudfunctions/user 目录一致 */
export const USER_CLOUD_FUNCTION = 'user' as const

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

/** 云函数 user · action setTogetherSince */
export type SetTogetherSinceCloudResult =
  | { ok: true; user: MoUser }
  | { ok: false; error?: string }

/** 云函数返回：临时下载 URL 映射 */
export type TempFileUrlsCloudResult =
  | { ok: true; urls: Record<string, string> }
  | { ok: false; error?: string }

/** 云函数 user · action getTempFileURLs */
export type AvatarTempUrlsCloudResult = TempFileUrlsCloudResult
