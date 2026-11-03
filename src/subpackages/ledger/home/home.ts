import type { Expense, ExpenseMonthSummary, LedgerScope, LedgerView } from '../../../types/api'
import { call } from '../../../core/api'
import { Feed, emptyFeed, type FeedData } from '../../../core/feed'
import { addMonths, barWidth, beijingMonthKey, formatYuan, ledgerDay, monthTitle, shareText } from '../../../core/ledger'
import { LEDGER_VIEWS, ledgerChrome, ledgerHeroLabel, partnerLedgerOpen } from '../../../core/ledger-visibility'
import { PAGE_LEDGER_CATEGORY, PAGE_LEDGER_COMPOSE, PAGE_LEDGER_DETAIL } from '../../../core/paths'
import { getUser, handoff, on, setUser } from '../../../core/store'
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

type Pane = {
  heroLabel: string
  summaryStatus: 'loading' | 'ready' | 'error'
  summaryError: string
  summary: SummaryView | null
  feed: FeedData<Row>
  showList: boolean
  canDrill: boolean
  summaryNote: string
  emptyTitle: string
  emptyHint: string
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

function emptyPane(view: LedgerView): Pane {
  const chrome = ledgerChrome(view, 'detail')
  return {
    heroLabel: ledgerHeroLabel(view),
    summaryStatus: 'loading',
    summaryError: '',
    summary: null,
    feed: emptyFeed(),
    showList: chrome.showList,
    canDrill: chrome.canDrill,
    summaryNote: '',
    emptyTitle: chrome.emptyTitle,
    emptyHint: chrome.emptyHint,
  }
}

function freshPanes(): Pane[] {
  return LEDGER_VIEWS.map((item) => emptyPane(item.value))
}

type Data = {
  bound: boolean
  showLens: boolean
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
  accessSeq: number
}

Component<Data, {}, WechatMiniprogram.Component.MethodOption, Custom, true>({
  data: {
    bound: false,
    showLens: false,
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
      this.summaryAt = [0, 0]
      this.seq = [0, 0]
      this.inflight = [false, false]
      this.accessSeq = 0
      this.feeds = [null, null]
      this.offs = [
        on('expense:changed', (payload) => {
          this.pending = true
          this.pendingMonth = beijingMonthKey(payload.occurredAtMs)
        }),
      ]
      const bound = this.isBound()
      this.setData({
        bound,
        showLens: bound && partnerLedgerOpen(getUser()),
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
      if (this.pending && index === 0 && this.pendingMonth && this.pendingMonth !== this.month && this.pendingMonth <= nowKey) {
        const target = this.pendingMonth
        this.pending = false
        this.pendingMonth = ''
        this.setMonth(target)
        return
      }
      if (this.pending) {
        this.pending = false
        this.dropPane(0)
      }
      this.activate(index)
      if (this.isBound()) void this.refreshAccess()
    },

    isBound(): boolean {
      const u = getUser()
      return Boolean(u && u.partner)
    },

    /** 解绑后收成自己的账本。返回当前应显示的分段下标 */
    syncBound(): number {
      const bound = this.isBound()
      const index = bound ? this.data.lensIndex : 0
      const showLens = bound ? this.data.showLens : false
      if (bound !== this.data.bound || index !== this.data.lensIndex || showLens !== this.data.showLens) {
        this.setData({ bound, lensIndex: index, showLens })
      }
      return index
    },

    /** 我改过的账只影响「我的」，下次进入再拉 */
    dropPane(i: number) {
      this.summaryAt[i] = 0
      const feed = this.feeds[i]
      if (feed) feed.dispose()
      this.feeds[i] = null
    },

    rememberScope(scope: LedgerScope) {
      const u = getUser()
      if (!u || !u.partner || u.partner.ledgerScope === scope) return
      setUser({ ...u, partner: { ...u.partner, ledgerScope: scope } })
    },

    /** 对方未开放时收起切换，正在看对方的账就回到自己的 */
    applyAccess(scope: LedgerScope) {
      this.rememberScope(scope)
      const open = scope === 'summary' || scope === 'detail'
      if (!open) {
        const leave = this.data.lensIndex !== 0
        if (this.data.showLens || leave) this.setData({ showLens: false, lensIndex: 0 })
        if (leave) this.activate(0)
        return
      }
      if (!this.data.showLens) this.setData({ showLens: true })
    },

    /** 只问对方是否开放。不可见时云端不查支出，页面保持单人账本 */
    async refreshAccess() {
      if (!this.isBound()) return
      const seq = ++this.accessSeq
      const r = await call('expense.monthSummary', { month: this.month, view: 'partner', scope: 'total' })
      if (seq !== this.accessSeq || !this.isBound()) return
      if (!r.ok) return
      this.applyAccess(r.data.scope)
    },

    setMonth(month: string) {
      this.month = month
      this.feeds.forEach((feed) => feed && feed.dispose())
      this.feeds = [null, null]
      this.summaryAt = [0, 0]
      this.seq = this.seq.map((n) => n + 1)
      this.inflight = [false, false]
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
     * 「对方」先拿合计，确认有流水才拉列表，避免仅汇总多打一次。
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
        if (view === 'partner') this.applyAccess(r.data.scope)
        if (view === 'partner' && r.data.scope === 'none') return
        const chrome = ledgerChrome(view, r.data.scope)
        this.setData({
          [`panes[${i}].summaryStatus`]: 'ready',
          [`panes[${i}].summary`]: toSummary(r.data),
          [`panes[${i}].summaryError`]: '',
          [`panes[${i}].showList`]: chrome.showList,
          [`panes[${i}].canDrill`]: chrome.canDrill,
          [`panes[${i}].summaryNote`]: chrome.summaryNote,
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
      if (!this.data.showLens || index === this.data.lensIndex) return
      if (index !== 0 && index !== 1) return
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
      const jobs = [this.loadPane(i, !!this.data.panes[i].summary)]
      if (i === 0 && this.isBound()) jobs.push(this.refreshAccess())
      await Promise.all(jobs)
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
