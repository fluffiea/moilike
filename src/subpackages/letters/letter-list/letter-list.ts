import type { LetterItem } from '../../../types/api'
import { call } from '../../../core/api'
import { Feed, emptyFeed, type FeedData } from '../../../core/feed'
import { PAGE_LETTER_COMPOSE, PAGE_LETTER_DETAIL, PAGE_PARTNER_HUB } from '../../../core/paths'
import { getUser, on } from '../../../core/store'
import { letterView, type LetterView } from '../../../core/views'

Component<
  { feed: FeedData<LetterView>; bound: boolean },
  {},
  WechatMiniprogram.Component.MethodOption,
  { feed: Feed<LetterItem, LetterView>; offs: (() => void)[] },
  true
>({
  data: {
    feed: emptyFeed<LetterView>(),
    bound: true,
  },
  methods: {
    onLoad() {
      const u = getUser()
      this.setData({ bound: !!(u && u.partner) })
      this.feed = new Feed<LetterItem, LetterView>({
        host: this,
        path: 'feed',
        cacheName: 'letters',
        fetch: (cursor) => call('letters.list', { cursor }),
        view: (item, prev) => letterView(item, prev),
      })
      this.feed.start()
      this.offs = [
        on('letter:upsert', (item) => this.feed.upsert(item)),
        on('letter:remove', (id) => this.feed.remove(id)),
      ]
    },
    onUnload() {
      this.offs.forEach((off) => off())
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
    onOpen(e: WechatMiniprogram.TouchEvent) {
      wx.navigateTo({ url: `${PAGE_LETTER_DETAIL}?id=${e.currentTarget.dataset.id}` })
    },
    onCompose() {
      wx.navigateTo({ url: this.data.bound ? PAGE_LETTER_COMPOSE : PAGE_PARTNER_HUB })
    },
  },
})
