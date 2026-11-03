import type { Expense, ExpenseMonthSummary, LedgerView } from '../../../types/api'
import { call } from '../../../core/api'
import { categoryById } from '../../../core/expense-categories'
import { Feed, emptyFeed, type FeedData } from '../../../core/feed'
import { barWidth, formatYuan, ledgerDay, monthTitle, shareText } from '../../../core/ledger'
import { PAGE_LEDGER, PAGE_LEDGER_DETAIL, back } from '../../../core/paths'
import { handoff, on } from '../../../core/store'
import { toast } from '../../../core/ui'

const STALE_MS = 60 * 1000

type Row = { id: string; title: string; note: string; amount: string; when: string; who: string }
type Bar = { name: string; amount: string; pct: string; bar: string }
type Breakdown = { totalText: string; empty: boolean; items: Bar[] }

function toRow(item: Expense): Row {
  return {
    id: item.id,
    title: item.l2Name,
    note: item.note,
    amount: formatYuan(item.amountFen),
    when: ledgerDay(item.occurredAtMs),
    who: item.mine ? '我' : '对方',
  }
}

function readView(raw: string): LedgerView {
  if (raw === 'partner' || raw === 'us') return raw
  return 'mine'
}

function toBreakdown(data: NonNullable<ExpenseMonthSummary['breakdown']>): Breakdown {
  const max = data.items.reduce((m, item) => Math.max(m, item.amountFen), 0)
  return {
    totalText: formatYuan(data.totalFen),
    empty: data.totalFen === 0,
    items: data.items.map((item) => ({
      name: item.name,
      amount: formatYuan(item.amountFen),
      pct: shareText(item.amountFen, data.totalFen),
      bar: barWidth(item.amountFen, max),
    })),
  }
}

type Data = {
  title: string
  monthText: string
  status: 'loading' | 'ready' | 'error'
  errorText: string
  refreshing: boolean
  showWho: boolean
  emptyTitle: string
  emptyHint: string
  breakdown: Breakdown | null
  feed: FeedData<Row>
}

type Custom = {
  feed: Feed<Expense, Row>
  offs: Array<() => void>
  month: string
  l1: string
  view: LedgerView
  pending: boolean
  loadedAt: number
  summarySeq: number
}

Component<Data, {}, WechatMiniprogram.Component.MethodOption, Custom, true>({
  data: {
    title: '分类',
    monthText: '',
    status: 'loading',
    errorText: '',
    refreshing: false,
    showWho: false,
    emptyTitle: '还没有这类支出',
    emptyHint: '记一笔就好',
    breakdown: null,
    feed: emptyFeed<Row>(),
  },
  methods: {
    onLoad(query: Record<string, string>) {
      this.month = query.month || ''
      this.l1 = query.l1 || ''
      this.view = readView(query.view || '')
      const cat = categoryById(this.l1)
      if (!cat || !/^\d{4}-\d{2}$/.test(this.month)) {
        toast('这个分类不存在')
        back(PAGE_LEDGER)
        return
      }
      this.pending = false
      this.loadedAt = Date.now()
      this.summarySeq = 0
      this.setData({
        title: cat.name,
        monthText: monthTitle(this.month),
        emptyTitle: this.view === 'partner' ? '对方还没有这类支出' : '还没有这类支出',
        emptyHint: this.view === 'mine' ? '记一笔就好' : '',
      })
      this.offs = [on('expense:changed', () => { this.pending = true })]
      this.open()
    },
    onUnload() {
      if (this.offs) this.offs.forEach((off) => off())
      if (this.feed) this.feed.dispose()
    },
    onShow() {
      if (!this.feed) return
      const failed = this.data.status === 'error' || this.data.feed.status === 'error'
      if (!this.pending && !failed && this.view === 'mine' && Date.now() - this.loadedAt < STALE_MS) return
      this.pending = false
      void this.reload()
    },

    open() {
      const month = this.month
      const l1 = this.l1
      this.loadedAt = Date.now()
      if (this.feed) this.feed.dispose()
      this.setData({ status: 'loading', breakdown: null, errorText: '', feed: emptyFeed<Row>() })
      this.feed = new Feed<Expense, Row>({
        host: this,
        path: 'feed',
        fetch: (cursor) => call('expense.list', { month, l1, cursor, view: this.view }),
        view: (item) => toRow(item),
      })
      this.feed.start()
      void this.loadSummary()
    },

    async loadSummary() {
      const seq = ++this.summarySeq
      const r = await call('expense.monthSummary', { month: this.month, l1: this.l1, view: this.view })
      if (seq !== this.summarySeq) return
      if (!r.ok || !r.data.breakdown) {
        const message = !r.ok
          ? r.message
          : r.data.scope === 'none'
            ? '对方暂未开放账单'
            : r.data.scope === 'summary'
              ? '对方仅开放汇总，不可查看明细'
              : '没有这个分类'
        if (this.data.breakdown) toast(message)
        else this.setData({ status: 'error', errorText: message })
        return
      }
      this.setData({
        status: 'ready',
        breakdown: toBreakdown(r.data.breakdown),
        errorText: '',
        showWho: this.view === 'us' && r.data.scope === 'detail',
      })
    },

    async reload() {
      this.loadedAt = Date.now()
      await Promise.all([this.loadSummary(), this.feed.refresh(false)])
    },

    async onRefresh() {
      this.setData({ refreshing: true })
      await this.reload()
      this.setData({ refreshing: false })
    },
    onLoadMore() {
      void this.feed.loadMore()
    },
    onRetry() {
      void this.reload()
    },
    onOpen(e: WechatMiniprogram.TouchEvent) {
      const id = String(e.currentTarget.dataset.id)
      const raw = this.feed.raw.find((item) => item.id === id)
      if (raw) handoff(`expense:${id}`, raw)
      wx.navigateTo({ url: `${PAGE_LEDGER_DETAIL}?id=${id}` })
    },
  },
})
