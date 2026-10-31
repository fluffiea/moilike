import type { Media } from '../../types/api'
import { previewImages } from '../../core/media'

/** 1 张大图 / 2 张并排 / 3 张起九宫格；点击预览原图，不冒泡到外层卡片 */
Component({
  options: { styleIsolation: 'isolated' },
  properties: {
    images: { type: Array, value: [] as Media[] },
  },
  methods: {
    onTap(e: WechatMiniprogram.TouchEvent) {
      const list = this.data.images as Media[]
      previewImages(
        list.map((m) => m.url),
        Number(e.currentTarget.dataset.index) || 0,
      )
    },
  },
})
