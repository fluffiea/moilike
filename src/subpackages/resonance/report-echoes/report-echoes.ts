import type { ReportPost } from '../../../types/api'
import { call } from '../../../core/api'
import { Feed, emptyFeed, shouldContinueDrainedFeed, type FeedData } from '../../../core/feed'
import { PAGE_REPORT_DETAIL } from '../../../core/paths'
import { handoff, on } from '../../../core/store'
import { reportView, type ReportView } from '../../../core/views'

const STALE_MS = 60 * 1000

/**
 * 已共鸣：只收两个人已经回声的报备，按年月归档，贴纸放大。
 * 只读回看，不在这里回声；点开仍进报备详情。
 */
type Data = {
  feed: FeedData<ReportView>
}

type Custom = {
  feed: Feed<ReportPost, ReportView> | null
  offs: (() => void)[]
}

Component<Data, {}, WechatMiniprogram.Component.MethodOption, Custom, true>({
  data: {
    feed: emptyFeed<ReportView>(),
  },
  methods: {
    onLoad() {
      const feed = new Feed<ReportPost, ReportView>({
        host: this,
        path: 'feed',
        cacheName: 'report:echoed',
        fetch: (cursor) => call('report.list', { filter: 'echoed', cursor }),
        view: (post, prev) => reportView(post, prev, 'archive'),
        /** 在详情里改了自己的记录时间后，回来仍按记录时间排、月份也跟着重算 */
        sortKey: (post: ReportPost) => post.recordAtMs,
      })
      this.feed = feed
      this.offs = [
        on('report:upsert', (post) => {
          if (!this.feed) return
          if (post.state === 'responded') this.feed.upsert(post)
          else this.feed.remove(post.id)
          this.fillIfDrained()
        }),
        on('report:remove', (id) => {
          if (!this.feed) return
          this.feed.remove(id)
          this.fillIfDrained()
        }),
      ]
      feed.start()
    },
    onUnload() {
      this.offs.forEach((off) => off())
      this.offs = []
      if (this.feed) this.feed.dispose()
      this.feed = null
    },
    onShow() {
      if (this.feed) this.feed.refreshIfStale(STALE_MS)
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
    onOpen(e: WechatMiniprogram.CustomEvent<{ id: string }>) {
      handoff(`report:${e.detail.id}`, this.feed ? this.feed.find(e.detail.id) : undefined)
      wx.navigateTo({ url: `${PAGE_REPORT_DETAIL}?id=${e.detail.id}` })
    },

    /** 这一页删空、后面还有时接着拉，避免停在空态 */
    fillIfDrained() {
      if (!this.feed) return
      if (shouldContinueDrainedFeed(this.feed.raw.length, this.feed.hasMore)) {
        this.setData({ 'feed.status': 'loading' })
        void this.feed.loadMore()
      }
    },
  },
})
