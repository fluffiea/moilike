import {
  REPORT_CLOUD_FUNCTION,
  type ReportListCloudResult,
  type ReportPostCloudResult,
  type ReportTagsCloudResult,
  type ReportVoidCloudResult,
  type TempFileUrlsCloudResult,
} from '../types/cloud'
import { showCloudInvokeErrorToast } from './cloud-invoke'

export type ReportListFilter = 'pending' | 'all' | 'mine'

export async function reportListReports(
  offset: number,
  filter: ReportListFilter,
): Promise<ReportListCloudResult | null> {
  if (!wx.cloud) return null
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

const REPORT_MEDIA_TEMP_URL_BATCH = 20

export async function reportMapMediaTempUrls(fileIDs: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const unique = [
    ...new Set(fileIDs.filter((x) => typeof x === 'string' && x.indexOf('cloud://') === 0)),
  ]
  if (unique.length === 0 || !wx.cloud) return out
  for (let i = 0; i < unique.length; i += REPORT_MEDIA_TEMP_URL_BATCH) {
    const chunk = unique.slice(i, i + REPORT_MEDIA_TEMP_URL_BATCH)
    try {
      const res = await wx.cloud.callFunction({
        name: REPORT_CLOUD_FUNCTION,
        data: { action: 'getReportMediaTempURLs', fileIDs: chunk },
      })
      const body = res.result as TempFileUrlsCloudResult
      if (!body || body.ok !== true || !body.urls) continue
      for (const [fid, url] of Object.entries(body.urls)) {
        if (typeof url === 'string' && url) out.set(fid, url)
      }
    } catch {
      // 单批失败时跳过
    }
  }
  return out
}
