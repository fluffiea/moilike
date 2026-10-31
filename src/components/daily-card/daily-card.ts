/**
 * 日常卡片。post 为页面映射后的展示数据（见 pages/moments 的 toView）。
 * 事件：open（轻触卡片）、more（自己的帖子点「⋯」或长按）。
 */
Component({
  options: { styleIsolation: 'isolated' },
  properties: {
    post: { type: Object, value: {} },
    /** 详情页内嵌：不响应 open，不显示评论摘要 */
    detail: { type: Boolean, value: false },
  },
  methods: {
    onOpen() {
      if (!this.data.detail) this.triggerEvent('open', { id: this.data.post.id })
    },
    onMore() {
      if (this.data.post.isMine) this.triggerEvent('more', { id: this.data.post.id })
    },
  },
})
