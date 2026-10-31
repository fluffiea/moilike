import type { DailyPost } from '../../../types/api'
import { call } from '../../../core/api'
import { composeBehavior } from '../../../core/compose'
import { uploadImages, type PickedImage } from '../../../core/media'
import { TAB_MOMENTS, back } from '../../../core/paths'
import { emit, takeHandoff } from '../../../core/store'
import { toast, toastDone } from '../../../core/ui'

type Data = {
  editId: string
  initialText: string
  count: number
  loading: boolean
  images: PickedImage[]
  submitting: boolean
  leaveHint: string
}

Component<Data, {}, WechatMiniprogram.Component.MethodOption, { text: string }, true>({
  behaviors: [composeBehavior],
  data: {
    editId: '',
    initialText: '',
    count: 0,
    loading: false,
    images: [],
    submitting: false,
    leaveHint: '',
  },
  methods: {
    async onLoad(query: Record<string, string>) {
      this.text = ''
      const id = query.id || ''
      if (!id) return
      this.setData({ editId: id })
      const cached = takeHandoff<DailyPost>(`daily-edit:${id}`)
      if (cached) return this.fill(cached)
      this.setData({ loading: true })
      const r = await call('daily.get', { id })
      this.setData({ loading: false })
      if (!r.ok) return toast(r.message)
      this.fill(r.data.post)
    },

    fill(post: DailyPost) {
      this.text = post.text
      this.setData({
        initialText: post.text,
        count: post.text.length,
        images: post.images.map((m) => ({ fileId: m.id, src: m.thumb || m.url })),
      })
    },

    onInput(e: WechatMiniprogram.Input) {
      this.text = e.detail.value
      this.setData({ count: this.text.length })
      this.markDirty()
    },

    async onSubmit() {
      const text = this.text.trim()
      const { images, editId } = this.data
      if (!text && images.length === 0) return toast('写点什么或选一张图吧')
      if (this.data.submitting) return
      this.setData({ submitting: true })
      let fileIds: string[]
      try {
        fileIds = await uploadImages('daily', images)
      } catch {
        this.setData({ submitting: false })
        return toast('图片上传失败，请重试')
      }
      const r = editId
        ? await call('daily.update', { id: editId, text, images: fileIds })
        : await call('daily.create', { text, images: fileIds })
      this.setData({ submitting: false })
      if (!r.ok) return toast(r.message)
      emit('daily:upsert', r.data.post)
      this.finish()
      toastDone(editId ? '已保存' : '已发布')
      back(TAB_MOMENTS)
    },
  },
})
