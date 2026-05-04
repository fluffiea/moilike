import {
  DAILY_CLOUD_FUNCTION,
  type DailyListCloudResult,
  type DailyPostCloudResult,
  type DailyVoidCloudResult,
  type TempFileUrlsCloudResult,
} from '../types/cloud'
import { showCloudInvokeErrorToast } from './cloud-invoke'

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

const DAILY_MEDIA_TEMP_URL_BATCH = 20

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
