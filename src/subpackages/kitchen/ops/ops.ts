import type { OpsOrder, OpsStatus } from '../../../types/api'
import { call, callOrToast } from '../../../core/api'
import { Feed, emptyFeed, type FeedData } from '../../../core/feed'
import { dateTime } from '../../../core/format'
import { lineText, orderStatusClass, renameKitchen } from '../../../core/kitchen'
import { PAGE_KITCHEN_CREATE, PAGE_KITCHEN_MENU } from '../../../core/paths'

type Tab = { key: OpsStatus; name: string; on: boolean }
type View = {
  id: string
  lines: string[]
  note: string
  time: string
  statusLabel: string
  statusClass: string
  ordererName: string
  ordererAvatar: string
  initial: string
  action: string
}

function linesOf(item: OpsOrder): string[] {
  if (item.lines && item.lines.length) return item.lines.map((l) => lineText(l.name, l.quantity, l.tags))
  return item.names ? [item.names] : []
}

const EMPTY: Record<OpsStatus, { title: string; hint: string }> = {
  pending: { title: '还没有待接单', hint: '对方点的心意会出现在这里' },
  in_progress: { title: '没有进行中的心意', hint: '接单之后会到这里' },
  done: { title: '还没有完成的心意', hint: '完成后留在这里' },
}

const TABS: Tab[] = [
  { key: 'pending', name: '待接单', on: true },
  { key: 'in_progress', name: '进行中', on: false },
  { key: 'done', name: '已完成', on: false },
]

Component<
  { gate: 'loading' | 'error' | 'ready'; errorText: string; kitchenName: string; tabs: Tab[]; emptyTitle: string; emptyHint: string; feed: FeedData<View> },
  {},
  WechatMiniprogram.Component.MethodOption,
  { feedCtl: Feed<OpsOrder, View> | null; tab: OpsStatus },
  true
>({
  data: {
    gate: 'loading',
    errorText: '',
    kitchenName: '',
    tabs: TABS,
    emptyTitle: EMPTY.pending.title,
    emptyHint: EMPTY.pending.hint,
    feed: emptyFeed<View>(),
  },
  methods: {
    onLoad() {
      this.feedCtl = null
      this.tab = 'pending'
      void this.openKitchen()
    },
    async openKitchen() {
      const mine = await call('kitchen.mine', {})
      if (!mine.ok || !mine.data.kitchen) {
        if (!mine.ok && mine.code !== 'NO_KITCHEN') {
          this.setData({ gate: 'error', errorText: mine.message })
          return
        }
        wx.redirectTo({ url: PAGE_KITCHEN_CREATE })
        return
      }
      this.setData({ gate: 'ready', errorText: '', kitchenName: mine.data.kitchen.name })
      if (!this.feedCtl) this.openTab('pending')
    },
    onShow() {
      if (this.feedCtl) this.feedCtl.refreshIfStale(8000)
    },
    onUnload() {
      if (this.feedCtl) this.feedCtl.dispose()
    },
    openTab(tab: OpsStatus) {
      if (this.feedCtl) this.feedCtl.dispose()
      this.tab = tab
      const copy = EMPTY[tab]
      this.setData({
        tabs: TABS.map((t) => ({ ...t, on: t.key === tab })),
        emptyTitle: copy.title,
        emptyHint: copy.hint,
        feed: emptyFeed<View>(),
      })
      this.feedCtl = new Feed<OpsOrder, View>({
        host: this,
        path: 'feed',
        fetch: (cursor) => call('kitchen.ops', { status: tab, cursor }),
        view: (item) => ({
          id: item.id,
          lines: linesOf(item),
          note: item.note ? `备注：${item.note}` : '',
          time: dateTime(item.createdAtMs),
          statusLabel: item.statusLabel,
          statusClass: orderStatusClass(item.status),
          ordererName: item.ordererName,
          ordererAvatar: item.ordererAvatar,
          initial: item.ordererName.slice(0, 1),
          action: item.canAccept ? '接单' : item.canComplete ? '完成' : '',
        }),
      })
      this.feedCtl.start()
    },
    onPickTab(e: WechatMiniprogram.TouchEvent) {
      const key = String(e.currentTarget.dataset.key || '') as OpsStatus
      if (!EMPTY[key] || key === this.tab) return
      this.openTab(key)
    },
    onRefresh() {
      if (this.feedCtl) void this.feedCtl.refresh(true)
    },
    onLoadMore() {
      if (this.feedCtl) void this.feedCtl.loadMore()
    },
    async onAction(e: WechatMiniprogram.TouchEvent) {
      const id = String(e.currentTarget.dataset.id || '')
      const item = this.feedCtl ? this.feedCtl.find(id) : undefined
      if (!item || !this.feedCtl) return
      const r = item.canAccept
        ? await callOrToast('kitchen.accept', { id })
        : item.canComplete
          ? await callOrToast('kitchen.complete', { id })
          : null
      if (r) this.feedCtl.remove(id)
    },
    onMenu() {
      wx.navigateTo({ url: PAGE_KITCHEN_MENU })
    },
    async onRename() {
      const name = await renameKitchen(this.data.kitchenName)
      if (name) this.setData({ kitchenName: name })
    },
  },
})
