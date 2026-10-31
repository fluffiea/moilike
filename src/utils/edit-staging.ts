/** 编辑页暂存：跳转前写入、编辑页 onLoad/ready 读出并清除（不依赖 EventChannel 时序）。 */

export type EditStagingPayload = {
  postId: string
  text: string
  images: string[]
}

export type EditStaging = {
  set(payload: EditStagingPayload): void
  /** 仅当 postId 一致时取出并删除，避免串单 */
  take(expectedPostId: string): { text: string; images: string[] } | null
}

/** 按 storage key 创建一个暂存通道；两个模块共用同一份实现，key 保持各自原有取值。 */
export function createEditStaging(storageKey: string): EditStaging {
  return {
    set(payload: EditStagingPayload): void {
      try {
        wx.setStorageSync(storageKey, {
          postId: payload.postId,
          text: typeof payload.text === 'string' ? payload.text : '',
          images: Array.isArray(payload.images)
            ? payload.images.filter((u) => typeof u === 'string')
            : [],
          ts: Date.now(),
        })
      } catch {
        // 存储满或不可用时忽略，编辑页仍可走云函数 get 接口
      }
    },

    take(expectedPostId: string): { text: string; images: string[] } | null {
      try {
        const raw = wx.getStorageSync(storageKey) as
          | {
              postId?: string
              text?: string
              images?: unknown[]
            }
          | undefined
        if (!raw || typeof raw !== 'object' || raw.postId !== expectedPostId) {
          return null
        }
        wx.removeStorageSync(storageKey)
        const text = typeof raw.text === 'string' ? raw.text : ''
        const images = Array.isArray(raw.images)
          ? raw.images.filter((u): u is string => typeof u === 'string')
          : []
        return { text, images }
      } catch {
        return null
      }
    },
  }
}
