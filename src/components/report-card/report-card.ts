/**
 * 报备卡片。post 为页面映射后的展示数据（见 core/views 的 reportView）。
 * 列表：照片嵌在白卡片里（一张横图，两张并排，三张起一行，多出来的标在最后一张上），
 * 下面是署名行和预览，回声贴在同一张白卡片上；详情：全文、全部图片，自己的报备显示回声。
 * book 为已共鸣档案：无编辑入口，回声贴纸放大，只读。
 * 事件：open（轻触列表行）、more（自己的报备点「⋯」或长按）、quick（对方还没回声时点「回声」或长按）。
 */
/** 长按之后这一小段里跟着来的 tap 不再进详情 */
const SUPPRESS_OPEN_MS = 400

type Shot = { id: string; thumb: string; more: string }

/** 列表只露一行：1 张横图，2 张对半，3 张起每行三格，其余张数标在最后一格 */
function listAlbum(images: { id?: string; thumb?: string }[] | undefined): { album: string; shots: Shot[] } {
  const list = Array.isArray(images) ? images.filter((img) => img && img.thumb) : []
  const shot = (img: { id?: string; thumb?: string }, index: number, more = ''): Shot => ({
    id: img.id || String(index),
    thumb: img.thumb || '',
    more,
  })
  if (list.length === 0) return { album: '', shots: [] }
  if (list.length === 1) return { album: 'one', shots: [shot(list[0], 0)] }
  if (list.length === 2) return { album: 'two', shots: list.map((img, index) => shot(img, index)) }
  const extra = list.length - 3
  return {
    album: 'three',
    shots: list.slice(0, 3).map((img, index) => shot(img, index, index === 2 && extra > 0 ? `+${extra}` : '')),
  }
}

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
    /** 列表相册：one / two / three，无图为空 */
    album: '',
    shots: [] as Shot[],
  },
  observers: {
    post(post: { images?: { id?: string; thumb?: string }[] }) {
      const next = listAlbum(post && post.images)
      const patch: { album: string; shots: Shot[]; avatarError?: boolean } = { album: next.album, shots: next.shots }
      if (this.data.avatarError) patch.avatarError = false
      this.setData(patch)
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
