import {
  REPORT_CLOUD_FUNCTION,
  type ReportListCloudResult,
  type ReportPostCloudResult,
  type ReportTagsCloudResult,
  type ReportVoidCloudResult,
} from '../../types/cloud'
import { callCloud, createMediaTempUrlResolver, dedupe } from './cloud-call'

export type ReportListFilter = 'mine' | 'action_needed' | 'all'

export async function reportListReports(
  offset: number,
  filter: ReportListFilter,
): Promise<ReportListCloudResult | null> {
  return dedupe(REPORT_CLOUD_FUNCTION + '|listReports|' + JSON.stringify({ offset, filter }), () =>
    callCloud<ReportListCloudResult>(REPORT_CLOUD_FUNCTION, {
      action: 'listReports',
      offset,
      filter,
    }),
  )
}

export async function reportGetReport(id: string): Promise<ReportPostCloudResult | null> {
  const sid = typeof id === 'string' ? id.trim() : ''
  if (!sid) return null
  return callCloud<ReportPostCloudResult>(REPORT_CLOUD_FUNCTION, { action: 'getReport', id: sid })
}

export async function reportGetReportFeedItem(postId: string): Promise<ReportPostCloudResult | null> {
  const sid = typeof postId === 'string' ? postId.trim() : ''
  if (!sid) return null
  return callCloud<ReportPostCloudResult>(REPORT_CLOUD_FUNCTION, {
    action: 'getReportFeedItem',
    id: sid,
  })
}

export async function reportListTags(): Promise<ReportTagsCloudResult | null> {
  return callCloud<ReportTagsCloudResult>(REPORT_CLOUD_FUNCTION, { action: 'listReportTags' })
}

export async function reportAddTag(tag: string): Promise<ReportTagsCloudResult | null> {
  const t = typeof tag === 'string' ? tag.trim() : ''
  if (!t) return null
  return callCloud<ReportTagsCloudResult>(REPORT_CLOUD_FUNCTION, { action: 'addReportTag', tag: t })
}

export async function reportDeleteTag(tag: string): Promise<ReportTagsCloudResult | null> {
  const t = typeof tag === 'string' ? tag.trim() : ''
  if (!t) return null
  return callCloud<ReportTagsCloudResult>(REPORT_CLOUD_FUNCTION, {
    action: 'deleteReportTag',
    tag: t,
  })
}

export async function reportCreate(
  body: string,
  images: string[],
  tags: string[],
  recordAtMs: number,
): Promise<ReportPostCloudResult | null> {
  return callCloud<ReportPostCloudResult>(REPORT_CLOUD_FUNCTION, {
    action: 'createReport',
    body,
    images,
    tags,
    recordAtMs,
  })
}

export async function reportUpdate(
  id: string,
  body: string,
  images: string[],
  tags: string[],
  recordAtMs: number | null,
): Promise<ReportPostCloudResult | null> {
  const sid = typeof id === 'string' ? id.trim() : ''
  if (!sid) return null
  return callCloud<ReportPostCloudResult>(REPORT_CLOUD_FUNCTION, {
    action: 'updateReport',
    id: sid,
    body,
    images,
    tags,
    recordAtMs: recordAtMs != null ? recordAtMs : undefined,
  })
}

export async function reportMarkRead(id: string): Promise<ReportPostCloudResult | null> {
  const sid = typeof id === 'string' ? id.trim() : ''
  if (!sid) return null
  return callCloud<ReportPostCloudResult>(REPORT_CLOUD_FUNCTION, {
    action: 'markReportRead',
    id: sid,
  })
}

export async function reportDelete(id: string): Promise<ReportVoidCloudResult | null> {
  const sid = typeof id === 'string' ? id.trim() : ''
  if (!sid) return null
  return callCloud<ReportVoidCloudResult>(REPORT_CLOUD_FUNCTION, { action: 'deleteReport', id: sid })
}

export async function reportEvaluate(
  id: string,
  text: string,
): Promise<ReportPostCloudResult | null> {
  const sid = typeof id === 'string' ? id.trim() : ''
  if (!sid) return null
  return callCloud<ReportPostCloudResult>(REPORT_CLOUD_FUNCTION, {
    action: 'evaluateReport',
    id: sid,
    text,
  })
}

const reportMediaTempUrls = createMediaTempUrlResolver({
  cloudFunctionName: REPORT_CLOUD_FUNCTION,
  action: 'getReportMediaTempURLs',
})

/** 清空报备配图临时链接缓存（下拉刷新等全量重载场景调用）。 */
export function invalidateReportMediaTempUrlCache(): void {
  reportMediaTempUrls.invalidate()
}

export function reportMapMediaTempUrls(fileIDs: string[]): Promise<Map<string, string>> {
  return reportMediaTempUrls.map(fileIDs)
}
