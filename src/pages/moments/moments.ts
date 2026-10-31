import type { DailyPost } from '../../types/api'
import { call } from '../../core/api'
import { Feed, emptyFeed, type FeedData } from '../../core/feed'
import { dateStr, parseDateTime } from '../../core/format'
import { PAGE_DAILY_COMPOSE, PAGE_DAILY_DETAIL, PAGE_PARTNER_HUB } from '../../core/paths'
import { emit, getUser, handoff, on } from '../../core/store'
import { confirm, editOrDelete, toast, toastDone } from '../../core/ui'
import { dailyView, type DailyView } from '../../core/views'

const STALE_MS = 2 * 60 * 1000

type Data = {
  feed: FeedData<DailyView>
  filterDate: string
  today: string
  unbound: boolean
  showTop: boolean
  scrollTop: number
}

type Custom = { feed: Feed<DailyPost, DailyView>; offs: (() => void)[]; partnerId: string }

Component<Data, {}, WechatMiniprogram.Component.MethodOption, Custom, true>({
  data: {
    feed: emptyFeed<DailyView>(),
    filterDate: '',
    today: dateStr(Date.now()),
    unbound: false,
    showTop: false,
    scrollTop: 0,
  },
  methods: {
    onLoad() {
      this.syncPartner()
      this.feed = this.createFeed('')
      this.feed.start()
      this.offs = [
        on('daily:upsert', (post) => this.feed.upsert(post)),
        on('daily:remove', (id) => this.feed.remove(id)),
        on('daily:summary', ({ id, summary }) => this.feed.patch(id, (p) => ({ ...p, ...summary }))),
        on('user', () => {
          if (this.syncPartner()) void this.feed.refresh()
        }),
      ]
    },
    onUnload() {
      this.offs.forEach((off) => off())
    },
    onShow() {
      this.feed.refreshIfStale(STALE_MS)
    },

    /** 结伴关系变化时返回 true */
    syncPartner(): boolean {
      const u = getUser()
      const pid = u && u.partner ? u.partner.openId : ''
      const changed = this.partnerId !== undefined && this.partnerId !== pid
      this.partnerId = pid
      this.setData({ unbound: !pid })
      return changed
    },

    createFeed(date: string) {
      const dayStartMs = date ? parseDateTime(date) : 0
      return new Feed<DailyPost, DailyView>({
        host: this,
        path: 'feed',
        cacheName: date ? undefined : 'daily',
        fetch: (cursor) => call('daily.list', dayStartMs ? { cursor, dayStartMs } : { cursor }),
        view: (post, prev) => dailyView(post, prev),
      })
    },

    onFilterDate(e: WechatMiniprogram.PickerChange) {
      this.applyFilter(String(e.detail.value))
    },
    onClearFilter() {
      this.applyFilter('')
    },
    applyFilter(date: string) {
      this.feed.dispose()
      this.setData({ filterDate: date, feed: emptyFeed<DailyView>(), scrollTop: 0 })
      this.feed = this.createFeed(date)
      this.feed.start()
    },

    onRefresh() {
      void this.feed.refresh(true)
    },
    onLoadMore() {
      void this.feed.loadMore()
    },
    onRetry() {
      void this.feed.refresh()
    },
    onScroll(e: WechatMiniprogram.ScrollViewScroll) {
      const show = e.detail.scrollTop > 800
      if (show !== this.data.showTop) this.setData({ showTop: show })
    },
    onBackTop() {
      this.setData({ scrollTop: this.data.scrollTop === 0 ? 1 : 0 })
    },

    onOpen(e: WechatMiniprogram.CustomEvent<{ id: string }>) {
      const post = this.feed.find(e.detail.id)
      handoff(`daily:${e.detail.id}`, post)
      wx.navigateTo({ url: `${PAGE_DAILY_DETAIL}?id=${e.detail.id}` })
    },

    async onMore(e: WechatMiniprogram.CustomEvent<{ id: string }>) {
      const post = this.feed.find(e.detail.id)
      if (!post) return
      const action = await editOrDelete()
      if (action === 'edit') {
        handoff(`daily-edit:${post.id}`, post)
        wx.navigateTo({ url: `${PAGE_DAILY_COMPOSE}?id=${post.id}` })
      } else if (action === 'delete') {
        const ok = await confirm({ title: '删除这条日常？', content: '评论会一起删除，且无法恢复。', confirmText: '删除', danger: true })
        if (!ok) return
        const r = await call('daily.remove', { id: post.id })
        if (!r.ok) return toast(r.message)
        emit('daily:remove', post.id)
        toastDone('已删除')
      }
    },

    onCompose() {
      wx.navigateTo({ url: PAGE_DAILY_COMPOSE })
    },
    onBind() {
      wx.navigateTo({ url: PAGE_PARTNER_HUB })
    },
  },
})
