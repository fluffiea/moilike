import type { KitchenDish } from '../../../types/api'
import { call } from '../../../core/api'
import { renameKitchen } from '../../../core/kitchen'
import { PAGE_KITCHEN_CATEGORIES, PAGE_KITCHEN_CREATE, PAGE_KITCHEN_DISH } from '../../../core/paths'
import { toast } from '../../../core/ui'

type Row = { id: string; name: string; desc: string; cover: string; shelf: string; off: boolean }
type Group = { id: string; name: string; dishes: Row[] }
type Status = 'loading' | 'error' | 'ready'

function toRow(d: KitchenDish): Row {
  return {
    id: d.id,
    name: d.name,
    desc: d.desc,
    cover: d.cover ? d.cover.thumb : '',
    shelf: d.onShelf ? '上架中' : '已下架',
    off: !d.onShelf,
  }
}

Component<
  { status: Status; errorText: string; kitchenName: string; groups: Group[]; empty: boolean },
  {},
  WechatMiniprogram.Component.MethodOption,
  {},
  true
>({
  data: { status: 'loading', errorText: '', kitchenName: '', groups: [], empty: false },
  methods: {
    onLoad() {
      void this.reload()
    },
    onShow() {
      if (this.data.status !== 'loading') void this.reload()
    },
    async reload() {
      const board = await call('kitchen.dishes', {})
      if (!board.ok) {
        if (board.code === 'NO_KITCHEN') {
          wx.redirectTo({ url: PAGE_KITCHEN_CREATE })
          return
        }
        if (this.data.status === 'ready') toast(board.message)
        else this.setData({ status: 'error', errorText: board.message })
        return
      }
      const groups = board.data.categories
        .map((c) => ({
          id: c.id,
          name: c.name,
          dishes: board.data.dishes.filter((d) => d.categoryId === c.id).map(toRow),
        }))
        .filter((g) => g.dishes.length > 0)
      this.setData({
        status: 'ready',
        errorText: '',
        kitchenName: board.data.kitchen.name,
        groups,
        empty: board.data.dishes.length === 0,
      })
    },
    async onRename() {
      const name = await renameKitchen(this.data.kitchenName)
      if (name) this.setData({ kitchenName: name })
    },
    onCategories() {
      wx.navigateTo({ url: PAGE_KITCHEN_CATEGORIES })
    },
    onCreate() {
      wx.navigateTo({ url: PAGE_KITCHEN_DISH })
    },
    onOpen(e: WechatMiniprogram.TouchEvent) {
      wx.navigateTo({ url: `${PAGE_KITCHEN_DISH}?id=${e.currentTarget.dataset.id}` })
    },
  },
})
