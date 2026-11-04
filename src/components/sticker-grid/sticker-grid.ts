/**
 * 8 贴纸栅格。详情贴纸条和列表快捷贴共用。
 * 事件：pick（点中一枚，detail.id 为贴纸 id）。busy 非空时忽略连点。
 */
Component({
  options: { styleIsolation: 'isolated' },
  properties: {
    stickers: { type: Array, value: [] },
    currentId: { type: String, value: '' },
    busy: { type: String, value: '' },
  },
  methods: {
    onPick(e: WechatMiniprogram.TouchEvent) {
      const id = String(e.currentTarget.dataset.id || '')
      if (!id || this.data.busy) return
      this.triggerEvent('pick', { id })
    },
  },
})
