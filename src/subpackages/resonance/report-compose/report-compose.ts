import type { ReportPost } from '../../../types/api'
import { call } from '../../../core/api'
import { composeBehavior } from '../../../core/compose'
import { dateStr, parseDateTime, timeStr } from '../../../core/format'
import { uploadImages, type PickedImage } from '../../../core/media'
import { TAB_RESONANCE, back } from '../../../core/paths'
import { emit, takeHandoff } from '../../../core/store'
import { confirm, toast, toastDone } from '../../../core/ui'

const DEFAULT_TAG = '干饭'

type Data = {
  editId: string
  initialBody: string
  count: number
  loading: boolean
  date: string
  time: string
  today: string
  tags: { name: string; on: boolean }[]
  tagDraft: string
  images: PickedImage[]
  submitting: boolean
  leaveHint: string
}

type Custom = { body: string; options: string[]; selected: string[] }

Component<Data, {}, WechatMiniprogram.Component.MethodOption, Custom, true>({
  behaviors: [composeBehavior],
  data: {
    editId: '',
    initialBody: '',
    count: 0,
    loading: false,
    date: '',
    time: '',
    today: '',
    tags: [],
    tagDraft: '',
    images: [],
    submitting: false,
    leaveHint: '',
  },
  methods: {
    async onLoad(query: Record<string, string>) {
      const now = Date.now()
      this.body = ''
      this.options = [DEFAULT_TAG]
      this.selected = [DEFAULT_TAG]
      this.setData({ date: dateStr(now), time: timeStr(now), today: dateStr(now) })
      this.renderTags()
      void this.loadTags()

      const id = query.id || ''
      if (!id) return
      this.setData({ editId: id })
      const cached = takeHandoff<ReportPost>(`report-edit:${id}`)
      if (cached) return this.fill(cached)
      this.setData({ loading: true })
      const r = await call('report.get', { id })
      this.setData({ loading: false })
      if (!r.ok) return toast(r.message)
      this.fill(r.data.post)
    },

    fill(post: ReportPost) {
      this.body = post.body
      this.selected = post.tags.slice()
      this.options = Array.from(new Set(this.options.concat(post.tags)))
      this.setData({
        initialBody: post.body,
        count: post.body.length,
        date: dateStr(post.recordAtMs),
        time: timeStr(post.recordAtMs),
        images: post.images.map((m) => ({ fileId: m.id, src: m.thumb || m.url })),
      })
      this.renderTags()
    },

    async loadTags() {
      const r = await call('report.tags', {})
      if (!r.ok) return
      this.options = Array.from(new Set(r.data.tags.concat(this.selected)))
      this.renderTags()
    },

    renderTags() {
      this.setData({ tags: this.options.map((name) => ({ name, on: this.selected.includes(name) })) })
    },

    onInput(e: WechatMiniprogram.Input) {
      this.body = e.detail.value
      this.setData({ count: this.body.length })
      this.markDirty()
    },
    onDate(e: WechatMiniprogram.PickerChange) {
      this.setData({ date: String(e.detail.value) })
      this.markDirty()
    },
    onTime(e: WechatMiniprogram.PickerChange) {
      this.setData({ time: String(e.detail.value) })
      this.markDirty()
    },

    onToggleTag(e: WechatMiniprogram.TouchEvent) {
      const name = String(e.currentTarget.dataset.name)
      this.selected = this.selected.includes(name) ? this.selected.filter((t) => t !== name) : this.selected.concat(name)
      this.renderTags()
      this.markDirty()
    },

    onTagDraft(e: WechatMiniprogram.Input) {
      this.setData({ tagDraft: e.detail.value })
    },

    async onAddTag() {
      const tag = this.data.tagDraft.trim()
      if (!tag) return
      const r = await call('report.addTag', { tag })
      if (!r.ok) return toast(r.message)
      this.options = r.data.tags
      if (!this.selected.includes(tag)) this.selected = this.selected.concat(tag)
      this.setData({ tagDraft: '' })
      this.renderTags()
      this.markDirty()
    },

    async onRemoveTag(e: WechatMiniprogram.TouchEvent) {
      const name = String(e.currentTarget.dataset.name)
      if (name === DEFAULT_TAG) return toast('默认标签不能删除')
      const ok = await confirm({ title: `删除标签「${name}」？`, content: '已发布的报备不受影响。', confirmText: '删除', danger: true })
      if (!ok) return
      const r = await call('report.removeTag', { tag: name })
      if (!r.ok) return toast(r.message)
      this.options = r.data.tags
      this.selected = this.selected.filter((t) => t !== name)
      this.renderTags()
    },

    async onSubmit() {
      const body = this.body.trim()
      const { images, editId, date, time } = this.data
      if (!body && images.length === 0 && this.selected.length === 0) return toast('写点内容、选个标签或配张图吧')
      const recordAtMs = parseDateTime(date, time)
      if (!Number.isFinite(recordAtMs)) return toast('请选择记录时间')
      if (this.data.submitting) return
      this.setData({ submitting: true })
      let fileIds: string[]
      try {
        fileIds = await uploadImages('reports', images)
      } catch {
        this.setData({ submitting: false })
        return toast('图片上传失败，请重试')
      }
      const input = { body, images: fileIds, tags: this.selected, recordAtMs }
      const r = editId ? await call('report.update', { id: editId, ...input }) : await call('report.create', input)
      this.setData({ submitting: false })
      if (!r.ok) return toast(r.message)
      emit('report:upsert', r.data.post)
      this.finish()
      toastDone(editId ? '已保存' : '已发布')
      back(TAB_RESONANCE)
    },
  },
})
