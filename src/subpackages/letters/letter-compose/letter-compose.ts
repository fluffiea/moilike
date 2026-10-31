import type { LetterItem } from '../../../types/api'
import { call } from '../../../core/api'
import { composeBehavior } from '../../../core/compose'
import { LETTER_PRESET_TYPES } from '../../../core/format'
import { uploadImages, type PickedImage } from '../../../core/media'
import { PAGE_LETTER_LIST, back } from '../../../core/paths'
import { emit, getUser } from '../../../core/store'
import { toast, toastDone } from '../../../core/ui'

const CUSTOM = '_custom'

type Data = {
  reply: boolean
  salutation: string
  types: { name: string; label: string }[]
  type: string
  customType: string
  title: string
  count: number
  images: PickedImage[]
  submitting: boolean
  leaveHint: string
}

Component<Data, {}, WechatMiniprogram.Component.MethodOption, { content: string }, true>({
  behaviors: [composeBehavior],
  data: {
    reply: false,
    salutation: '',
    types: [...LETTER_PRESET_TYPES, { name: CUSTOM, label: '自定义' }],
    type: 'whisper',
    customType: '',
    title: '',
    count: 0,
    images: [],
    submitting: false,
    leaveHint: '',
  },
  methods: {
    onLoad(query: Record<string, string>) {
      this.content = ''
      const u = getUser()
      const name = u && u.partner ? u.partner.nickName : 'Ta'
      const preset = query.type ? decodeURIComponent(query.type) : ''
      const isPreset = LETTER_PRESET_TYPES.some((t) => t.name === preset)
      this.setData({
        reply: query.reply === '1',
        salutation: `致 ${name}：`,
        type: !preset ? 'whisper' : isPreset ? preset : CUSTOM,
        customType: preset && !isPreset ? preset : '',
      })
    },

    onType(e: WechatMiniprogram.TouchEvent) {
      this.setData({ type: String(e.currentTarget.dataset.name) })
    },
    onCustomType(e: WechatMiniprogram.Input) {
      this.setData({ customType: e.detail.value })
    },
    onTitle(e: WechatMiniprogram.Input) {
      this.setData({ title: e.detail.value })
      this.markDirty()
    },
    onContent(e: WechatMiniprogram.Input) {
      this.content = e.detail.value
      this.setData({ count: this.content.length })
      this.markDirty()
    },

    async onSubmit() {
      const content = this.content.trim()
      if (!content) return toast('写点想说的话吧')
      const type = this.data.type === CUSTOM ? this.data.customType.trim() || 'text' : this.data.type
      if (this.data.submitting) return
      this.setData({ submitting: true })
      let fileIds: string[]
      try {
        fileIds = await uploadImages('letters', this.data.images)
      } catch {
        this.setData({ submitting: false })
        return toast('图片上传失败，请重试')
      }
      const r = await call('letters.create', { title: this.data.title.trim(), content, type, images: fileIds })
      this.setData({ submitting: false })
      if (!r.ok) return toast(r.message)
      const l = r.data.letter
      const item: LetterItem = {
        id: l.id,
        isMine: true,
        title: l.title,
        preview: l.content.slice(0, 120),
        type: l.type,
        thumbs: l.images.slice(0, 3).map((m) => m.thumb),
        createdAtMs: l.createdAtMs,
      }
      emit('letter:upsert', item)
      this.finish()
      toastDone('信已寄出')
      back(PAGE_LETTER_LIST)
    },
  },
})
