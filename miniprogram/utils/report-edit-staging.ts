/** 编辑报备：跳转前写入、编辑页读出并清除 */
const STORAGE_KEY = 'moilike_report_compose_edit_staging'

export type ReportEditStagingPayload = {
  postId: string
  text: string
  images: string[]
}

export function setReportEditStaging(payload: ReportEditStagingPayload): void {
  try {
    wx.setStorageSync(STORAGE_KEY, {
      postId: payload.postId,
      text: typeof payload.text === 'string' ? payload.text : '',
      images: Array.isArray(payload.images) ? payload.images.filter((u) => typeof u === 'string') : [],
      ts: Date.now(),
    })
  } catch {
    // ignore
  }
}

export function takeReportEditStaging(expectedPostId: string): { text: string; images: string[] } | null {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY) as
      | {
          postId?: string
          text?: string
          images?: unknown[]
        }
      | undefined
    if (!raw || typeof raw !== 'object' || raw.postId !== expectedPostId) {
      return null
    }
    wx.removeStorageSync(STORAGE_KEY)
    const text = typeof raw.text === 'string' ? raw.text : ''
    const images = Array.isArray(raw.images)
      ? raw.images.filter((u): u is string => typeof u === 'string')
      : []
    return { text, images }
  } catch {
    return null
  }
}
