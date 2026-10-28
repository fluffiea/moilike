import {
  DAILY_CLOUD_FUNCTION,
  type DailyAddCommentCloudResult,
  type DailyListCloudResult,
  type DailyListCommentsCloudResult,
  type DailyPostCloudResult,
  type DailyUpdateCommentCloudResult,
  type DailyVoidCloudResult,
} from '../../types/cloud'
import { MAX_COMMENT_TEXT } from '../../constants/limits'
import { callCloud, createMediaTempUrlResolver, dedupe } from './cloud-call'

/** 日常云函数 `daily` 的客户端封装；服务端按「本人 + 已互相绑定的伴侣」过滤列表与读写。 */

export async function dailyListDaily(offset: number): Promise<DailyListCloudResult | null> {
  return dedupe(DAILY_CLOUD_FUNCTION + '|listDaily|' + JSON.stringify({ offset }), () =>
    callCloud<DailyListCloudResult>(DAILY_CLOUD_FUNCTION, { action: 'listDaily', offset }),
  )
}

export async function dailyGetDaily(id: string): Promise<DailyPostCloudResult | null> {
  return callCloud<DailyPostCloudResult>(DAILY_CLOUD_FUNCTION, { action: 'getDaily', id })
}

/** 单条列表卡数据（正文 + 首评摘要），用于从详情返回时只合并一项、不重拉整页。 */
export async function dailyGetDailyFeedItem(postId: string): Promise<DailyPostCloudResult | null> {
  const id = typeof postId === 'string' ? postId.trim() : ''
  if (!id) return null
  return callCloud<DailyPostCloudResult>(DAILY_CLOUD_FUNCTION, { action: 'getDailyFeedItem', id })
}

export async function dailyListComments(
  postId: string,
): Promise<DailyListCommentsCloudResult | null> {
  return callCloud<DailyListCommentsCloudResult>(DAILY_CLOUD_FUNCTION, {
    action: 'listDailyComments',
    postId,
  })
}

export async function dailyUpdateComment(
  postId: string,
  commentId: string,
  text: string,
): Promise<DailyUpdateCommentCloudResult | null> {
  const pid = typeof postId === 'string' ? postId.trim() : ''
  const cid = typeof commentId === 'string' ? commentId.trim() : ''
  const body = typeof text === 'string' ? text.trim().slice(0, MAX_COMMENT_TEXT) : ''
  if (!pid || !cid || !body) return null
  return callCloud<DailyUpdateCommentCloudResult>(DAILY_CLOUD_FUNCTION, {
    action: 'updateDailyComment',
    postId: pid,
    commentId: cid,
    text: body,
  })
}

export async function dailyDeleteComment(
  postId: string,
  commentId: string,
): Promise<DailyVoidCloudResult | null> {
  const pid = typeof postId === 'string' ? postId.trim() : ''
  const cid = typeof commentId === 'string' ? commentId.trim() : ''
  if (!pid || !cid) return null
  return callCloud<DailyVoidCloudResult>(DAILY_CLOUD_FUNCTION, {
    action: 'deleteDailyComment',
    postId: pid,
    commentId: cid,
  })
}

export async function dailyAddComment(
  postId: string,
  text: string,
  parentCommentId?: string,
): Promise<DailyAddCommentCloudResult | null> {
  const parent =
    typeof parentCommentId === 'string' && parentCommentId.trim() ? parentCommentId.trim() : ''
  return callCloud<DailyAddCommentCloudResult>(
    DAILY_CLOUD_FUNCTION,
    parent
      ? { action: 'addDailyComment', postId, text, parentCommentId: parent }
      : { action: 'addDailyComment', postId, text },
  )
}

export async function dailyCreateDaily(
  snippet: string,
  images: string[],
): Promise<DailyPostCloudResult | null> {
  return callCloud<DailyPostCloudResult>(DAILY_CLOUD_FUNCTION, {
    action: 'createDaily',
    snippet,
    images,
  })
}

export async function dailyUpdateDaily(
  id: string,
  snippet: string,
  images: string[],
): Promise<DailyPostCloudResult | null> {
  return callCloud<DailyPostCloudResult>(DAILY_CLOUD_FUNCTION, {
    action: 'updateDaily',
    id,
    snippet,
    images,
  })
}

export async function dailyDeleteDaily(id: string): Promise<DailyVoidCloudResult | null> {
  return callCloud<DailyVoidCloudResult>(DAILY_CLOUD_FUNCTION, { action: 'deleteDaily', id })
}

const dailyMediaTempUrls = createMediaTempUrlResolver({
  cloudFunctionName: DAILY_CLOUD_FUNCTION,
  action: 'getDailyMediaTempURLs',
})

/** 清空日常配图临时链接缓存（下拉刷新等全量重载场景调用）。 */
export function invalidateDailyMediaTempUrlCache(): void {
  dailyMediaTempUrls.invalidate()
}

/** 将日常配图 cloud fileID 换为临时 HTTPS（云函数校验路径为 `daily/{情侣一方 openId}/`）。 */
export function dailyMapMediaTempUrls(fileIDs: string[]): Promise<Map<string, string>> {
  return dailyMediaTempUrls.map(fileIDs)
}
