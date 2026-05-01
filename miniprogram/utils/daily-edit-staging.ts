/** 编辑日常：跳转前写入、编辑页 onLoad/ready 读出并清除（不依赖 EventChannel 时序） */
const STORAGE_KEY = 'moilike_daily_compose_edit_staging'

export type DailyEditStagingPayload = {
  postId: string
  text: string
  images: string[]
}

export function setDailyEditStaging(payload: DailyEditStagingPayload): void {
  try {
    wx.setStorageSync(STORAGE_KEY, {
      postId: payload.postId,
      text: typeof payload.text === 'string' ? payload.text : '',
      images: Array.isArray(payload.images) ? payload.images.filter((u) => typeof u === 'string') : [],
      ts: Date.now(),
    })
  } catch {
    // 存储满或权限时忽略，编辑页仍可走云函数 getDaily
  }
}

/** 仅当 postId 一致时取出并删除，避免串单 */
export function takeDailyEditStaging(expectedPostId: string): { text: string; images: string[] } | null {
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
