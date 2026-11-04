/**
 * 报备卡片。post 为页面映射后的展示数据（见 core/views 的 reportView）。
 * 列表：照片出血做刊头，下面是署名行（头像 + 昵称 + 最多两个标签胶囊 + 钟点）和正文，
 * 底部是横贯卡片的回声带；详情：全文、全部图片，自己的报备显示回声状态。
 * book 为已共鸣档案：无编辑入口，回声贴纸放大，只读。
 * 事件：open（轻触列表行）、more（自己的报备点「⋯」或长按）、quick（对方还没回心时点「回心」或长按）。
 */
/** 长按之后这一小段里跟着来的 tap 不再进详情 */
const SUPPRESS_OPEN_MS = 400

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
    /** 已共鸣档案：只读，回声贴纸放大 */
    book: { type: Boolean, value: false },
  },
  data: {
    /** 头像加载失败（链接过期等）时退回首字署名 */
    avatarError: false,
  },
  observers: {
    post() {
      if (this.data.avatarError) this.setData({ avatarError: false })
    },
  },
  lifetimes: {
    created() {
      this._suppressOpenUntil = 0
    },
  },
  methods: {
    onAvatarError() {
      if (!this.data.avatarError) this.setData({ avatarError: true })
    },
    onOpen() {
      if (this.data.detail) return
      if (this._suppressOpenUntil > Date.now()) return
      this.triggerEvent('open', { id: this.data.post.id })
    },
    onMore() {
      if (this.data.book) return
      if (this.data.post.isMine) this.triggerEvent('more', { id: this.data.post.id })
    },
    onQuick() {
      if (this.data.book) return
      if (!this.data.post.echo || !this.data.post.echo.action) return
      this.triggerEvent('quick', { id: this.data.post.id })
    },
    onLongPress() {
      this._suppressOpenUntil = Date.now() + SUPPRESS_OPEN_MS
      if (this.data.book) return
      if (this.data.post.isMine) {
        this.onMore()
        return
      }
      if (this.data.post.echo && this.data.post.echo.action) this.onQuick()
    },
  },
})
