/**
 * 报备卡片。post 为页面映射后的展示数据（见 core/views 的 reportView）。
 * 事件：open（轻触卡片）、more（自己的报备点「⋯」或长按）。
 */
Component({
  options: { styleIsolation: 'isolated' },
  properties: {
    post: { type: Object, value: {} },
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
