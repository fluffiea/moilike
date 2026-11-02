import type { Expense, ExpenseMonthSummary } from '../../../types/api'
import { call } from '../../../core/api'
import { Feed, emptyFeed, type FeedData } from '../../../core/feed'
import { addMonths, barWidth, beijingMonthKey, formatYuan, ledgerDay, monthTitle, shareText } from '../../../core/ledger'
import { PAGE_LEDGER_CATEGORY, PAGE_LEDGER_COMPOSE, PAGE_LEDGER_DETAIL } from '../../../core/paths'
import { handoff, on } from '../../../core/store'
import { toast } from '../../../core/ui'

const STALE_MS = 60 * 1000

type Row = { id: string; title: string; meta: string; note: string; amount: string; when: string }
type CatRow = { l1: string; name: string; amount: string; pct: string; bar: string }
type SummaryView = {
  totalText: string
  open: boolean
  mom: string
  avgText: string
  count: number
  empty: boolean
  categories: CatRow[]
}

function toRow(item: Expense): Row {
  return {
    id: item.id,
    title: item.l2Name,
    meta: item.l1Name,
    note: item.note,
    amount: formatYuan(item.amountFen),
    when: ledgerDay(item.occurredAtMs),
  }
}

function toSummary(data: ExpenseMonthSummary): SummaryView {
  const maxCat = data.categories.reduce((m, x) => Math.max(m, x.amountFen), 0)
  return {
    totalText: formatYuan(data.totalFen),
    open: data.open,
    mom: data.mom,
    avgText: data.avgFen == null ? '—' : formatYuan(data.avgFen),
    count: data.count,
    empty: data.totalFen === 0,
    categories: data.categories.map((item) => ({
      l1: item.l1,
      name: item.name,
      amount: formatYuan(item.amountFen),
      pct: shareText(item.amountFen, data.totalFen),
      bar: barWidth(item.amountFen, maxCat),
    })),
  }
}

type Data = {
  monthText: string
  canPrev: boolean
  canNext: boolean
  refreshing: boolean
  summaryStatus: 'loading' | 'ready' | 'error'
  summaryError: string
  summary: SummaryView | null
  feed: FeedData<Row>
  scrollTop: number
}

type Custom = {
  feed: Feed<Expense, Row>
  offs: Array<() => void>
  month: string
  pending: boolean
  pendingMonth: string
  loadedAt: number
  summarySeq: number
}

Component<Data, {}, WechatMiniprogram.Component.MethodOption, Custom, true>({
  data: {
    monthText: '',
    canPrev: true,
    canNext: false,
    refreshing: false,
    summaryStatus: 'loading',
    summaryError: '',
    summary: null,
    feed: emptyFeed<Row>(),
    scrollTop: 0,
  },
  methods: {
    onLoad() {
      this.month = beijingMonthKey()
      this.pending = false
      this.pendingMonth = ''
      this.loadedAt = Date.now()
      this.summarySeq = 0
      this.offs = [
        on('expense:changed', (payload) => {
          this.pending = true
          this.pendingMonth = beijingMonthKey(payload.occurredAtMs)
        }),
      ]
      this.openMonth()
    },
    onUnload() {
      this.offs.forEach((off) => off())
      if (this.feed) this.feed.dispose()
    },
    onShow() {
      if (!this.feed) return
      const nowKey = beijingMonthKey()
      if (this.pending && this.pendingMonth && this.pendingMonth !== this.month && this.pendingMonth <= nowKey) {
        this.month = this.pendingMonth
        this.pending = false
        this.pendingMonth = ''
        this.openMonth()
        return
      }
      const failed = this.data.summaryStatus === 'error' || this.data.feed.status === 'error'
      if (!this.pending && !failed && Date.now() - this.loadedAt < STALE_MS) return
      this.pending = false
      void this.reload()
    },

    openMonth() {
      const month = this.month
      this.loadedAt = Date.now()
      if (this.feed) this.feed.dispose()
      this.setData({
        monthText: monthTitle(month),
        canPrev: month > '2000-01',
        canNext: month < beijingMonthKey(),
        summaryStatus: 'loading',
        summary: null,
        summaryError: '',
        feed: emptyFeed<Row>(),
        scrollTop: this.data.scrollTop === 0 ? 1 : 0,
      })
      this.feed = new Feed<Expense, Row>({
        host: this,
        path: 'feed',
        fetch: (cursor) => call('expense.list', { month, cursor }),
        view: (item) => toRow(item),
      })
      this.feed.start()
      void this.loadSummary()
    },

    async loadSummary() {
      const month = this.month
      const seq = ++this.summarySeq
      const r = await call('expense.monthSummary', { month })
      if (seq !== this.summarySeq || month !== this.month) return
      if (!r.ok) {
        if (this.data.summary) toast(r.message)
        else this.setData({ summaryStatus: 'error', summaryError: r.message })
        return
      }
      this.setData({ summaryStatus: 'ready', summary: toSummary(r.data), summaryError: '' })
    },

    async reload() {
      this.loadedAt = Date.now()
      await Promise.all([this.loadSummary(), this.feed.refresh(false)])
    },

    onPrev() {
      if (!this.data.canPrev) return
      this.month = addMonths(this.month, -1)
      this.openMonth()
    },
    onNext() {
      if (!this.data.canNext) return
      this.month = addMonths(this.month, 1)
      this.openMonth()
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
      if (this.data.summaryStatus === 'error' || this.data.feed.status === 'error') {
        if (!this.data.summary) this.setData({ summaryStatus: 'loading', feed: emptyFeed<Row>() })
        void this.reload()
      }
    },

    onCompose() {
      wx.navigateTo({ url: PAGE_LEDGER_COMPOSE })
    },
    onOpen(e: WechatMiniprogram.TouchEvent) {
      const id = String(e.currentTarget.dataset.id)
      const raw = this.feed.raw.find((item) => item.id === id)
      if (raw) handoff(`expense:${id}`, raw)
      wx.navigateTo({ url: `${PAGE_LEDGER_DETAIL}?id=${id}` })
    },
    onCategory(e: WechatMiniprogram.TouchEvent) {
      const l1 = String(e.currentTarget.dataset.l1)
      wx.navigateTo({ url: `${PAGE_LEDGER_CATEGORY}?month=${this.month}&l1=${l1}` })
    },
  },
})
