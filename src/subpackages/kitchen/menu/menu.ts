import type { KitchenDish } from '../../../types/api'
import { call, callOrToast } from '../../../core/api'
import { PAGE_KITCHEN_CATEGORIES, PAGE_KITCHEN_CREATE, PAGE_KITCHEN_DISH } from '../../../core/paths'
import { promptText, toast } from '../../../core/ui'

type Row = { id: string; name: string; desc: string; cover: string; shelf: string }
type Group = { id: string; name: string; dishes: Row[] }

function toRow(d: KitchenDish): Row {
  return {
    id: d.id,
    name: d.name,
    desc: d.desc,
    cover: d.cover ? d.cover.thumb : '',
    shelf: d.onShelf ? '上架' : '下架',
  }
}

Component<
  { loading: boolean; kitchenName: string; groups: Group[]; empty: boolean },
  {},
  WechatMiniprogram.Component.MethodOption,
  {},
  true
>({
  data: { loading: true, kitchenName: '', groups: [], empty: false },
  methods: {
    onLoad() {
      void this.reload()
    },
    onShow() {
      if (!this.data.loading) void this.reload()
    },
    async reload() {
      const [mine, cats, dishes] = await Promise.all([
        call('kitchen.mine', {}),
        call('kitchen.categories', {}),
        call('kitchen.dishes', {}),
      ])
      if (!mine.ok || !cats.ok || !dishes.ok) {
        const message = !mine.ok ? mine.message : !cats.ok ? cats.message : !dishes.ok ? dishes.message : ''
        toast(message || '加载失败')
        this.setData({ loading: false })
        if ((mine.ok && !mine.data.kitchen) || (!mine.ok && mine.code === 'NO_KITCHEN')) {
          wx.redirectTo({ url: PAGE_KITCHEN_CREATE })
        }
        return
      }
      if (!mine.data.kitchen) {
        wx.redirectTo({ url: PAGE_KITCHEN_CREATE })
        return
      }
      const groups = cats.data.categories
        .map((c) => ({
          id: c.id,
          name: c.name,
          dishes: dishes.data.dishes.filter((d) => d.categoryId === c.id).map(toRow),
        }))
        .filter((g) => g.dishes.length > 0)
      this.setData({
        loading: false,
        kitchenName: mine.data.kitchen.name,
        groups,
        empty: dishes.data.dishes.length === 0,
      })
    },
    async onRename() {
      const raw = await promptText({ title: '厨房改名', placeholder: '例如阿柚的小厨房', value: this.data.kitchenName })
      if (raw == null) return
      const name = raw.trim()
      if (!name) {
        toast('先给厨房起个名字')
        return
      }
      const r = await callOrToast('kitchen.rename', { name })
      if (r) this.setData({ kitchenName: r.kitchen.name })
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
