import { pickImages, previewImages, type PickedImage } from '../../core/media'

/**
 * 发布页选图：受控组件，items 由页面持有，变化通过 change 事件回传 { items }。
 * 「添加」统一弹出相册 / 拍照选择，不再依赖长按。
 */
Component({
  options: { styleIsolation: 'isolated' },
  properties: {
    items: { type: Array, value: [] as PickedImage[] },
    max: { type: Number, value: 9 },
  },
  methods: {
    async onAdd() {
      const items = this.data.items as PickedImage[]
      const paths = await pickImages(this.data.max - items.length)
      if (paths.length === 0) return
      this.triggerEvent('change', { items: items.concat(paths.map((src) => ({ fileId: '', src }))) })
    },
    onRemove(e: WechatMiniprogram.TouchEvent) {
      const index = Number(e.currentTarget.dataset.index)
      const items = (this.data.items as PickedImage[]).filter((_v, i) => i !== index)
      this.triggerEvent('change', { items })
    },
    onPreview(e: WechatMiniprogram.TouchEvent) {
      const items = this.data.items as PickedImage[]
      previewImages(
        items.map((i) => i.src),
        Number(e.currentTarget.dataset.index) || 0,
      )
    },
  },
})
