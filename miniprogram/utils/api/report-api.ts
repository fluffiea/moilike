import {
  REPORT_CLOUD_FUNCTION,
  type ReportListCloudResult,
  type ReportPostCloudResult,
  type ReportTagsCloudResult,
  type ReportVoidCloudResult,
  type TempFileUrlsCloudResult,
} from '../../types/cloud'
import { showCloudInvokeErrorToast } from '../cloud-invoke'
import { MEDIA_TEMP_URL_BATCH } from '../../constants/limits'

export type ReportListFilter = 'mine' | 'action_needed' | 'all'

/** 并发请求去重：相同 key 的调用共享同一个 inflight Promise。 */
const inflight = new Map<string, Promise<unknown>>()

function dedupKey(action: string, payload: Record<string, unknown>): string {
  return action + '|' + JSON.stringify(payload)
}

async function dedupCall<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key)
  if (existing) return existing as Promise<T>
  const p = fn().finally(() => { inflight.delete(key) })
  inflight.set(key, p)
  return p
}

export async function reportListReports(
  offset: number,
  filter: ReportListFilter,
): Promise<ReportListCloudResult | null> {
  if (!wx.cloud) return null
  return dedupCall(dedupKey('listReports', { offset, filter }), async () => {
    try {
      const res = await wx.cloud.callFunction({
        name: REPORT_CLOUD_FUNCTION,
        data: { action: 'listReports', offset, filter },
      })
      return res.result as ReportListCloudResult
    } catch (e) {
      showCloudInvokeErrorToast(e, 4200, REPORT_CLOUD_FUNCTION)
      return null
    }
  })
}

export async function reportGetReport(id: string): Promise<ReportPostCloudResult | null> {
  if (!wx.cloud) return null
  const sid = typeof id === 'string' ? id.trim() : ''
  if (!sid) return null
  try {
    const res = await wx.cloud.callFunction({
      name: REPORT_CLOUD_FUNCTION,
      data: { action: 'getReport', id: sid },
    })
    return res.result as ReportPostCloudResult
  } catch (e) {
    showCloudInvokeErrorToast(e, 4200, REPORT_CLOUD_FUNCTION)
    return null
  }
}

export async function reportGetReportFeedItem(postId: string): Promise<ReportPostCloudResult | null> {
  if (!wx.cloud) return null
  const sid = typeof postId === 'string' ? postId.trim() : ''
  if (!sid) return null
  try {
    const res = await wx.cloud.callFunction({
      name: REPORT_CLOUD_FUNCTION,
      data: { action: 'getReportFeedItem', id: sid },
    })
    return res.result as ReportPostCloudResult
  } catch (e) {
    showCloudInvokeErrorToast(e, 4200, REPORT_CLOUD_FUNCTION)
    return null
  }
}

export async function reportListTags(): Promise<ReportTagsCloudResult | null> {
  if (!wx.cloud) return null
  try {
    const res = await wx.cloud.callFunction({
      name: REPORT_CLOUD_FUNCTION,
      data: { action: 'listReportTags' },
    })
    return res.result as ReportTagsCloudResult
  } catch (e) {
    showCloudInvokeErrorToast(e, 4200, REPORT_CLOUD_FUNCTION)
    return null
  }
}

export async function reportAddTag(tag: string): Promise<ReportTagsCloudResult | null> {
  if (!wx.cloud) return null
  const t = typeof tag === 'string' ? tag.trim() : ''
  if (!t) return null
  try {
    const res = await wx.cloud.callFunction({
      name: REPORT_CLOUD_FUNCTION,
      data: { action: 'addReportTag', tag: t },
    })
    return res.result as ReportTagsCloudResult
  } catch (e) {
    showCloudInvokeErrorToast(e, 4200, REPORT_CLOUD_FUNCTION)
    return null
  }
}

export async function reportDeleteTag(tag: string): Promise<ReportTagsCloudResult | null> {
  if (!wx.cloud) return null
  const t = typeof tag === 'string' ? tag.trim() : ''
  if (!t) return null
  try {
    const res = await wx.cloud.callFunction({
      name: REPORT_CLOUD_FUNCTION,
      data: { action: 'deleteReportTag', tag: t },
    })
    return res.result as ReportTagsCloudResult
  } catch (e) {
    showCloudInvokeErrorToast(e, 4200, REPORT_CLOUD_FUNCTION)
    return null
  }
}

export async function reportCreate(body: string, images: string[], tags: string[], recordAtMs: number) {
  if (!wx.cloud) return null
  try {
    const res = await wx.cloud.callFunction({
      name: REPORT_CLOUD_FUNCTION,
      data: { action: 'createReport', body, images, tags, recordAtMs },
    })
    return res.result as ReportPostCloudResult
  } catch (e) {
    showCloudInvokeErrorToast(e, 4200, REPORT_CLOUD_FUNCTION)
    return null
  }
}

