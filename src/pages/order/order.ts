import type { KitchenCategory, KitchenDish, MenuDish, PartnerMenu } from '../../types/api'
import { call } from '../../core/api'
import { addLine, cartState, clearCart, consumeOpenCart, setLineQty, useKitchen } from '../../core/cart'
import { PAGE_KITCHEN_CHECKOUT, PAGE_KITCHEN_MENU, PAGE_KITCHEN_ORDERS, PAGE_LOGIN, PAGE_PARTNER_HUB } from '../../core/paths'
import { getUser, isRegistered } from '../../core/store'
import { confirm, toast } from '../../core/ui'

type Scene = 'loading' | 'error' | PartnerMenu['scene']
type Cat = { id: string; name: string; on: boolean }
type DishRow = { id: string; name: string; desc: string; cover: string; sales: string }
type Section = { id: string; name: string; dishes: DishRow[]; empty: boolean }
type CartRow = { key: string; name: string; cover: string; quantity: number }
type Offset = { id: string; top: number }

/** 点分类后短锁，避免滚动动画中途把左栏高亮抢回去 */
const SCROLL_LOCK_MS = 300

/** 用自己的上架菜拼成和对方菜单一样的结构，好在点单页里看效果 */
function menuOfMine(kitchen: { id: string; name: string }, categories: KitchenCategory[], dishes: KitchenDish[]): PartnerMenu {
  const onShelf = dishes.filter((d) => d.onShelf)
  const brief = { id: kitchen.id, name: kitchen.name }
  if (!onShelf.length) return { scene: 'empty', kitchen: brief, categories: [], dishes: [] }
  return {
    scene: 'menu',
    kitchen: brief,
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
    dishes: onShelf.map((d) => ({
      id: d.id,
      categoryId: d.categoryId,
      name: d.name,
      desc: d.desc,
      cover: d.cover,
      doneCount: d.doneCount || 0,
      salesLabel: d.salesLabel || '',
    })),
  }
}

function dishRow(d: MenuDish): DishRow {
  return {
    id: d.id,
    name: d.name,
    desc: d.desc,
    cover: d.cover ? d.cover.thumb : '',
    sales: d.salesLabel,
  }
}

function sectionsOf(categories: { id: string; name: string }[], dishes: MenuDish[]): Section[] {
  return categories.map((c) => {
    const rows = dishes.filter((d) => d.categoryId === c.id).map(dishRow)
    return { id: c.id, name: c.name, dishes: rows, empty: rows.length === 0 }
  })
}

Component<
  {
    scene: Scene
    errorText: string
    refreshing: boolean
    kitchenName: string
    categories: Cat[]
    sections: Section[]
    keyword: string
    searching: boolean
    searchHits: DishRow[]
    searchEmpty: boolean
    scrollInto: string
    railInto: string
    cartPortions: number
    cartOpen: boolean
    cartLines: CartRow[]
    mine: boolean
  },
  {},
  WechatMiniprogram.Component.MethodOption,
  {
    kitchenId: string
    allDishes: DishRow[]
    activeId: string
    mine: boolean
    offsets: Offset[]
    scrollTop: number
    listHeight: number
    lockUntil: number
    keyword: string
    measuring: boolean
    measureQueued: boolean
    loadSeq: number
  },
  true
