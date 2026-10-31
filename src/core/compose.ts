import type { PickedImage } from './media'

const LEAVE_HINT = '内容还没有保存，离开后会丢失。'

/**
 * 发布 / 编辑页共用：配图列表、提交中状态、未保存离开提醒。
 * 页面在内容变化时调用 markDirty()，保存成功后调用 finish() 再返回。
 */
export const composeBehavior = Behavior({
  data: {
    images: [] as PickedImage[],
    submitting: false,
    leaveHint: '',
  },
  methods: {
    onImagesChange(e: WechatMiniprogram.CustomEvent<{ items: PickedImage[] }>) {
      this.setData({ images: e.detail.items })
      this.markDirty()
    },
    markDirty() {
      if (this.data.leaveHint) return
      this.setData({ leaveHint: LEAVE_HINT })
      if (typeof wx.enableAlertBeforeUnload === 'function') wx.enableAlertBeforeUnload({ message: LEAVE_HINT })
    },
    finish() {
      this.setData({ leaveHint: '' })
      if (typeof wx.disableAlertBeforeUnload === 'function') wx.disableAlertBeforeUnload()
    },
  },
})
