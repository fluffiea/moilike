import type { ReportPost } from '../../../types/api'
import { call } from '../../../core/api'
import { applyResonanceBadge } from '../../../core/badge'
import { PAGE_REPORT_COMPOSE, TAB_RESONANCE, back } from '../../../core/paths'
import { emit, handoff, on, takeHandoff } from '../../../core/store'
import { STICKERS } from '../../../core/stickers'
import { confirm, editOrDelete, toast, toastDone } from '../../../core/ui'
import { reportView, type ReportView } from '../../../core/views'

type Data = {
  post: ReportView | null
  status: 'loading' | 'ready' | 'error'
  errorText: string
  stickers: { id: string; label: string; src: string }[]
  busy: string
}

Component<Data, {}, WechatMiniprogram.Component.MethodOption, { postId: string; raw: ReportPost | null; offs: (() => void)[] }, true>({
  data: {
    post: null,
    status: 'loading',
    errorText: '',
    stickers: STICKERS.map((s) => ({ id: s.id, label: s.label, src: s.src })),
    busy: '',
  },
  methods: {
    onLoad(query: Record<string, string>) {
      this.postId = query.id || ''
      this.raw = null
      const cached = takeHandoff<ReportPost>(`report:${this.postId}`)
      if (cached) this.render(cached)
      this.offs = [on('report:upsert', (p) => p.id === this.postId && this.render(p))]
      void this.load()
    },
    onUnload() {
      this.offs.forEach((off) => off())
    },

    async load() {
      const r = await call('report.get', { id: this.postId })
      if (!r.ok) {
        if (this.raw) return toast(r.message)
        return this.setData({ status: 'error', errorText: r.message })
      }
      this.render(r.data.post)
      void this.markOpened(r.data.post)
    },

    /** 对方进详情即记下打开时间，不打断浏览，也不单独清待办 */
    async markOpened(post: ReportPost) {
      if (post.isMine || post.partnerOpenedAt) return
      const r = await call('report.open', { id: post.id })
      if (!r.ok || !this.raw || this.raw.partnerStickerId) return
      this.apply(r.data.post)
    },

    render(post: ReportPost) {
      this.raw = post
      this.setData({ post: reportView(post, undefined, true), status: 'ready' })
    },

    /** 状态变化同步到共鸣列表（待我回应会据此移出） */
    apply(post: ReportPost) {
      this.render(post)
      emit('report:upsert', post)
    },

    async onSticker(e: WechatMiniprogram.TouchEvent) {
      const stickerId = String(e.currentTarget.dataset.id || '')
      if (!stickerId || this.data.busy) return
      if (this.raw && this.raw.partnerStickerId === stickerId) return
      this.setData({ busy: stickerId })
      const r = await call('report.respond', { id: this.postId, stickerId })
      this.setData({ busy: '' })
      if (!r.ok) return toast(r.message)
      applyResonanceBadge(r.data.awaitMeCount)
      emit('report:await-count', r.data.awaitMeCount)
      this.apply(r.data.post)
      toastDone('已回心')
    },

    async onMore() {
      const post = this.raw
      if (!post || !post.isMine) return
      const action = await editOrDelete()
      if (action === 'edit') {
        handoff(`report-edit:${post.id}`, post)
        wx.navigateTo({ url: `${PAGE_REPORT_COMPOSE}?id=${post.id}` })
      } else if (action === 'delete') {
        const ok = await confirm({ title: '删除这条报备？', content: '删除后无法恢复。', confirmText: '删除', danger: true })
        if (!ok) return
        const r = await call('report.remove', { id: post.id })
        if (!r.ok) return toast(r.message)
        emit('report:remove', post.id)
        toastDone('已删除')
        back(TAB_RESONANCE)
      }
    },

    onRetry() {
      this.setData({ status: 'loading' })
      void this.load()
    },
  },
})
