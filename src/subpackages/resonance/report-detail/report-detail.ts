import type { ReportPost } from '../../../types/api'
import { call } from '../../../core/api'
import { PAGE_REPORT_COMPOSE, TAB_RESONANCE, back } from '../../../core/paths'
import { emit, handoff, on, takeHandoff } from '../../../core/store'
import { confirm, editOrDelete, toast, toastDone } from '../../../core/ui'
import { reportView, type ReportView } from '../../../core/views'

type Data = {
  post: ReportView | null
  status: 'loading' | 'ready' | 'error'
  errorText: string
  evalOpen: boolean
  evalDraft: string
  busy: '' | 'read' | 'eval'
}

Component<Data, {}, WechatMiniprogram.Component.MethodOption, { postId: string; raw: ReportPost | null; offs: (() => void)[] }, true>({
  data: {
    post: null,
    status: 'loading',
    errorText: '',
    evalOpen: false,
    evalDraft: '',
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
    },

    render(post: ReportPost) {
      this.raw = post
      this.setData({ post: reportView(post, undefined, true), status: 'ready', evalOpen: post.canEvaluate })
    },

    /** 状态变化同步到共鸣列表（待处理 Tab 会据此移除） */
    apply(post: ReportPost) {
      this.render(post)
      emit('report:upsert', post)
    },

    async onMarkRead() {
      if (this.data.busy) return
      this.setData({ busy: 'read' })
      const r = await call('report.markRead', { id: this.postId })
      this.setData({ busy: '' })
      if (!r.ok) return toast(r.message)
      this.apply(r.data.post)
      toastDone('已阅')
    },

    onEditEval() {
      const post = this.raw
      if (post) this.setData({ evalOpen: true, evalDraft: post.evalText })
    },
    onCancelEval() {
      this.setData({ evalOpen: false, evalDraft: '' })
    },
    onEvalInput(e: WechatMiniprogram.Input) {
      this.setData({ evalDraft: e.detail.value })
    },

    async onSubmitEval() {
      const text = this.data.evalDraft.trim()
      if (!text) return toast('写一句评价吧')
      if (this.data.busy) return
      this.setData({ busy: 'eval' })
      const r = await call('report.evaluate', { id: this.postId, text })
      this.setData({ busy: '' })
      if (!r.ok) return toast(r.message)
      this.setData({ evalDraft: '' })
      this.apply(r.data.post)
      toastDone('评价已送达')
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
