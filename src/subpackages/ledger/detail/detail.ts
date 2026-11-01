import type { Expense } from '../../../types/api'
import { call } from '../../../core/api'
import { formatYuan, ledgerDateTime } from '../../../core/ledger'
import { PAGE_LEDGER, PAGE_LEDGER_COMPOSE, back } from '../../../core/paths'
import { emit, handoff, on, takeHandoff } from '../../../core/store'
import { confirm, toast, toastDone } from '../../../core/ui'

type View = {
  id: string
  amount: string
  category: string
  when: string
  note: string
}

function toView(expense: Expense): View {
  return {
    id: expense.id,
    amount: formatYuan(expense.amountFen),
    category: `${expense.l1Name} · ${expense.l2Name}`,
    when: ledgerDateTime(expense.occurredAtMs),
    note: expense.note || '—',
  }
}

type Data = { status: 'loading' | 'ready' | 'error'; errorText: string; expense: View | null; busy: boolean }
type Custom = { id: string; raw: Expense | null; pending: boolean; off: () => void }

Component<Data, {}, WechatMiniprogram.Component.MethodOption, Custom, true>({
  data: { status: 'loading', errorText: '', expense: null, busy: false },
  methods: {
    onLoad(query: Record<string, string>) {
      this.id = query.id || ''
      this.raw = null
      this.pending = false
      this.off = on('expense:changed', () => { this.pending = true })
      const cached = takeHandoff<Expense>(`expense:${this.id}`)
      if (cached) {
        this.raw = cached
        this.setData({ status: 'ready', expense: toView(cached) })
        return
      }
      void this.load()
    },
    onUnload() {
      this.off()
    },
    onShow() {
      if (!this.pending || !this.id) return
      this.pending = false
      void this.load()
    },

    async load() {
      if (!this.data.expense) this.setData({ status: 'loading' })
      const r = await call('expense.get', { id: this.id })
      if (!r.ok) {
        if (this.data.expense) return toast(r.message)
        this.setData({ status: 'error', errorText: r.message })
        return
      }
      this.raw = r.data.expense
      this.setData({ status: 'ready', expense: toView(r.data.expense) })
    },

    onRetry() {
      void this.load()
    },

    onEdit() {
      if (!this.raw) return
      handoff(`expense-edit:${this.raw.id}`, this.raw)
      wx.navigateTo({ url: `${PAGE_LEDGER_COMPOSE}?id=${this.raw.id}` })
    },

    async onDelete() {
      if (this.data.busy || !this.raw) return
      const yes = await confirm({ title: '删除这笔支出？', content: '删除后无法恢复。', confirmText: '删除', danger: true })
      if (!yes) return
      this.setData({ busy: true })
      const r = await call('expense.remove', { id: this.raw.id })
      this.setData({ busy: false })
      if (!r.ok) return toast(r.message)
      emit('expense:changed', { id: this.raw.id })
      toastDone('已删除')
      back(PAGE_LEDGER)
    },
  },
})
