import type { Letter, LetterItem } from '../../../types/api'
import { call } from '../../../core/api'
import { composeBehavior } from '../../../core/compose'
import { LETTER_PRESET_TYPES } from '../../../core/format'
import { uploadImages, type PickedImage } from '../../../core/media'
import { PAGE_LETTER_LIST, back } from '../../../core/paths'
import { emit, getUser, takeHandoff } from '../../../core/store'
import { toast, toastDone } from '../../../core/ui'

const CUSTOM = '_custom'

type Data = {
  editId: string
  loading: boolean
  salutation: string
  types: { name: string; label: string }[]
  type: string
  customType: string
  title: string
  initialContent: string
  count: number
  images: PickedImage[]
  submitting: boolean
  leaveHint: string
}

function toItem(letter: Letter): LetterItem {
  const content = letter.content.trim().replace(/\s+/g, ' ')
  return {
    id: letter.id,
    isMine: true,
    title: letter.title,
    preview: content.length > 120 ? `${content.slice(0, 119)}…` : content,
    type: letter.type,
    thumbs: letter.images.slice(0, 3).map((m) => m.thumb),
    createdAtMs: letter.createdAtMs,
  }
}

Component<Data, {}, WechatMiniprogram.Component.MethodOption, { content: string }, true>({
  behaviors: [composeBehavior],
  data: {
    editId: '',
    loading: false,
    salutation: '',
    types: [...LETTER_PRESET_TYPES, { name: CUSTOM, label: '自定义' }],
    type: 'whisper',
    customType: '',
    title: '',
    initialContent: '',
    count: 0,
    images: [],
    submitting: false,
    leaveHint: '',
  },
  methods: {
    async onLoad(query: Record<string, string>) {
      this.content = ''
      const u = getUser()
      const name = u && u.partner ? u.partner.nickName : 'Ta'
      this.setData({ salutation: `致 ${name}：` })
      const id = query.id || ''
      if (id) {
        this.setData({ editId: id, loading: true })
        const cached = takeHandoff<Letter>(`letter-edit:${id}`)
        if (cached) {
          this.fill(cached)
          this.setData({ loading: false })
          return
        }
        const r = await call('letters.get', { id })
        this.setData({ loading: false })
        if (!r.ok) {
          toast(r.message)
          back(PAGE_LETTER_LIST)
          return
        }
        this.fill(r.data.letter)
      }
    },

    fill(letter: Letter) {
      const isPreset = LETTER_PRESET_TYPES.some((t) => t.name === letter.type)
      this.content = letter.content
      this.setData({
        title: letter.title,
        initialContent: letter.content,
        count: letter.content.length,
        type: isPreset ? letter.type : CUSTOM,
        customType: isPreset ? '' : letter.type,
        images: letter.images.map((m) => ({ fileId: m.id, src: m.thumb || m.url })),
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
      if (this.data.submitting || this.data.loading) return
      this.setData({ submitting: true })
      let fileIds: string[]
      try {
        fileIds = await uploadImages('letters', this.data.images)
      } catch {
        this.setData({ submitting: false })
        return toast('图片上传失败，请重试')
      }
      const { editId } = this.data
      const input = { title: this.data.title.trim(), content, type, images: fileIds }
      const r = editId ? await call('letters.update', { id: editId, ...input }) : await call('letters.create', input)
      this.setData({ submitting: false })
      if (!r.ok) return toast(r.message)
      emit('letter:upsert', toItem(r.data.letter))
      this.finish()
      toastDone(editId ? '已保存' : '信已寄出')
      back(PAGE_LETTER_LIST)
    },
  },
})
