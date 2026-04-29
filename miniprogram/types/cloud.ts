import type { MoUser } from './user'

/** 云函数名，与 cloudfunctions/user 目录一致 */
export const USER_CLOUD_FUNCTION = 'user' as const

export type UserCloudResult =
  | { ok: true; user: MoUser | null }
  | { ok: false; error?: string }