>({
  data: {
    scene: 'loading',
    errorText: '',
    refreshing: false,
    kitchenName: '',
    categories: [],
    sections: [],
    keyword: '',
    searching: false,
    searchHits: [],
    searchEmpty: false,
    scrollInto: '',
    railInto: '',
    cartPortions: 0,
    cartOpen: false,
    cartLines: [],
    mine: false,
  },
  methods: {
    onLoad() {
      this.kitchenId = ''
      this.allDishes = []
      this.activeId = ''
      this.mine = false
      this.offsets = []
      this.scrollTop = 0
      this.listHeight = 0
      this.lockUntil = 0
      this.keyword = ''
      this.measuring = false
      this.measureQueued = false
      this.loadSeq = 0
      if (!isRegistered(getUser())) wx.reLaunch({ url: PAGE_LOGIN })
    },
    onShow() {
      if (!isRegistered(getUser())) return
      const openCart = consumeOpenCart()
      if (openCart) this.mine = false
      if (this.data.mine !== this.mine) {
        this.keyword = ''
        this.setData({ mine: this.mine, keyword: '', searching: false, searchHits: [], searchEmpty: false })
      }
      void this.reload(openCart)
    },
    async onRefresh() {
      this.setData({ refreshing: true })
      await this.reload(false)
    },
    async reload(openCart: boolean) {
      const seq = this.loadSeq + 1
      this.loadSeq = seq
      const stale = () => seq !== this.loadSeq
      if (this.mine) {
        const r = await call('kitchen.dishes', { withSales: true })
        if (stale()) return
        if (!r.ok) {
          if (r.code === 'NO_KITCHEN') {
            this.apply({ scene: 'no_kitchen', kitchen: null, categories: [], dishes: [] }, false)
            return
          }
          this.showLoadError(r.message)
          return
        }
        this.apply(menuOfMine(r.data.kitchen, r.data.categories, r.data.dishes), openCart)
        return
      }
      const r = await call('kitchen.partner', {})
      if (stale()) return
      if (!r.ok) {
        this.showLoadError(r.message)
        return
      }
      this.apply(r.data, openCart)
    },
    showLoadError(message: string) {
      if (this.data.scene === 'menu' || this.data.scene === 'empty') {
        this.setData({ refreshing: false })
        toast(message)
        return
      }
      this.setData({ scene: 'error', errorText: message, refreshing: false })
    },
    onToggleMine() {
      this.mine = !this.mine
      this.activeId = ''
      this.scrollTop = 0
      this.offsets = []
      this.keyword = ''
      this.setData({
        mine: this.mine,
        cartOpen: false,
        keyword: '',
        searching: false,
        searchHits: [],
        searchEmpty: false,
        scrollInto: '',
      })
      void this.reload(false)
    },
    apply(menu: PartnerMenu, openCart: boolean) {
      if (menu.scene === 'unpaired' || menu.scene === 'no_kitchen') clearCart()
      this.kitchenId = menu.kitchen ? menu.kitchen.id : ''
      if (this.kitchenId) useKitchen(this.kitchenId)
      this.allDishes = menu.dishes.map(dishRow)
      const active = this.pickActive(menu)
      this.activeId = active
      const categories = menu.categories.map((c) => ({ id: c.id, name: c.name, on: c.id === active }))
      const index = categories.findIndex((c) => c.on)
      if (menu.scene !== 'menu') this.keyword = ''
      const search = this.searchState(menu.scene)
      this.setData(
        {
          scene: menu.scene,
          errorText: '',
          refreshing: false,
          kitchenName: menu.kitchen ? menu.kitchen.name : '',
          categories,
          sections: menu.scene === 'menu' ? sectionsOf(menu.categories, menu.dishes) : [],
          keyword: this.keyword,
          railInto: index >= 0 ? `rail-${index}` : '',
          scrollInto: '',
          ...search,
        },
        () => {
          if (!search.searching) this.measureSections()
        },
      )
      this.syncCart(openCart)
    },
    pickActive(menu: PartnerMenu): string {
      if (menu.scene !== 'menu') return ''
      const ids = menu.categories.map((c) => c.id)
      if (this.activeId && ids.includes(this.activeId)) return this.activeId
      return ids[0] || ''
    },
    searchState(scene: Scene): { searching: boolean; searchHits: DishRow[]; searchEmpty: boolean } {
      const q = this.keyword.trim().toLowerCase()
      if (!q || scene !== 'menu') return { searching: false, searchHits: [], searchEmpty: false }
      const searchHits = this.allDishes.filter((d) => d.name.toLowerCase().includes(q))
      return { searching: true, searchHits, searchEmpty: searchHits.length === 0 }
    },
    refilter() {
      const search = this.searchState(this.data.scene)
      this.setData(search, () => {
        if (!search.searching) this.measureSections()
      })
    },
    onSearch(e: WechatMiniprogram.Input) {
      this.keyword = e.detail.value
      this.setData({ keyword: this.keyword }, () => this.refilter())
    },
    onClearSearch() {
      this.keyword = ''
      this.setData({ keyword: '' }, () => this.refilter())
    },
    measureSections() {
      if (this.data.searching || this.data.scene !== 'menu') {
        this.offsets = []
        this.measureQueued = false
        return
      }
      if (this.measuring) {
        this.measureQueued = true
        return
      }
      this.measuring = true
      wx.nextTick(() => {
        const query = this.createSelectorQuery()
        query.select('.list').boundingClientRect()
        query.select('.list').scrollOffset()
        query.selectAll('.sec').boundingClientRect()
        query.exec((res: unknown[]) => {
          this.measuring = false
          if (this.measureQueued) {
            this.measureQueued = false
            this.measureSections()
            return
          }
          if (this.data.searching || this.data.scene !== 'menu') return
          const box = res[0] as WechatMiniprogram.BoundingClientRectCallbackResult | null
          const scrolled = res[1] as WechatMiniprogram.ScrollOffsetCallbackResult | null
          const secs = Array.isArray(res[2]) ? (res[2] as WechatMiniprogram.BoundingClientRectCallbackResult[]) : []
          if (!box || !box.height || !secs.length) {
            this.offsets = []
            return
          }
          const scrollTop = scrolled ? scrolled.scrollTop : 0
          this.scrollTop = scrollTop
          this.listHeight = box.height
          const sections = this.data.sections
          this.offsets = secs
            .map((r, i) => ({
              id: sections[i] ? sections[i].id : '',
              top: scrollTop + r.top - box.top,
            }))
            .filter((o) => o.id)
          if (Date.now() < this.lockUntil) return
          this.syncActive(scrollTop)
        })
      })
    },
    syncActive(scrollTop: number) {
      const offsets = this.offsets
      if (!offsets.length) return
      const y = scrollTop + 16
      let active = offsets[0].id
      for (const o of offsets) {
        if (y >= o.top) active = o.id
        else break
      }
      this.markActive(active)
    },
    markActive(id: string) {
      if (!id || id === this.activeId) return
      this.activeId = id
      const categories = this.data.categories.map((c) => ({ ...c, on: c.id === id }))
      const index = categories.findIndex((c) => c.on)
      this.setData({ categories, railInto: index >= 0 ? `rail-${index}` : '' })
    },
    onPickCat(e: WechatMiniprogram.TouchEvent) {
      if (this.data.searching) return
      const id = String(e.currentTarget.dataset.id || '')
      const index = this.data.categories.findIndex((c) => c.id === id)
      if (index < 0) return
      this.activeId = id
      const token = `sec-${index}`
      const arm = () => {
        this.lockUntil = Date.now() + SCROLL_LOCK_MS
      }
      arm()
      this.setData(
        {
          categories: this.data.categories.map((c) => ({ ...c, on: c.id === id })),
          railInto: `rail-${index}`,
          scrollInto: this.data.scrollInto === token ? '' : token,
        },
        () => {
          arm()
          if (this.data.scrollInto !== token) this.setData({ scrollInto: token })
        },
      )
    },
    onListScroll(e: WechatMiniprogram.ScrollViewScroll) {
      const scrollTop = e.detail.scrollTop
      this.scrollTop = scrollTop
      if (!this.offsets.length) {
        this.measureSections()
        return
      }
      if (Date.now() < this.lockUntil) return
      const height = this.listHeight
      const last = this.offsets[this.offsets.length - 1]
      const maxScroll = e.detail.scrollHeight - height
      if (last && height > 0 && maxScroll > 0 && last.top > maxScroll && scrollTop >= maxScroll - 8) {
        this.markActive(last.id)
        return
      }
      this.syncActive(scrollTop)
    },
    onAdd(e: WechatMiniprogram.TouchEvent) {
      const id = String(e.currentTarget.dataset.id || '')
      const dish = this.allDishes.find((d) => d.id === id)
      if (!dish || !this.kitchenId) return
      const added = addLine({
        kitchenId: this.kitchenId,
        dishId: dish.id,
        name: dish.name,
        cover: dish.cover,
        quantity: 1,
      })
      if (!added) {
        toast('一次最多 30 行')
        return
      }
      this.syncCart()
    },
    syncCart(forceOpen = false) {
      const cart = cartState()
      if (this.kitchenId && cart.kitchenId && cart.kitchenId !== this.kitchenId) clearCart()
      const current = cartState().lines
      const portions = current.reduce((n, l) => n + l.quantity, 0)
      this.setData({
        cartPortions: portions,
        cartLines: current.map((l) => ({
          key: l.key,
          name: l.name,
          cover: l.cover,
          quantity: l.quantity,
        })),
        cartOpen: portions > 0 && (forceOpen || this.data.cartOpen),
      })
    },
    onOpenCart() {
      if (!this.data.cartPortions) return
      this.setData({ cartOpen: true })
    },
    onCartStep(e: WechatMiniprogram.TouchEvent) {
      const key = String(e.currentTarget.dataset.key || '')
      const dir = Number(e.currentTarget.dataset.dir) || 0
      const line = this.data.cartLines.find((l) => l.key === key)
      if (!line) return
      setLineQty(key, line.quantity + dir)
      this.syncCart()
    },
    async onClearCart() {
      const yes = await confirm({ title: '清空购物车？', content: '已选的心意会从购物车拿掉。', confirmText: '清空' })
      if (!yes) return
      clearCart()
      if (this.kitchenId) useKitchen(this.kitchenId)
      this.syncCart()
    },
    onCheckout() {
      if (!cartState().lines.length) return
      this.setData({ cartOpen: false })
      wx.navigateTo({ url: this.mine ? `${PAGE_KITCHEN_CHECKOUT}?preview=1` : PAGE_KITCHEN_CHECKOUT })
    },
    onOrders() {
      wx.navigateTo({ url: PAGE_KITCHEN_ORDERS })
    },
    onPartner() {
      wx.navigateTo({ url: PAGE_PARTNER_HUB })
    },
    onManageMenu() {
      wx.navigateTo({ url: PAGE_KITCHEN_MENU })
    },
    onCloseCart() {
      this.setData({ cartOpen: false })
    },
    noop() {},
  },
})
