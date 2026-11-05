import type { ReportPost } from '../../../types/api'
import { call } from '../../../core/api'
import { applyResonanceBadge } from '../../../core/badge'
import { PAGE_REPORT_COMPOSE, TAB_RESONANCE, back } from '../../../core/paths'
import { emit, handoff, on, takeHandoff } from '../../../core/store'
import { RESPOND_AGAIN_TITLE, RESPOND_HINT, RESPOND_TITLE, stickerChoices } from '../../../core/stickers'
import { confirm, editOrDelete, toast, toastDone } from '../../../core/ui'
import { reportView, type ReportView } from '../../../core/views'

type Data = {
  post: ReportView | null
  status: 'loading' | 'ready' | 'error'
  errorText: string
  stickers: { id: string; label: string; src: string }[]
  respondTitle: string
  respondHint: string
  /** 已回声时的一行「现在是「抱抱」· 2小时前」；没回声或时间缺失时为空串，模板不渲染 */
  currentLine: string
  busy: string
}

Component<Data, {}, WechatMiniprogram.Component.MethodOption, { postId: string; raw: ReportPost | null; offs: (() => void)[] }, true>({
  data: {
    post: null,
    status: 'loading',
    errorText: '',
    stickers: stickerChoices(),
    respondTitle: RESPOND_TITLE,
    respondHint: RESPOND_HINT,
    currentLine: '',
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

    /**
     * 详情信息卡给全文、全部图片和日期时刻；对方发的报备再用一张贴纸卡回声。
     * 已经贴过贴纸时标题是「换一个回声」，标题下补一行当前贴纸和相对时间；两个值都拿到才显示。
     */
    render(post: ReportPost) {
      this.raw = post
      const view = reportView(post, undefined, 'detail')
      const { sticker, label, when } = view.echo
      this.setData({
        post: view,
        status: 'ready',
        respondTitle: post.partnerStickerId ? RESPOND_AGAIN_TITLE : RESPOND_TITLE,
        currentLine: sticker && label && when ? `现在是「${label}」· ${when}` : '',
      })
    },

    /** 状态变化同步到共鸣列表（等我回声会据此移出） */
    apply(post: ReportPost) {
      this.render(post)
      emit('report:upsert', post)
    },

    async onSticker(e: WechatMiniprogram.CustomEvent<{ id: string }>) {
      const stickerId = e.detail.id || ''
      if (!stickerId || this.data.busy) return
      if (this.raw && this.raw.partnerStickerId === stickerId) return
      this.setData({ busy: stickerId })
      const r = await call('report.respond', { id: this.postId, stickerId })
      this.setData({ busy: '' })
      if (!r.ok) return toast(r.message)
      applyResonanceBadge(r.data.awaitMeCount)
      emit('report:await-count', r.data.awaitMeCount)
      this.apply(r.data.post)
      toastDone('已回声')
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
