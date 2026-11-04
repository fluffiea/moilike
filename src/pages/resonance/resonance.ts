import type { ReportFilter, ReportPost } from '../../types/api'
import { call } from '../../core/api'
import { applyResonanceBadge } from '../../core/badge'
import { Feed, emptyFeed, type FeedData } from '../../core/feed'
import { normalizeReportFilter } from '../../core/format'
import { PAGE_PARTNER_HUB, PAGE_REPORT_COMPOSE, PAGE_REPORT_DETAIL } from '../../core/paths'
import { emit, getUser, handoff, on } from '../../core/store'
import { STICKERS } from '../../core/stickers'
import { confirm, editOrDelete, toast, toastDone } from '../../core/ui'
import { reportRank, reportView, type ReportView } from '../../core/views'

const FILTERS: ReportFilter[] = ['all', 'await_me', 'mine']
const STALE_MS = 60 * 1000

/**
 * 「我发的」未回优先只在客户端做：sortKey 用 reportRank，不给 report.list 加参数。
 * 分页游标仍是服务端记录时间。已经加载的条目会整表重排；更早页里的未回心，翻到那一页之后才进上段。
 */

/** 报备在某个筛选下是否应出现（发布 / 回心后据此加入或移出） */
function belongs(filter: ReportFilter, post: ReportPost): boolean {
  if (filter === 'mine') return post.isMine
  if (filter === 'await_me') return !post.isMine && post.state !== 'responded'
  return true
}

const EMPTIES = [
  { title: '还没有报备', hint: '结伴后，你们的报备会出现在彼此的共鸣里' },
  { title: '都回完了', hint: '对方的新报备会出现在这里；也可以去「全部」看看' },
  { title: '还没有报备', hint: '记一件想告诉对方的小事吧' },
]

type Data = {
  tabIndex: number
  tabs: (FeedData<ReportView> & { key: string })[]
  awaitMeCount: number
  unbound: boolean
  showTop: boolean
  scrollTop: number
  empties: { title: string; hint: string }[]
  stickers: { id: string; label: string; src: string }[]
  quickId: string
  quickHeadline: string
  quickBusy: string
}

type Custom = {
  feeds: Feed<ReportPost, ReportView>[]
  started: boolean[]
  appliedFilter: ReportFilter
  offs: (() => void)[]
  partnerId: string
}

