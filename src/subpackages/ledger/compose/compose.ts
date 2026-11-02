import type { Expense } from '../../../types/api'
import { call } from '../../../core/api'
import { EXPENSE_CATEGORIES, categoryById } from '../../../core/expense-categories'
import { composeBehavior } from '../../../core/compose'
import { beijingDateStr, beijingParts, beijingTimeStr, fenToYuanInput, parseBeijingDateTime, yuanToFen } from '../../../core/ledger'
import { PAGE_LEDGER, back } from '../../../core/paths'
import { emit, takeHandoff } from '../../../core/store'
import { toast, toastDone } from '../../../core/ui'
import { pad2 } from '../../../core/format'

type Chip = { id: string; name: string; on: boolean }

type Data = {
  editId: string
  loading: boolean
  amountInitial: string
  l1Options: Chip[]
  l2Options: Chip[]
  date: string
  time: string
  today: string
  noteInitial: string
  noteCount: number
  submitting: boolean
  leaveHint: string
}

type Custom = { amount: string; note: string; l1: string; l2: string }

Component<Data, {}, WechatMiniprogram.Component.MethodOption, Custom, true>({
  behaviors: [composeBehavior],
  data: {
    editId: '',
    loading: false,
    amountInitial: '',
    l1Options: [],
    l2Options: [],
    date: '',
    time: '',
    today: '',
    noteInitial: '',
    noteCount: 0,
    submitting: false,
    leaveHint: '',
  },
  methods: {
    async onLoad(query: Record<string, string>) {
      const now = Date.now()
      this.amount = ''
      this.note = ''
      this.l1 = 'food'
      this.l2 = 'takeout'
      this.setData({ date: beijingDateStr(now), time: beijingTimeStr(now), today: beijingDateStr(now) })
      this.renderChips()

      const id = query.id || ''
      if (!id) return
      this.setData({ editId: id, loading: true })
      const cached = takeHandoff<Expense>(`expense-edit:${id}`)
      if (cached) {
        this.fill(cached)
        this.setData({ loading: false })
        return
      }
      const r = await call('expense.get', { id })
      this.setData({ loading: false })
      if (!r.ok) {
        toast(r.message)
        back(PAGE_LEDGER)
        return
      }
      this.fill(r.data.expense)
    },

    fill(expense: Expense) {
      const p = beijingParts(expense.occurredAtMs)
      this.amount = fenToYuanInput(expense.amountFen)
      this.note = expense.note
      this.l1 = expense.l1
      this.l2 = expense.l2
      this.setData({
        amountInitial: this.amount,
        noteInitial: expense.note,
        noteCount: expense.note.length,
        date: `${p.y}-${pad2(p.m)}-${pad2(p.day)}`,
        time: `${pad2(p.hh)}:${pad2(p.mm)}`,
      })
      this.renderChips()
    },

    renderChips() {
      const cat = categoryById(this.l1)
      this.setData({
        l1Options: EXPENSE_CATEGORIES.map((item) => ({ id: item.id, name: item.name, on: item.id === this.l1 })),
        l2Options: (cat ? cat.children : []).map((item) => ({ id: item.id, name: item.name, on: item.id === this.l2 })),
      })
    },

    onAmount(e: WechatMiniprogram.Input) {
      this.amount = e.detail.value
      this.markDirty()
    },
    onNote(e: WechatMiniprogram.Input) {
      this.note = e.detail.value
      this.setData({ noteCount: this.note.length })
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
    onPickL1(e: WechatMiniprogram.TouchEvent) {
      const l1 = String(e.currentTarget.dataset.id)
      const cat = categoryById(l1)
      if (!cat) return
      this.l1 = l1
      if (!cat.children.some((item) => item.id === this.l2)) this.l2 = cat.children[0].id
      this.renderChips()
      this.markDirty()
    },
    onPickL2(e: WechatMiniprogram.TouchEvent) {
      const l2 = String(e.currentTarget.dataset.id)
      const cat = categoryById(this.l1)
      if (!cat || !cat.children.some((item) => item.id === l2)) return
      this.l2 = l2
      this.renderChips()
      this.markDirty()
    },

    async onSubmit() {
      if (this.data.submitting || this.data.loading) return
      const raw = this.amount.trim()
      if (!raw) return toast('请填写金额')
      const amountFen = yuanToFen(raw)
      if (amountFen == null) return toast('请填写正确金额')
      const picked = categoryById(this.l1)
      if (!picked || !picked.children.some((item) => item.id === this.l2)) return toast('请选择分类')
      const occurredAtMs = Math.floor(parseBeijingDateTime(this.data.date, this.data.time) / 60000) * 60000
      if (!Number.isFinite(occurredAtMs)) return toast('请选择时间')
      if (occurredAtMs > Date.now() + 60000) return toast('不能记录未来的时间')
      const note = this.note.trim()
      if (note.length > 50) return toast('备注最多 50 字')

      const { editId } = this.data
      const input = { amountFen, l1: this.l1, l2: this.l2, note, occurredAtMs }
      this.setData({ submitting: true })
      const r = editId ? await call('expense.update', { id: editId, ...input }) : await call('expense.create', input)
      this.setData({ submitting: false })
      if (!r.ok) return toast(r.message)
      emit('expense:changed', { id: r.data.expense.id, occurredAtMs: r.data.expense.occurredAtMs })
      this.finish()
      toastDone(editId ? '已保存' : '已记下')
      back(PAGE_LEDGER)
    },
  },
})
