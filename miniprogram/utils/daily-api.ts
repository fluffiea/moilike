import {
  DAILY_CLOUD_FUNCTION,
  type DailyListCloudResult,
  type DailyPostCloudResult,
  type DailyVoidCloudResult,
} from '../types/cloud'
import { showCloudInvokeErrorToast } from './cloud-invoke'

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