Component<Data, {}, WechatMiniprogram.Component.MethodOption, Custom, true>({
  data: {
    tabIndex: 1,
    tabs: FILTERS.map((key) => ({ ...emptyFeed<ReportView>(), key })),
    awaitMeCount: 0,
    unbound: false,
    showTop: false,
    scrollTop: 0,
    empties: EMPTIES,
    stickers: STICKERS.map((s) => ({ id: s.id, label: s.label, src: s.src })),
    quickId: '',
    quickHeadline: '',
    quickBusy: '',
  },
  methods: {
    onLoad() {
      this.started = FILTERS.map(() => false)
      this.feeds = FILTERS.map(
        (filter, i) =>
          new Feed<ReportPost, ReportView>({
            host: this,
            path: `tabs[${i}]`,
            cacheName: `report:${filter}`,
            fetch: async (cursor) => {
              const r = await call('report.list', { filter, cursor })
              if (r.ok) {
                this.setData({ awaitMeCount: r.data.awaitMeCount })
                applyResonanceBadge(r.data.awaitMeCount)
              }
              return r
            },
            view: (post, prev) => reportView(post, prev, filter),
            sortKey: (post) => reportRank(post, filter),
            // 只有这一栏会在本页被回心清空后接着翻页
            pageErrorIfEmpty: filter === 'await_me',
          }),
      )
      this.syncUser()
      this.offs = [
        on('report:upsert', (post) => {
          this.feeds.forEach((feed, i) => (belongs(FILTERS[i], post) ? feed.upsert(post) : feed.remove(post.id)))
          this.fillAwaitIfDrained()
          if (post.id === this.data.quickId && post.state === 'responded') this.closeQuick()
        }),
        on('report:remove', (id) => {
          this.feeds.forEach((feed) => feed.remove(id))
          this.fillAwaitIfDrained()
          if (id === this.data.quickId) this.closeQuick()
        }),
        on('report:await-count', (n) => {
          this.setData({ awaitMeCount: n })
          applyResonanceBadge(n)
        }),
        on('user', () => this.syncUser()),
      ]
    },
    onUnload() {
      this.offs.forEach((off) => off())
    },
    onShow() {
      const i = this.data.tabIndex
      if (this.started[i]) this.feeds[i].refreshIfStale(STALE_MS)
    },

    /** 默认筛选跟随偏好设置；结伴关系变化时重载当前栏，其余栏切换到时再加载 */
    syncUser() {
      const u = getUser()
      if (!u) return
      const pid = u.partner ? u.partner.openId : ''
      const partnerChanged = this.partnerId !== undefined && this.partnerId !== pid
      this.partnerId = pid
      this.setData({ unbound: !pid })
      if (partnerChanged) this.started = FILTERS.map(() => false)
      const pref = normalizeReportFilter(u.preferences.resonanceReportFilter)
      if (pref !== this.appliedFilter) {
        this.appliedFilter = pref
        this.activate(FILTERS.indexOf(pref))
      } else if (partnerChanged) {
        this.activate(this.data.tabIndex)
      }
    },

    activate(i: number) {
      if (i !== this.data.tabIndex) {
        this.setData({ tabIndex: i, showTop: false })
        if (!this.data.quickBusy) this.closeQuick()
      }
      if (!this.started[i]) {
        this.started[i] = true
        this.feeds[i].start()
      } else {
        this.feeds[i].refreshIfStale(STALE_MS)
      }
    },

    onTabTap(e: WechatMiniprogram.TouchEvent) {
      this.activate(Number(e.currentTarget.dataset.index))
    },
    onSwiperChange(e: WechatMiniprogram.SwiperChange) {
      if (e.detail.source === 'touch') this.activate(e.detail.current)
    },

    onRefresh() {
      void this.feeds[this.data.tabIndex].refresh(true)
    },
    onLoadMore() {
      void this.feeds[this.data.tabIndex].loadMore()
    },
    onRetry() {
      void this.feeds[this.data.tabIndex].refresh()
    },
    onScroll(e: WechatMiniprogram.ScrollViewScroll) {
      const show = e.detail.scrollTop > 800
      if (show !== this.data.showTop) this.setData({ showTop: show })
    },
    onBackTop() {
      this.setData({ scrollTop: this.data.scrollTop === 0 ? 1 : 0, showTop: false })
    },

    findPost(id: string): ReportPost | undefined {
      for (const feed of this.feeds) {
        const p = feed.find(id)
        if (p) return p
      }
      return undefined
    },

    onOpen(e: WechatMiniprogram.CustomEvent<{ id: string }>) {
      handoff(`report:${e.detail.id}`, this.findPost(e.detail.id))
      wx.navigateTo({ url: `${PAGE_REPORT_DETAIL}?id=${e.detail.id}` })
    },

    async onMore(e: WechatMiniprogram.CustomEvent<{ id: string }>) {
      const post = this.findPost(e.detail.id)
      if (!post) return
      const action = await editOrDelete()
      if (action === 'edit') {
        handoff(`report-edit:${post.id}`, post)
        wx.navigateTo({ url: `${PAGE_REPORT_COMPOSE}?id=${post.id}` })
      } else if (action === 'delete') {
        const ok = await confirm({ title: '删除这条报备？', content: '删除后无法恢复。', confirmText: '删除', danger: true })
        if (!ok) return
        const r = await call('report.remove', { id: post.id })
        if (!r.ok) return toast(r.message)
        emit('report:remove', post.id)
        toastDone('已删除')
      }
    },

    onQuick(e: WechatMiniprogram.CustomEvent<{ id: string }>) {
      const post = this.findPost(e.detail.id)
      if (!post || post.isMine || post.state === 'responded') return
      this.setData({
        quickId: post.id,
        quickHeadline: reportView(post, undefined, 'await_me').headline,
        quickBusy: '',
      })
    },

    closeQuick() {
      if (!this.data.quickId && !this.data.quickBusy) return
      this.setData({ quickId: '', quickHeadline: '', quickBusy: '' })
    },

    /** 这一页都回完了、后面还有时继续拉，避免误显示「都回完了」 */
    fillAwaitIfDrained() {
      const i = FILTERS.indexOf('await_me')
      const feed = this.feeds[i]
      if (feed.raw.length === 0 && feed.hasMore) {
        this.setData({ [`tabs[${i}].status`]: 'loading' })
        void feed.loadMore()
      }
    },

    onCloseQuick() {
      if (this.data.quickBusy) return
      this.closeQuick()
    },

    noop() {},

    async onQuickSticker(e: WechatMiniprogram.CustomEvent<{ id: string }>) {
      const stickerId = e.detail.id || ''
      const postId = this.data.quickId
      if (!stickerId || !postId || this.data.quickBusy) return
      this.setData({ quickBusy: stickerId })
      const r = await call('report.respond', { id: postId, stickerId })
      if (!r.ok) {
        if (this.data.quickId === postId) this.setData({ quickBusy: '' })
        return toast(r.message)
      }
      applyResonanceBadge(r.data.awaitMeCount)
      emit('report:await-count', r.data.awaitMeCount)
      emit('report:upsert', r.data.post)
      if (this.data.quickId === postId) this.closeQuick()
      toastDone('已回心')
    },

    onCompose() {
      wx.navigateTo({ url: PAGE_REPORT_COMPOSE })
    },
    onBind() {
      wx.navigateTo({ url: PAGE_PARTNER_HUB })
    },
  },
})
