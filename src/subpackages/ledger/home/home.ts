import type { Expense, ExpenseMonthSummary, LedgerScope, LedgerView } from '../../../types/api'
import { call } from '../../../core/api'
import { Feed, emptyFeed, type FeedData } from '../../../core/feed'
import { addMonths, barWidth, beijingMonthKey, formatYuan, ledgerDay, monthTitle, shareText } from '../../../core/ledger'
import { LEDGER_HIDDEN, LEDGER_VIEWS, ledgerChrome, ledgerHeroLabel } from '../../../core/ledger-visibility'
import { PAGE_LEDGER_CATEGORY, PAGE_LEDGER_COMPOSE, PAGE_LEDGER_DETAIL } from '../../../core/paths'
import { getUser, handoff, on } from '../../../core/store'
import { toast } from '../../../core/ui'

const STALE_MS = 60 * 1000

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

type Pane = {
  heroLabel: string
  summaryStatus: 'loading' | 'ready' | 'error'
  summaryError: string
  summary: SummaryView | null
  feed: FeedData<Row>
  scope: LedgerScope | ''
  hidden: boolean
  showMonth: boolean
  showList: boolean
  showWho: boolean
  canDrill: boolean
  summaryNote: string
  excludeNote: boolean
  emptyTitle: string
  emptyHint: string
  hiddenTitle: string
  hiddenHint: string
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

function emptyPane(view: LedgerView): Pane {
  return {
    heroLabel: ledgerHeroLabel(view),
    summaryStatus: 'loading',
    summaryError: '',
    summary: null,
    feed: emptyFeed(),
    scope: '',
    hidden: false,
    showMonth: true,
    showList: view !== 'partner',
    showWho: false,
    canDrill: view === 'mine',
    summaryNote: '',
    excludeNote: false,
    emptyTitle: view === 'partner' ? '对方本月还没有记账' : '这个月还没有支出',
    emptyHint: view === 'mine' ? '记一笔就好' : '',
    hiddenTitle: LEDGER_HIDDEN.title,
    hiddenHint: LEDGER_HIDDEN.hint,
  }
}

function freshPanes(): Pane[] {
  return LEDGER_VIEWS.map((item) => emptyPane(item.value))
}

type Data = {
  bound: boolean
  lenses: typeof LEDGER_VIEWS
  lensIndex: number
  panes: Pane[]
  monthText: string
  canPrev: boolean
  canNext: boolean
  refreshing: boolean
  scrollTop: number
}

type Custom = {
  feeds: Array<Feed<Expense, Row> | null>
  offs: Array<() => void>
  month: string
  pending: boolean
  pendingMonth: string
  summaryAt: number[]
  seq: number[]
  inflight: boolean[]
}

Component<Data, {}, WechatMiniprogram.Component.MethodOption, Custom, true>({
  data: {
    bound: false,
    lenses: LEDGER_VIEWS,
    lensIndex: 0,
    panes: freshPanes(),
    monthText: '',
    canPrev: true,
    canNext: false,
    refreshing: false,
    scrollTop: 0,
  },
  methods: {
    onLoad() {
      this.month = beijingMonthKey()
      this.pending = false
      this.pendingMonth = ''
      this.summaryAt = [0, 0, 0]
      this.seq = [0, 0, 0]
      this.inflight = [false, false, false]
      this.feeds = [null, null, null]
      this.offs = [
        on('expense:changed', (payload) => {
          this.pending = true
          this.pendingMonth = beijingMonthKey(payload.occurredAtMs)
        }),
      ]
      this.setData({
        bound: this.isBound(),
        monthText: monthTitle(this.month),
        canPrev: this.month > '2000-01',
        canNext: this.month < beijingMonthKey(),
      })
      this.activate(0)
    },
    onUnload() {
      this.offs.forEach((off) => off())
      this.feeds.forEach((feed) => feed && feed.dispose())
    },
    onShow() {
      const index = this.syncBound()
      const nowKey = beijingMonthKey()
      if (this.pending && index !== 1 && this.pendingMonth && this.pendingMonth !== this.month && this.pendingMonth <= nowKey) {
        const target = this.pendingMonth
        this.pending = false
        this.pendingMonth = ''
        this.setMonth(target)
        return
      }
      if (this.pending) {
        this.pending = false
        this.dropPane(0)
        this.dropPane(2)
      }
      this.activate(index)
    },

    isBound(): boolean {
      const u = getUser()
      return Boolean(u && u.partner)
    },

    /** 解绑后只留「我的」。返回当前应显示的分段下标 */
    syncBound(): number {
      const bound = this.isBound()
      const index = bound ? this.data.lensIndex : 0
      if (bound !== this.data.bound || index !== this.data.lensIndex) {
        this.setData({ bound, lensIndex: index })
      }
      return index
    },

    /** 我改过的账会影响「我的」和「我们」，下次进入再拉 */
    dropPane(i: number) {
      this.summaryAt[i] = 0
      const feed = this.feeds[i]
      if (feed) feed.dispose()
      this.feeds[i] = null
    },

    setMonth(month: string) {
      this.month = month
      this.feeds.forEach((feed) => feed && feed.dispose())
      this.feeds = [null, null, null]
      this.summaryAt = [0, 0, 0]
      this.seq = this.seq.map((n) => n + 1)
      this.inflight = [false, false, false]
      this.setData({
        panes: freshPanes(),
        monthText: monthTitle(month),
        canPrev: month > '2000-01',
        canNext: month < beijingMonthKey(),
        scrollTop: this.data.scrollTop === 0 ? 1 : 0,
      })
      void this.loadPane(this.data.lensIndex, false)
    },

    activate(i: number) {
      if (this.data.lensIndex !== i) {
        this.setData({ lensIndex: i, scrollTop: this.data.scrollTop === 0 ? 1 : 0 })
      }
      if (this.inflight[i]) return
      const pane = this.data.panes[i]
      const feedOk = !pane.showList || pane.feed.status === 'ready' || pane.feed.status === 'empty'
      const fresh = pane.summaryStatus === 'ready' && !!pane.summary && feedOk && Date.now() - (this.summaryAt[i] || 0) < STALE_MS
      if (fresh) return
      void this.loadPane(i, pane.summaryStatus === 'ready' && !!pane.summary)
    },

    ensureFeed(i: number, month: string): Feed<Expense, Row> {
      const existing = this.feeds[i]
      if (existing) return existing
      const view = LEDGER_VIEWS[i].value
      const feed = new Feed<Expense, Row>({
        host: this,
        path: `panes[${i}].feed`,
        fetch: (cursor) => call('expense.list', { month, cursor, view }),
        view: (item) => toRow(item),
      })
      this.feeds[i] = feed
      return feed
    },

    kickFeed(i: number, month: string): Promise<void> {
      return this.ensureFeed(i, month).refresh(false)
    },

    /**
     * keep：已有合计时静默刷新，失败只 toast。
     * 「对方」先拿合计，确认有流水才拉列表，避免不可见 / 仅汇总多打一次。
     */
    async loadPane(i: number, keep: boolean) {
      if (this.inflight[i]) return
      const month = this.month
      const view = LEDGER_VIEWS[i].value
      this.seq[i] += 1
      const seq = this.seq[i]
      this.inflight[i] = true
      if (!keep) {
        const feed = this.feeds[i]
        if (feed) feed.dispose()
        this.feeds[i] = null
        this.setData({
          [`panes[${i}].summaryStatus`]: 'loading',
          [`panes[${i}].summary`]: null,
          [`panes[${i}].summaryError`]: '',
          [`panes[${i}].hidden`]: false,
          [`panes[${i}].showMonth`]: true,
          [`panes[${i}].feed`]: emptyFeed(),
        })
      }
      try {
        const listNow = view !== 'partner'
        const listTask = listNow ? this.kickFeed(i, month) : null
        const r = await call('expense.monthSummary', { month, view })
        if (seq !== this.seq[i] || month !== this.month) return
        if (!r.ok) {
          if (keep && this.data.panes[i].summary) toast(r.message)
          else this.setData({ [`panes[${i}].summaryStatus`]: 'error', [`panes[${i}].summaryError`]: r.message })
          return
        }
        this.summaryAt[i] = Date.now()
        const chrome = ledgerChrome(view, r.data.scope, r.data.includesPartner)
        this.setData({
          [`panes[${i}].summaryStatus`]: 'ready',
          [`panes[${i}].summary`]: toSummary(r.data),
          [`panes[${i}].summaryError`]: '',
          [`panes[${i}].scope`]: r.data.scope,
          [`panes[${i}].hidden`]: chrome.hidden,
          [`panes[${i}].showMonth`]: chrome.showMonth,
          [`panes[${i}].showList`]: chrome.showList,
          [`panes[${i}].showWho`]: chrome.showWho,
          [`panes[${i}].canDrill`]: chrome.canDrill,
          [`panes[${i}].summaryNote`]: chrome.summaryNote,
          [`panes[${i}].excludeNote`]: chrome.excludeNote,
          [`panes[${i}].emptyTitle`]: chrome.emptyTitle,
          [`panes[${i}].emptyHint`]: chrome.emptyHint,
        })
        if (chrome.showList) {
          await (listTask || this.kickFeed(i, month))
        } else if (this.feeds[i]) {
          const feed = this.feeds[i]
          if (feed) feed.dispose()
          this.feeds[i] = null
          this.setData({ [`panes[${i}].feed`]: { ...emptyFeed(), status: 'empty' } })
        }
      } finally {
        if (seq === this.seq[i]) this.inflight[i] = false
      }
    },

    onLens(e: WechatMiniprogram.TouchEvent) {
      const index = Number(e.currentTarget.dataset.index)
      if (!this.data.bound || index === this.data.lensIndex) return
      if (index !== 0 && index !== 1 && index !== 2) return
      this.activate(index)
    },

    onPrev() {
      if (!this.data.canPrev) return
      this.setMonth(addMonths(this.month, -1))
    },
    onNext() {
      if (!this.data.canNext) return
      this.setMonth(addMonths(this.month, 1))
    },

    async onRefresh() {
      const i = this.data.lensIndex
      this.summaryAt[i] = 0
      this.setData({ refreshing: true })
      await this.loadPane(i, !!this.data.panes[i].summary)
      this.setData({ refreshing: false })
    },
    onLoadMore() {
      const feed = this.feeds[this.data.lensIndex]
      if (feed) void feed.loadMore()
    },
    onRetry() {
      const i = this.data.lensIndex
      this.summaryAt[i] = 0
      void this.loadPane(i, !!this.data.panes[i].summary)
    },

    onCompose() {
      wx.navigateTo({ url: PAGE_LEDGER_COMPOSE })
    },
    onOpen(e: WechatMiniprogram.TouchEvent) {
      const id = String(e.currentTarget.dataset.id)
      const feed = this.feeds[this.data.lensIndex]
      const raw = feed && feed.raw.find((item) => item.id === id)
      if (raw) handoff(`expense:${id}`, raw)
      wx.navigateTo({ url: `${PAGE_LEDGER_DETAIL}?id=${id}` })
    },
    onCategory(e: WechatMiniprogram.TouchEvent) {
      const pane = this.data.panes[this.data.lensIndex]
      if (!pane.canDrill) return
      const l1 = String(e.currentTarget.dataset.l1)
      const view = LEDGER_VIEWS[this.data.lensIndex].value
      const extra = view === 'mine' ? '' : `&view=${view}`
      wx.navigateTo({ url: `${PAGE_LEDGER_CATEGORY}?month=${this.month}&l1=${l1}${extra}` })
    },
  },
})
