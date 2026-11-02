import type { Letter } from '../../../types/api'
import { call } from '../../../core/api'
import { dateTime, letterTypeLabel } from '../../../core/format'
import { PAGE_LETTER_COMPOSE, PAGE_LETTER_LIST, back } from '../../../core/paths'
import { emit, getUser, handoff, on } from '../../../core/store'
import { confirm, editOrDelete, toast, toastDone } from '../../../core/ui'

type View = Letter & { who: string; salutation: string; meta: string; signature: string }

Component<
  { letter: View | null; status: 'loading' | 'ready' | 'error'; errorText: string },
  {},
  WechatMiniprogram.Component.MethodOption,
  { letterId: string; pending: boolean; off: () => void },
  true
>({
  data: { letter: null, status: 'loading', errorText: '' },
  methods: {
    onLoad(query: Record<string, string>) {
      this.letterId = query.id || ''
      this.pending = false
      this.off = on('letter:upsert', (item) => {
        if (item.id === this.letterId) this.pending = true
      })
      void this.load()
    },
    onShow() {
      if (!this.pending || !this.letterId) return
      this.pending = false
      void this.load()
    },
    onUnload() {
      if (this.off) this.off()
    },

    async load() {
      const r = await call('letters.get', { id: this.letterId })
      if (!r.ok) return this.setData({ status: 'error', errorText: r.message })
      const l = r.data.letter
      const u = getUser()
      const me = u && u.nickName ? u.nickName : '我'
      const partner = u && u.partner && u.partner.nickName ? u.partner.nickName : 'Ta'
      this.setData({
        letter: {
          ...l,
          who: l.isMine ? '我' : 'Ta',
          salutation: l.isMine ? `致 ${partner}：` : `致 ${me}：`,
          meta: `${letterTypeLabel(l.type)} · ${dateTime(l.createdAtMs)}`,
          signature: `—— ${l.fromName}`,
        },
        status: 'ready',
      })
    },

    async onMore() {
      const l = this.data.letter
      if (!l || !l.isMine) return
      const action = await editOrDelete()
      if (action === 'edit') {
        handoff(`letter-edit:${l.id}`, l)
        wx.navigateTo({ url: `${PAGE_LETTER_COMPOSE}?id=${l.id}` })
        return
      }
      if (action !== 'delete') return
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
