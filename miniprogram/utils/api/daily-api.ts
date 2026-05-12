import {
  DAILY_CLOUD_FUNCTION,
  type DailyAddCommentCloudResult,
  type DailyListCloudResult,
  type DailyListCommentsCloudResult,
  type DailyPostCloudResult,
  type DailyUpdateCommentCloudResult,
  type DailyVoidCloudResult,
  type TempFileUrlsCloudResult,
} from '../../types/cloud'
import { showCloudInvokeErrorToast } from '../cloud-invoke'
import { MEDIA_TEMP_URL_BATCH } from '../../constants/limits'

/** 日常云函数 `daily` 的客户端封装；服务端按「本人 + 已互相绑定的伴侣」过滤列表与读写。 */

export async function dailyListDaily(offset: number): Promise<DailyListCloudResult | null> {
  if (!wx.cloud) return null
  try {
    const res = await wx.cloud.callFunction({
      name: DAILY_CLOUD_FUNCTION,
      data: { action: 'listDaily', offset },
    })
    return res.result as DailyListCloudResult
  } catch (e) {
    showCloudInvokeErrorToast(e, 4200, DAILY_CLOUD_FUNCTION)
    return null
  }
}

export async function dailyGetDaily(id: string): Promise<DailyPostCloudResult | null> {
  if (!wx.cloud) return null
  try {
    const res = await wx.cloud.callFunction({
      name: DAILY_CLOUD_FUNCTION,
      data: { action: 'getDaily', id },
    })
    return res.result as DailyPostCloudResult
  } catch (e) {
    showCloudInvokeErrorToast(e, 4200, DAILY_CLOUD_FUNCTION)
    return null
  }
}

/** 单条列表卡数据（正文 + 首评摘要），用于从详情返回时只合并一项、不重拉整页。 */
export async function dailyGetDailyFeedItem(postId: string): Promise<DailyPostCloudResult | null> {
  if (!wx.cloud) return null
  const id = typeof postId === 'string' ? postId.trim() : ''
  if (!id) return null
  try {
    const res = await wx.cloud.callFunction({
      name: DAILY_CLOUD_FUNCTION,
      data: { action: 'getDailyFeedItem', id },
    })
    return res.result as DailyPostCloudResult
  } catch (e) {
    showCloudInvokeErrorToast(e, 4200, DAILY_CLOUD_FUNCTION)
    return null
  }
}

export async function dailyListComments(
  postId: string,
): Promise<DailyListCommentsCloudResult | null> {
  if (!wx.cloud) return null
  try {
    const res = await wx.cloud.callFunction({
      name: DAILY_CLOUD_FUNCTION,
      data: { action: 'listDailyComments', postId },
    })
    return res.result as DailyListCommentsCloudResult
  } catch (e) {
    showCloudInvokeErrorToast(e, 4200, DAILY_CLOUD_FUNCTION)
    return null
  }
}

export async function dailyUpdateComment(
  postId: string,
  commentId: string,
  text: string,
): Promise<DailyUpdateCommentCloudResult | null> {
  if (!wx.cloud) return null
  const pid = typeof postId === 'string' ? postId.trim() : ''
  const cid = typeof commentId === 'string' ? commentId.trim() : ''
  const body = typeof text === 'string' ? text.trim().slice(0, 500) : ''
  if (!pid || !cid || !body) return null
  try {
    const res = await wx.cloud.callFunction({
      name: DAILY_CLOUD_FUNCTION,
      data: { action: 'updateDailyComment', postId: pid, commentId: cid, text: body },
    })
    return res.result as DailyUpdateCommentCloudResult
  } catch (e) {
    showCloudInvokeErrorToast(e, 4200, DAILY_CLOUD_FUNCTION)
    return null
  }
}

