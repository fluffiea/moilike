import type { ReportPost } from '../../types/api'
import { call } from '../../core/api'
import { applyResonanceBadge } from '../../core/badge'
import { Feed, emptyFeed, shouldContinueDrainedFeed, type FeedData } from '../../core/feed'
import { normalizeReportFilter } from '../../core/format'
import { PAGE_PARTNER_HUB, PAGE_REPORT_COMPOSE, PAGE_REPORT_DETAIL, PAGE_REPORT_ECHOES } from '../../core/paths'
import { emit, getUser, handoff, on } from '../../core/store'
import { RESPOND_HINT, RESPOND_TITLE, stickerChoices } from '../../core/stickers'
import { confirm, editOrDelete, toast, toastDone } from '../../core/ui'
import { reportView, type ReportView } from '../../core/views'

/** 共鸣只保留两条：两个人同一条时间线，「等我回声」是筛出来的待回栏 */
type Filter = 'all' | 'await_me'
const STALE_MS = 60 * 1000

const EMPTIES: Record<Filter, { title: string; hint: string; action: string }> = {
  all: { title: '还没有报备', hint: '记一件想告诉 Ta 的小事吧', action: '写报备' },
  await_me: { title: '没有等你的回声', hint: '对方的新报备会先出现在这里', action: '' },
}

/**
 * 一条时间线装下双方的报备：卡片底部固定一个回声槽，未回心时是「等你的回声」和回心入口，
 * 已回心时是贴纸、谁回的心和相对时间。筛选只控制拿哪一页数据，不另拆「我发的」。
 * 翻页仍按接口的记录时间顺序追加；单条变化按记录时间插回原位（sortKey）。
 */

type Data = {
  filter: Filter
  feed: FeedData<ReportView>
  awaitMeCount: number
  bound: boolean
  showTop: boolean
  scrollTop: number
  empty: { title: string; hint: string; action: string }
  stickers: { id: string; label: string; src: string }[]
  respondTitle: string
  respondHint: string
  quickId: string
  quickPreview: string
  quickBusy: string
}

type Custom = {
  feed: Feed<ReportPost, ReportView> | null
  offs: (() => void)[]
  partnerId: string
}

Component<Data, {}, WechatMiniprogram.Component.MethodOption, Custom, true>({
  data: {
    filter: 'all',
    feed: emptyFeed<ReportView>(),
    awaitMeCount: 0,
    bound: false,
    showTop: false,
    scrollTop: 0,
    empty: EMPTIES.all,
    stickers: stickerChoices(),
    respondTitle: RESPOND_TITLE,
    respondHint: RESPOND_HINT,
    quickId: '',
    quickPreview: '',
    quickBusy: '',
  },
  methods: {
    onLoad() {
      this.offs = []
      this.syncUser()
      this.offs = [
        on('report:upsert', (post) => this.applyPost(post)),
        on('report:remove', (id) => {
          if (this.feed) this.feed.remove(id)
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
      this.offs = []
      this.disposeFeed()
    },
    onShow() {
      if (this.feed && this.data.bound) this.feed.refreshIfStale(STALE_MS)
    },

    /** 结伴关系或偏好变化时重建列表；偏好里的旧「我发的」按全部显示 */
    syncUser() {
      const u = getUser()
      if (!u) return
      const pid = u.partner ? u.partner.openId : ''
      const partnerChanged = this.partnerId !== undefined && this.partnerId !== pid
      this.partnerId = pid
      this.setData({ bound: !!pid })
      if (!pid) {
        this.disposeFeed()
        this.setData({ awaitMeCount: 0 })
        applyResonanceBadge(0)
        return
      }
      const pref = normalizeReportFilter(u.preferences.resonanceReportFilter) as Filter
      if (!this.feed || partnerChanged || pref !== this.data.filter) this.startFeed(pref)
    },

    startFeed(filter: Filter) {
      this.disposeFeed()
      // 切换筛选后回到顶部：scroll-top 只在值变化时生效，0/1 交替触发
      const scrollTop = this.data.scrollTop === 0 ? 1 : 0
      this.setData({ filter, scrollTop, feed: emptyFeed<ReportView>(), empty: EMPTIES[filter], showTop: false })
      const feed: Feed<ReportPost, ReportView> = new Feed({
        host: this,
        path: 'feed',
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
        sortKey: (post: ReportPost) => post.recordAtMs,
        pageErrorIfEmpty: filter === 'await_me',
      })
      this.feed = feed
      feed.start()
    },

    disposeFeed() {
      if (this.feed) {
        this.feed.dispose()
        this.feed = null
      }
    },

    /** 新发、编辑、回心都从这里进列表；「等我回声」栏里回心后移出 */
    applyPost(post: ReportPost) {
      if (!this.feed || !this.data.bound) return
      if (this.data.filter === 'await_me' && (post.isMine || post.state === 'responded')) {
        this.feed.remove(post.id)
        this.fillAwaitIfDrained()
      } else {
        this.feed.upsert(post)
      }
      if (post.id === this.data.quickId && post.state === 'responded') this.closeQuick()
    },

    onFilterTap(e: WechatMiniprogram.TouchEvent) {
      const key = e.currentTarget.dataset.key as Filter
      if (key === this.data.filter) return
      if (this.data.quickBusy) return
      this.closeQuick()
      this.startFeed(key)
    },

    onRefresh() {
      if (this.feed) void this.feed.refresh(true)
    },
    onLoadMore() {
      if (this.feed) void this.feed.loadMore()
    },
    onRetry() {
      if (this.feed) void this.feed.refresh()
    },
    onScroll(e: WechatMiniprogram.ScrollViewScroll) {
      const show = e.detail.scrollTop > 800
      if (show !== this.data.showTop) this.setData({ showTop: show })
    },
    onBackTop() {
      this.setData({ scrollTop: this.data.scrollTop === 0 ? 1 : 0, showTop: false })
    },

    findPost(id: string): ReportPost | undefined {
      return this.feed ? this.feed.find(id) : undefined
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
        quickPreview: post.body.replace(/\s+/g, ' ').trim(),
        quickBusy: '',
      })
    },

    closeQuick() {
      if (!this.data.quickId && !this.data.quickBusy) return
      this.setData({ quickId: '', quickPreview: '', quickBusy: '' })
    },

    /** 这一页都回完了、后面还有时继续拉，避免误显示「没有等你的回声」 */
    fillAwaitIfDrained() {
      if (this.data.filter !== 'await_me' || !this.feed) return
      if (shouldContinueDrainedFeed(this.feed.raw.length, this.feed.hasMore)) {
        this.setData({ 'feed.status': 'loading' })
        void this.feed.loadMore()
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
    onEchoes() {
      wx.navigateTo({ url: PAGE_REPORT_ECHOES })
    },
    onBind() {
      wx.navigateTo({ url: PAGE_PARTNER_HUB })
    },
  },
})
