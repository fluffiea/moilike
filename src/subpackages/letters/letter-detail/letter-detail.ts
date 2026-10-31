import type { Letter } from '../../../types/api'
import { call } from '../../../core/api'
import { dateTime, letterTypeLabel } from '../../../core/format'
import { PAGE_LETTER_COMPOSE, PAGE_LETTER_LIST, back } from '../../../core/paths'
import { emit } from '../../../core/store'
import { actionSheet, confirm, toast, toastDone } from '../../../core/ui'

type View = Letter & { meta: string; signature: string }

Component<
  { letter: View | null; status: 'loading' | 'ready' | 'error'; errorText: string; open: boolean },
  {},
  WechatMiniprogram.Component.MethodOption,
  { letterId: string },
  true
>({
  data: { letter: null, status: 'loading', errorText: '', open: false },
  methods: {
    onLoad(query: Record<string, string>) {
      this.letterId = query.id || ''
      void this.load()
    },

    async load() {
      const r = await call('letters.get', { id: this.letterId })
      if (!r.ok) return this.setData({ status: 'error', errorText: r.message })
      const l = r.data.letter
      this.setData({
        letter: { ...l, meta: `${letterTypeLabel(l.type)} · ${dateTime(l.createdAtMs)}`, signature: `—— ${l.fromName}` },
        status: 'ready',
      })
      // 下一帧再展开信纸，触发入场过渡
      setTimeout(() => this.setData({ open: true }), 30)
    },

    onReply() {
      const l = this.data.letter
      wx.navigateTo({ url: `${PAGE_LETTER_COMPOSE}?reply=1&type=${encodeURIComponent(l ? l.type : '')}` })
    },

    async onMore() {
      const l = this.data.letter
      if (!l || !l.isMine) return
      if ((await actionSheet(['删除这封信'])) !== 0) return
      const ok = await confirm({ title: '删除这封信？', content: '对方也将看不到这封信，且无法恢复。', confirmText: '删除', danger: true })
      if (!ok) return
      const r = await call('letters.remove', { id: l.id })
      if (!r.ok) return toast(r.message)
      emit('letter:remove', l.id)
      toastDone('已删除')
      back(PAGE_LETTER_LIST)
    },

    onRetry() {
      this.setData({ status: 'loading' })
      void this.load()
    },
  },
})
