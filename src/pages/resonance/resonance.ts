import type { ReportFilter, ReportPost } from '../../types/api'
import { call } from '../../core/api'
import { Feed, emptyFeed, type FeedData } from '../../core/feed'
import { PAGE_PARTNER_HUB, PAGE_REPORT_COMPOSE, PAGE_REPORT_DETAIL } from '../../core/paths'
import { emit, getUser, handoff, on } from '../../core/store'
import { confirm, editOrDelete, toast, toastDone } from '../../core/ui'
import { reportView, type ReportView } from '../../core/views'

const FILTERS: ReportFilter[] = ['all', 'action_needed', 'mine']
const STALE_MS = 60 * 1000

/** 报备在某个筛选下是否应出现（发布 / 已阅 / 评价后据此加入或移出） */
function belongs(filter: ReportFilter, post: ReportPost): boolean {
  if (filter === 'mine') return post.isMine
  if (filter === 'action_needed') return !post.isMine && post.state !== 'evaluated'
  return true
}

type Data = {
  tabIndex: number
  tabs: (FeedData<ReportView> & { key: string })[]
  unbound: boolean
  showTop: boolean
  scrollTop: number
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
    tabIndex: 2,
    tabs: FILTERS.map((key) => ({ ...emptyFeed<ReportView>(), key })),
    unbound: false,
    showTop: false,
    scrollTop: 0,
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
            fetch: (cursor) => call('report.list', { filter, cursor }),
            view: (post, prev) => reportView(post, prev),
            sortKey: (post) => post.recordAtMs,
          }),
      )
      this.syncUser()
      this.offs = [
        on('report:upsert', (post) =>
          this.feeds.forEach((feed, i) => (belongs(FILTERS[i], post) ? feed.upsert(post) : feed.remove(post.id))),
        ),
        on('report:remove', (id) => this.feeds.forEach((feed) => feed.remove(id))),
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
      const pref = u.preferences.resonanceReportFilter
      if (pref !== this.appliedFilter) {
        this.appliedFilter = pref
        this.activate(FILTERS.indexOf(pref))
      } else if (partnerChanged) {
        this.activate(this.data.tabIndex)
      }
    },

    activate(i: number) {
      if (i !== this.data.tabIndex) this.setData({ tabIndex: i, showTop: false })
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

    onCompose() {
      wx.navigateTo({ url: PAGE_REPORT_COMPOSE })
    },
    onBind() {
      wx.navigateTo({ url: PAGE_PARTNER_HUB })
    },
  },
})
