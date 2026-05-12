import type { TempFileUrlsCloudResult } from './cloud-user'

/** 云函数名，与 cloudfunctions/daily 目录一致 */
export const DAILY_CLOUD_FUNCTION = 'daily' as const

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
  /** listDaily：有评论时首条摘要（时间升序第一条）与总数 */
  commentCount?: number
  firstCommentUserName?: string
  firstCommentText?: string
  /** 客户端 enrich 写入，WXML 整句绑定避免中文排版问题 */
  commentCountLabel?: string
}

export type DailyListCloudResult =
  | { ok: true; list: DailyPostPublic[]; hasMore: boolean; nextOffset: number }
  | { ok: false; error?: string }

export type DailyPostCloudResult =
  | { ok: true; post: DailyPostPublic }
  | { ok: false; error?: string }

export type DailyVoidCloudResult = { ok: true } | { ok: false; error?: string }

/** 云函数 daily · listDailyComments / addDailyComment 返回的公开评论字段 */
export type DailyCommentPublic = {
  id: string
  userName: string
  time: string
  text: string
  parentId: string
  depth: number
  isMine?: boolean
}

export type DailyListCommentsCloudResult =
  | { ok: true; list: DailyCommentPublic[] }
  | { ok: false; error?: string }

export type DailyAddCommentCloudResult =
  | { ok: true; comment: DailyCommentPublic }
  | { ok: false; error?: string }

export type DailyUpdateCommentCloudResult =
  | { ok: true; comment: DailyCommentPublic }
  | { ok: false; error?: string }

/** 云函数 daily · getDailyMediaTempURLs */
export type DailyMediaTempUrlsCloudResult = TempFileUrlsCloudResult