export async function dailyDeleteComment(
  postId: string,
  commentId: string,
): Promise<DailyVoidCloudResult | null> {
  if (!wx.cloud) return null
  const pid = typeof postId === 'string' ? postId.trim() : ''
  const cid = typeof commentId === 'string' ? commentId.trim() : ''
  if (!pid || !cid) return null
  try {
    const res = await wx.cloud.callFunction({
      name: DAILY_CLOUD_FUNCTION,
      data: { action: 'deleteDailyComment', postId: pid, commentId: cid },
    })
    return res.result as DailyVoidCloudResult
  } catch (e) {
    showCloudInvokeErrorToast(e, 4200, DAILY_CLOUD_FUNCTION)
    return null
  }
}

export async function dailyAddComment(
  postId: string,
  text: string,
  parentCommentId?: string,
): Promise<DailyAddCommentCloudResult | null> {
  if (!wx.cloud) return null
  const parent =
    typeof parentCommentId === 'string' && parentCommentId.trim()
      ? parentCommentId.trim()
      : ''
  try {
    const res = await wx.cloud.callFunction({
      name: DAILY_CLOUD_FUNCTION,
      data: parent
        ? { action: 'addDailyComment', postId, text, parentCommentId: parent }
        : { action: 'addDailyComment', postId, text },
    })
    return res.result as DailyAddCommentCloudResult
  } catch (e) {
    showCloudInvokeErrorToast(e, 4200, DAILY_CLOUD_FUNCTION)
    return null
  }
}

export async function dailyCreateDaily(
  snippet: string,
  images: string[],
): Promise<DailyPostCloudResult | null> {
  if (!wx.cloud) return null
  try {
    const res = await wx.cloud.callFunction({
      name: DAILY_CLOUD_FUNCTION,
      data: { action: 'createDaily', snippet, images },
    })
    return res.result as DailyPostCloudResult
  } catch (e) {
    showCloudInvokeErrorToast(e, 4200, DAILY_CLOUD_FUNCTION)
    return null
  }
}

export async function dailyUpdateDaily(
  id: string,
  snippet: string,
  images: string[],
): Promise<DailyPostCloudResult | null> {
  if (!wx.cloud) return null
  try {
    const res = await wx.cloud.callFunction({
      name: DAILY_CLOUD_FUNCTION,
      data: { action: 'updateDaily', id, snippet, images },
    })
    return res.result as DailyPostCloudResult
  } catch (e) {
    showCloudInvokeErrorToast(e, 4200, DAILY_CLOUD_FUNCTION)
    return null
  }
}

export async function dailyDeleteDaily(id: string): Promise<DailyVoidCloudResult | null> {
  if (!wx.cloud) return null
  try {
    const res = await wx.cloud.callFunction({
      name: DAILY_CLOUD_FUNCTION,
      data: { action: 'deleteDaily', id },
    })
    return res.result as DailyVoidCloudResult
  } catch (e) {
    showCloudInvokeErrorToast(e, 4200, DAILY_CLOUD_FUNCTION)
    return null
  }
}

const DAILY_MEDIA_TEMP_URL_BATCH = MEDIA_TEMP_URL_BATCH

/** 将日常配图 cloud fileID 换为临时 HTTPS（云函数校验路径为 `daily/{情侣一方 openId}/`）。 */
export async function dailyMapMediaTempUrls(fileIDs: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const unique = [...new Set(fileIDs.filter((x) => typeof x === 'string' && x.startsWith('cloud://')))]
  if (unique.length === 0 || !wx.cloud) return out
  for (let i = 0; i < unique.length; i += DAILY_MEDIA_TEMP_URL_BATCH) {
    const chunk = unique.slice(i, i + DAILY_MEDIA_TEMP_URL_BATCH)
    try {
      const res = await wx.cloud.callFunction({
        name: DAILY_CLOUD_FUNCTION,
        data: { action: 'getDailyMediaTempURLs', fileIDs: chunk },
      })
      const body = res.result as TempFileUrlsCloudResult
      if (!body || body.ok !== true || !body.urls) continue
      for (const [fid, url] of Object.entries(body.urls)) {
        if (typeof url === 'string' && url) out.set(fid, url)
      }
    } catch {
      // 单批失败时跳过，避免 toast 刷屏
    }
  }
  return out
}
