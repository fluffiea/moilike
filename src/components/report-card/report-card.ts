/**
 * 报备卡片。post 为页面映射后的展示数据（见 core/views 的 reportView）。
 * 列表只露三信号；detail 为真时展示全文、图和标签。
 * 事件：open（轻触列表行）、more（自己的报备点「⋯」或长按）、quick（待我回应的「回心」或长按）。
 */
Component<
  WechatMiniprogram.IAnyObject,
  WechatMiniprogram.IAnyObject,
  WechatMiniprogram.Component.MethodOption,
  { _suppressOpenUntil: number }
>({
  options: { styleIsolation: 'isolated' },
  properties: {
    post: { type: Object, value: {} },
    detail: { type: Boolean, value: false },
  },
  lifetimes: {
    created() {
      this._suppressOpenUntil = 0
    },
  },
  methods: {
    onOpen() {
      if (this.data.detail) return
      if (this._suppressOpenUntil > Date.now()) return
      this.triggerEvent('open', { id: this.data.post.id })
    },
    onMore() {
      if (this.data.post.isMine) this.triggerEvent('more', { id: this.data.post.id })
    },
    onQuick() {
      if (!this.data.post.quickReply) return
      this.triggerEvent('quick', { id: this.data.post.id })
    },
    onLongPress() {
      this._suppressOpenUntil = Date.now() + 400
      if (this.data.detail || !this.data.post.quickReply) {
        this.onMore()
        return
      }
      this.onQuick()
    },
  },
})