export async function reportUpdate(
  id: string,
  body: string,
  images: string[],
  tags: string[],
  recordAtMs: number | null,
) {
  if (!wx.cloud) return null
  const sid = typeof id === 'string' ? id.trim() : ''
  if (!sid) return null
  try {
    const res = await wx.cloud.callFunction({
      name: REPORT_CLOUD_FUNCTION,
      data: {
        action: 'updateReport',
        id: sid,
        body,
        images,
        tags,
        recordAtMs: recordAtMs != null ? recordAtMs : undefined,
      },
    })
    return res.result as ReportPostCloudResult
  } catch (e) {
    showCloudInvokeErrorToast(e, 4200, REPORT_CLOUD_FUNCTION)
    return null
  }
}

export async function reportMarkRead(id: string): Promise<ReportPostCloudResult | null> {
  if (!wx.cloud) return null
  const sid = typeof id === 'string' ? id.trim() : ''
  if (!sid) return null
  try {
    const res = await wx.cloud.callFunction({
      name: REPORT_CLOUD_FUNCTION,
      data: { action: 'markReportRead', id: sid },
    })
    return res.result as ReportPostCloudResult
  } catch (e) {
    showCloudInvokeErrorToast(e, 4200, REPORT_CLOUD_FUNCTION)
    return null
  }
}

export async function reportDelete(id: string): Promise<ReportVoidCloudResult | null> {
  if (!wx.cloud) return null
  const sid = typeof id === 'string' ? id.trim() : ''
  if (!sid) return null
  try {
    const res = await wx.cloud.callFunction({
      name: REPORT_CLOUD_FUNCTION,
      data: { action: 'deleteReport', id: sid },
    })
    return res.result as ReportVoidCloudResult
  } catch (e) {
    showCloudInvokeErrorToast(e, 4200, REPORT_CLOUD_FUNCTION)
    return null
  }
}

export async function reportEvaluate(id: string, text: string): Promise<ReportPostCloudResult | null> {
  if (!wx.cloud) return null
  const sid = typeof id === 'string' ? id.trim() : ''
  if (!sid) return null
  try {
    const res = await wx.cloud.callFunction({
      name: REPORT_CLOUD_FUNCTION,
      data: { action: 'evaluateReport', id: sid, text },
    })
    return res.result as ReportPostCloudResult
  } catch (e) {
    showCloudInvokeErrorToast(e, 4200, REPORT_CLOUD_FUNCTION)
    return null
  }
}

const REPORT_MEDIA_TEMP_URL_BATCH = MEDIA_TEMP_URL_BATCH

/** 配图临时链接缓存：cloud://fileID → { url, resolvedAt }，8 分钟内复用，减少云函数调用。 */
const reportMediaTempUrlCache = new Map<string, { url: string; resolvedAt: number }>()
const REPORT_MEDIA_TEMP_URL_TTL_MS = 8 * 60 * 1000

/** 清空报备配图临时链接缓存（下拉刷新等全量重载场景调用）。 */
export function invalidateReportMediaTempUrlCache(): void {
  reportMediaTempUrlCache.clear()
}

export async function reportMapMediaTempUrls(fileIDs: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const unique = [
    ...new Set(fileIDs.filter((x) => typeof x === 'string' && x.indexOf('cloud://') === 0)),
  ]
  if (unique.length === 0 || !wx.cloud) return out

  const now = Date.now()
  const uncached: string[] = []
  for (const fid of unique) {
    const entry = reportMediaTempUrlCache.get(fid)
    if (entry && now - entry.resolvedAt < REPORT_MEDIA_TEMP_URL_TTL_MS) {
      out.set(fid, entry.url)
    } else {
      uncached.push(fid)
    }
  }

  for (let i = 0; i < uncached.length; i += REPORT_MEDIA_TEMP_URL_BATCH) {
    const chunk = uncached.slice(i, i + REPORT_MEDIA_TEMP_URL_BATCH)
    try {
      const res = await wx.cloud.callFunction({
        name: REPORT_CLOUD_FUNCTION,
        data: { action: 'getReportMediaTempURLs', fileIDs: chunk },
      })
      const body = res.result as TempFileUrlsCloudResult
      if (!body || body.ok !== true || !body.urls) continue
      for (const [fid, url] of Object.entries(body.urls)) {
        if (typeof url === 'string' && url) {
          out.set(fid, url)
          reportMediaTempUrlCache.set(fid, { url, resolvedAt: now })
        }
      }
    } catch {
      // 单批失败时跳过
    }
  }
  return out
}
