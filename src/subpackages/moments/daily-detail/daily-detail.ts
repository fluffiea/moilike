import type { DailyComment, DailyPost } from '../../../types/api'
import { call } from '../../../core/api'
import { dateTime } from '../../../core/format'
import { PAGE_DAILY_COMPOSE, TAB_MOMENTS, back } from '../../../core/paths'
import { emit, handoff, on, takeHandoff } from '../../../core/store'
import { confirm, editOrDelete, toast, toastDone } from '../../../core/ui'
import { dailyView, type DailyView } from '../../../core/views'

type CommentView = DailyComment & { time: string; replyHint: string; pending: boolean }

type Data = {
  post: DailyView | null
  comments: CommentView[]
  commentsLoaded: boolean
  status: 'loading' | 'ready' | 'error'
  errorText: string
  draft: string
  replyTo: { id: string; name: string } | null
  editingId: string
  sending: boolean
  placeholder: string
}

type Custom = { postId: string; raw: DailyPost | null; list: DailyComment[]; offs: (() => void)[] }

function commentViews(list: DailyComment[]): CommentView[] {
  const byId = new Map(list.map((c) => [c.id, c]))
  return list.map((c) => {
    const parent = c.parentId ? byId.get(c.parentId) : undefined
    return {
      ...c,
      time: dateTime(c.createdAtMs),
      replyHint: parent ? `回复 ${parent.authorName}` : '',
      pending: c.id.startsWith('tmp-'),
    }
  })
}

Component<Data, {}, WechatMiniprogram.Component.MethodOption, Custom, true>({
  data: {
    post: null,
    comments: [],
    commentsLoaded: false,
    status: 'loading',
    errorText: '',
    draft: '',
    replyTo: null,
    editingId: '',
    sending: false,
    placeholder: '说点什么…',
  },
  methods: {
    onLoad(query: Record<string, string>) {
      this.postId = query.id || ''
      this.list = []
      const cached = takeHandoff<DailyPost>(`daily:${this.postId}`)
      if (cached) this.renderPost(cached)
      this.offs = [on('daily:upsert', (p) => p.id === this.postId && this.renderPost(p))]
      void this.load()
    },
    onUnload() {
      this.offs.forEach((off) => off())
    },

    async load() {
      const r = await call('daily.get', { id: this.postId })
      if (!r.ok) {
        if (this.raw) return toast(r.message)
        return this.setData({ status: 'error', errorText: r.message })
      }
      this.renderPost(r.data.post)
      this.renderComments(r.data.comments)
    },

    renderPost(post: DailyPost) {
      this.raw = post
      this.setData({ post: dailyView(post, undefined, true), status: 'ready' })
    },

    renderComments(list: DailyComment[]) {
      this.list = list
      this.setData({ comments: commentViews(list), commentsLoaded: true })
    },

    /** 评论数变化时同步给浮生列表，返回列表不需要再请求 */
    syncSummary(summary: Pick<DailyPost, 'commentCount' | 'firstComment'>) {
      if (!this.raw) return
      this.raw = { ...this.raw, ...summary }
      emit('daily:summary', { id: this.postId, summary })
    },

    onReply(e: WechatMiniprogram.TouchEvent) {
      const c = this.list.find((x) => x.id === e.currentTarget.dataset.id)
      if (!c || c.id.startsWith('tmp-')) return
      // 只有一级回复：回复楼中楼时挂到它所在的一级评论下
      const rootId = c.parentId || c.id
      this.setData({ replyTo: { id: rootId, name: c.authorName }, editingId: '', placeholder: `回复 ${c.authorName}` })
    },

    async onCommentMore(e: WechatMiniprogram.TouchEvent) {
      const c = this.list.find((x) => x.id === e.currentTarget.dataset.id)
      if (!c || !c.isMine || c.id.startsWith('tmp-')) return
      if (this.list.some((x) => x.parentId === c.id)) return toast('已有回复的评论不能修改')
      const action = await editOrDelete()
      if (action === 'edit') {
        this.setData({ editingId: c.id, replyTo: null, draft: c.text, placeholder: '修改评论' })
      } else if (action === 'delete') {
        const ok = await confirm({ title: '删除这条评论？', content: '删除后无法恢复。', confirmText: '删除', danger: true })
        if (ok) void this.removeComment(c)
      }
    },

    async removeComment(c: DailyComment) {
      const before = this.list
      this.renderComments(before.filter((x) => x.id !== c.id))
      const r = await call('daily.removeComment', { postId: this.postId, commentId: c.id })
      if (!r.ok) {
        this.renderComments(before)
        return toast(r.message)
      }
      this.syncSummary(r.data.summary)
    },

    onCancelTarget() {
      this.setData({ replyTo: null, editingId: '', draft: '', placeholder: '说点什么…' })
    },

    onDraftInput(e: WechatMiniprogram.Input) {
      this.setData({ draft: e.detail.value })
    },

    async onSend() {
      const text = this.data.draft.trim()
      if (!text || this.data.sending) return
      const { editingId, replyTo } = this.data
      const before = this.list
      this.setData({ sending: true })

      if (editingId) {
        this.renderComments(before.map((c) => (c.id === editingId ? { ...c, text } : c)))
        const r = await call('daily.updateComment', { postId: this.postId, commentId: editingId, text })
        this.setData({ sending: false })
        if (!r.ok) {
          this.renderComments(before)
          return toast(r.message)
        }
        this.renderComments(this.list.map((c) => (c.id === editingId ? r.data.comment : c)))
        this.syncSummary(r.data.summary)
        this.onCancelTarget()
        return
      }

      const temp: DailyComment = {
        id: `tmp-${Date.now()}`,
        authorName: '我',
        isMine: true,
        text,
        parentId: replyTo ? replyTo.id : '',
        depth: replyTo ? 1 : 0,
        createdAtMs: Date.now(),
      }
      this.renderComments(before.concat(temp))
      this.onCancelTarget()
      const r = await call('daily.addComment', { postId: this.postId, text, parentId: temp.parentId || undefined })
      this.setData({ sending: false })
      if (!r.ok) {
        this.renderComments(before)
        this.setData({ draft: text })
        return toast(r.message)
      }
      this.renderComments(this.list.map((c) => (c.id === temp.id ? r.data.comment : c)))
      this.syncSummary(r.data.summary)
    },

    async onPostMore() {
      const post = this.raw
      if (!post || !post.isMine) return
      const action = await editOrDelete()
      if (action === 'edit') {
        handoff(`daily-edit:${post.id}`, post)
        wx.navigateTo({ url: `${PAGE_DAILY_COMPOSE}?id=${post.id}` })
      } else if (action === 'delete') {
        const ok = await confirm({ title: '删除这条日常？', content: '评论会一起删除，且无法恢复。', confirmText: '删除', danger: true })
        if (!ok) return
        const r = await call('daily.remove', { id: post.id })
        if (!r.ok) return toast(r.message)
        emit('daily:remove', post.id)
        toastDone('已删除')
        back(TAB_MOMENTS)
      }
    },

    onRetry() {
      this.setData({ status: 'loading' })
      void this.load()
    },
  },
})
