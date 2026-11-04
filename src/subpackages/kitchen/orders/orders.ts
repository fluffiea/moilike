import type { MyOrder } from '../../../types/api'
import { call, callOrToast } from '../../../core/api'
import { replaceCart, requestOpenCart } from '../../../core/cart'
import { Feed, emptyFeed, type FeedData } from '../../../core/feed'
import { dateTime } from '../../../core/format'
import { lineText, orderStatusClass } from '../../../core/kitchen'
import { TAB_ORDER } from '../../../core/paths'
import { confirm, toast } from '../../../core/ui'

type View = {
  id: string
  lines: string[]
  noteText: string
  time: string
  statusLabel: string
  statusClass: string
  canCancel: boolean
  canReorder: boolean
}

Component<
  { feed: FeedData<View> },
  {},
  WechatMiniprogram.Component.MethodOption,
  { feedCtl: Feed<MyOrder, View> | null; cancelling: boolean },
  true
>({
  data: { feed: emptyFeed<View>() },
  methods: {
    onLoad() {
      this.cancelling = false
      this.feedCtl = new Feed<MyOrder, View>({
        host: this,
        path: 'feed',
        fetch: (cursor) => call('kitchen.myOrders', { cursor }),
        view: (item) => ({
          id: item.id,
          lines: item.lines.map((l) => lineText(l.name, l.quantity)),
          noteText: item.note ? `备注：${item.note}` : '',
          time: dateTime(item.createdAtMs),
          statusLabel: item.statusLabel,
          statusClass: orderStatusClass(item.status),
          canCancel: item.canCancel,
          canReorder: item.canReorder,
        }),
      })
      this.feedCtl.start()
    },
    onShow() {
      if (this.feedCtl) this.feedCtl.refreshIfStale(8000)
    },
    onUnload() {
      if (this.feedCtl) this.feedCtl.dispose()
    },
    onRefresh() {
      if (this.feedCtl) void this.feedCtl.refresh(true)
    },
    onLoadMore() {
      if (this.feedCtl) void this.feedCtl.loadMore()
    },
    async onCancel(e: WechatMiniprogram.TouchEvent) {
      if (this.cancelling) return
      const id = String(e.currentTarget.dataset.id || '')
      this.cancelling = true
      const yes = await confirm({
        title: '取消这份订单？',
        content: '还没接单，取消后对方就看不到了。',
        confirmText: '取消订单',
        danger: true,
      })
      if (!yes || !this.feedCtl) {
        this.cancelling = false
        return
      }
      const r = await callOrToast('kitchen.cancel', { id })
      this.cancelling = false
      if (r && this.feedCtl) this.feedCtl.upsert(r.order)
    },
    async onReorder(e: WechatMiniprogram.TouchEvent) {
      const id = String(e.currentTarget.dataset.id || '')
      const order = this.feedCtl ? this.feedCtl.find(id) : undefined
      if (!order) return
      const menu = await callOrToast('kitchen.partner', {})
      if (!menu || !menu.kitchen) {
        toast('还不能点单')
        return
      }
      const available = new Map(menu.dishes.map((d) => [d.id, d]))
      const next: { dishId: string; name: string; cover: string; quantity: number }[] = []
      let skipped = 0
      for (const line of order.lines) {
        const dish = available.get(line.dishId)
        if (!dish) {
          skipped += 1
          continue
        }
        next.push({
          dishId: dish.id,
          name: dish.name,
          cover: dish.cover ? dish.cover.thumb : '',
          quantity: line.quantity,
        })
      }
      if (!next.length) {
        toast('这些心意已经下架了')
        return
      }
      replaceCart(menu.kitchen.id, next)
      requestOpenCart()
      if (skipped) toast('有些心意已下架，其余放回购物车')
      wx.switchTab({ url: TAB_ORDER })
    },
  },
})
