import type { Expense, ExpenseMonthSummary, LedgerScope, LedgerView } from '../../../types/api'
import { call } from '../../../core/api'
import { Feed, emptyFeed, type FeedData } from '../../../core/feed'
import { addMonths, barWidth, beijingMonthKey, formatYuan, ledgerDay, monthTitle, shareText } from '../../../core/ledger'
import { PAGE_LEDGER_CATEGORY, PAGE_LEDGER_COMPOSE, PAGE_LEDGER_DETAIL } from '../../../core/paths'
import { getUser, handoff, on } from '../../../core/store'
import { toast } from '../../../core/ui'

const STALE_MS = 60 * 1000

const LENSES: { value: LedgerView; label: string }[] = [
  { value: 'mine', label: '我的' },
  { value: 'partner', label: '对方' },
  { value: 'us', label: '我们' },
]

const HERO: Record<LedgerView, string> = {
  mine: '支出',
  partner: '对方本月合计',
  us: '我们本月合计',
}

type Row = { id: string; title: string; meta: string; note: string; amount: string; when: string; who: string }
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
    who: item.mine ? '我' : '对方',
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

function canOpenCategory(lens: LedgerView, scope: LedgerScope): boolean {
  if (lens === 'mine') return true
  if (lens === 'partner') return scope === 'detail'
  return scope !== 'summary'
}

function emptyCopy(lens: LedgerView, scope: LedgerScope | ''): { title: string; hint: string } {
  if (lens === 'partner') return { title: '对方本月还没有记账', hint: '' }
  if (lens === 'us' && scope === 'summary') return { title: '这个月还没有我的支出', hint: '' }
  if (lens === 'us') return { title: '这个月还没有支出', hint: '' }
  return { title: '这个月还没有支出', hint: '记一笔就好' }
}

type Data = {
  bound: boolean
  lenses: typeof LENSES
  lens: LedgerView
  heroLabel: string
  showMonth: boolean
  showList: boolean
  showWho: boolean
  canDrill: boolean
  summaryNote: string
  excludeNote: boolean
  emptyTitle: string
  emptyHint: string
  scope: LedgerScope | ''
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
  lens: LedgerView
  pending: boolean
  pendingMonth: string
  loadedAt: number
  summarySeq: number
}

Component<Data, {}, WechatMiniprogram.Component.MethodOption, Custom, true>({
  data: {
    bound: false,
    lenses: LENSES,
    lens: 'mine',
    heroLabel: HERO.mine,
    showMonth: true,
    showList: true,
    showWho: false,
    canDrill: true,
    summaryNote: '',
    excludeNote: false,
    emptyTitle: '这个月还没有支出',
    emptyHint: '记一笔就好',
    scope: '',
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
      this.lens = 'mine'
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
      this.setData({ bound: this.isBound() })
      this.openMonth()
    },
    onUnload() {
      this.offs.forEach((off) => off())
      if (this.feed) this.feed.dispose()
    },
    onShow() {
      const dropped = this.syncBound()
      if (!this.feed) return
      if (dropped) {
        this.openMonth()
        return
      }
      const nowKey = beijingMonthKey()
      const followMine = this.lens !== 'partner'
      if (this.pending && followMine && this.pendingMonth && this.pendingMonth !== this.month && this.pendingMonth <= nowKey) {
        this.month = this.pendingMonth
        this.pending = false
        this.pendingMonth = ''
        this.openMonth()
        return
      }
      const failed = this.data.summaryStatus === 'error' || this.data.feed.status === 'error'
      const followScope = this.lens !== 'mine'
      if (!this.pending && !failed && !followScope && Date.now() - this.loadedAt < STALE_MS) return
      this.pending = false
      void this.reload()
    },

    isBound(): boolean {
      const u = getUser()
      return Boolean(u && u.partner)
    },

    /** 解绑后回到「我的」。返回 true 表示视图被收了回来，需要重开月份 */
    syncBound(): boolean {
      const bound = this.isBound()
      const lens: LedgerView = bound ? this.lens : 'mine'
      const changed = bound !== this.data.bound || lens !== this.lens
      this.lens = lens
      if (changed) this.setData({ bound, lens })
      return changed && !bound
    },

    openMonth() {
      const month = this.month
      const lens = this.lens
      const copy = emptyCopy(lens, '')
      this.loadedAt = Date.now()
      if (this.feed) this.feed.dispose()
      this.setData({
        lens,
        heroLabel: HERO[lens],
        showMonth: true,
        showList: lens !== 'partner',
        showWho: false,
        canDrill: lens === 'mine',
        summaryNote: '',
        excludeNote: false,
        emptyTitle: copy.title,
        emptyHint: copy.hint,
        scope: '',
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
        fetch: (cursor) => call('expense.list', { month, cursor, view: lens }),
        view: (item) => toRow(item),
      })
      this.feed.start()
      void this.loadSummary()
    },

    async loadSummary() {
      const month = this.month
      const lens = this.lens
      const seq = ++this.summarySeq
      const r = await call('expense.monthSummary', { month, view: lens })
      if (seq !== this.summarySeq || month !== this.month || lens !== this.lens) return
      if (!r.ok) {
        if (this.data.summary) toast(r.message)
        else this.setData({ summaryStatus: 'error', summaryError: r.message })
        return
      }
      const scope = r.data.scope
      const copy = emptyCopy(lens, scope)
      this.setData({
        summaryStatus: 'ready',
        summary: toSummary(r.data),
        summaryError: '',
        scope,
        showMonth: !(lens === 'partner' && scope === 'none'),
        showList: lens !== 'partner' || scope === 'detail',
        showWho: lens === 'us' && scope === 'detail',
        canDrill: canOpenCategory(lens, scope),
        summaryNote: lens === 'partner' && scope === 'summary' ? '对方仅开放汇总，不可查看明细' : '',
        excludeNote: lens === 'us' && !r.data.includesPartner,
        emptyTitle: copy.title,
        emptyHint: copy.hint,
      })
    },

    async reload() {
      this.loadedAt = Date.now()
      await Promise.all([this.loadSummary(), this.feed.refresh(false)])
    },

    onLens(e: WechatMiniprogram.TouchEvent) {
      const lens = String(e.currentTarget.dataset.lens) as LedgerView
      if (lens !== 'mine' && lens !== 'partner' && lens !== 'us') return
      if (!this.data.bound || lens === this.lens) return
      this.lens = lens
      this.openMonth()
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
      if (!this.data.canDrill) return
      const l1 = String(e.currentTarget.dataset.l1)
      const view = this.lens === 'mine' ? '' : `&view=${this.lens}`
      wx.navigateTo({ url: `${PAGE_LEDGER_CATEGORY}?month=${this.month}&l1=${l1}${view}` })
    },
  },
})
