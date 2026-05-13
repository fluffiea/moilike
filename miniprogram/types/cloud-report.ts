import type { TempFileUrlsCloudResult } from './cloud-user'

/** 云函数名，与 cloudfunctions/report 目录一致 */
export const REPORT_CLOUD_FUNCTION = 'report' as const

export type ReportPartnerState = 'pending_read' | 'read' | 'evaluated'

/** 报备列表/详情卡（云函数 list/get/create/update/mark/evaluate 返回的公开字段） */
export type ReportPostPublic = {
  id: string
  userName: string
  authorAvatarUrl?: string
  authorAvatarDisplay?: string
  body: string
  tags: string[]
  images: string[]
  recordTimeStr: string
  /** 编辑态：记录时刻毫秒（云函数返回） */
  recordAtMs?: number
  publishTimeStr: string
  isMine?: boolean
  partnerState: ReportPartnerState
  statusLabel: string
  partnerEvalText: string
  canMarkRead?: boolean
  canEvaluate?: boolean
  /** 客户端 enrich：每条 tag 对应 chip 色阶 0–5 */
  tagChips?: { name: string; colorIdx: number }[]
}

export type ReportListCloudResult =
  | { ok: true; list: ReportPostPublic[]; hasMore: boolean; nextOffset: number }
  | { ok: false; error?: string }

export type ReportPostCloudResult =
  | { ok: true; post: ReportPostPublic }
  | { ok: false; error?: string }

export type ReportTagsCloudResult =
  | { ok: true; tags: string[] }
  | { ok: false; error?: string }

export type ReportVoidCloudResult = { ok: true } | { ok: false; error?: string }

/** 云函数 report · getReportMediaTempURLs */
export type ReportMediaTempUrlsCloudResult = TempFileUrlsCloudResult
