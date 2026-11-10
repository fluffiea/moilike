import type { KitchenCategory, KitchenDish, MenuDish, PartnerMenu } from '../../types/api'
import { call } from '../../core/api'
import { addLine, cartState, clearCart, consumeOpenCart, setLineQty, useKitchen } from '../../core/cart'
import { PAGE_KITCHEN_CHECKOUT, PAGE_KITCHEN_MENU, PAGE_KITCHEN_ORDERS, PAGE_LOGIN, PAGE_PARTNER_HUB } from '../../core/paths'
import { getUser, isRegistered } from '../../core/store'
import { confirm, toast } from '../../core/ui'

type Scene = 'loading' | 'error' | PartnerMenu['scene']
type Cat = { id: string; name: string; on: boolean }
type DishRow = { id: string; name: string; desc: string; cover: string; sales: string; initial: string; qty: number }
type Section = { id: string; name: string; dishes: DishRow[]; empty: boolean }
type CartRow = { key: string; name: string; cover: string; quantity: number; initial: string }
type Offset = { id: string; top: number }

/** 点分类后短锁，避免滚动动画中途把分类高亮抢回去 */
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
    initial: Array.from(d.name)[0] || '',
    qty: 0,
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
    scrollInto: string
    chipInto: string
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
    scrollInto: '',
    chipInto: '',
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
      this.measuring = false
      this.measureQueued = false
      this.loadSeq = 0
      if (!isRegistered(getUser())) wx.reLaunch({ url: PAGE_LOGIN })
    },
    onShow() {
      if (!isRegistered(getUser())) return
      const openCart = consumeOpenCart()
      if (openCart) this.mine = false
      if (this.data.mine !== this.mine) this.setData({ mine: this.mine })
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
    onPickSide(e: WechatMiniprogram.TouchEvent) {
      const mine = String(e.currentTarget.dataset.side || '') === 'mine'
      if (mine === this.mine) return
      this.mine = mine
      this.kitchenId = ''
      this.activeId = ''
      this.scrollTop = 0
      this.offsets = []
      this.setData({ mine, cartOpen: false, scrollInto: '', chipInto: '' })
      void this.reload(false)
    },
    apply(menu: PartnerMenu, openCart: boolean) {
      if (menu.scene !== 'menu') clearCart()
      this.kitchenId = menu.kitchen ? menu.kitchen.id : ''
      if (this.kitchenId) useKitchen(this.kitchenId)
      this.allDishes = menu.dishes.map(dishRow)
      const active = this.pickActive(menu)
      this.activeId = active
      const categories = menu.categories.map((c) => ({ id: c.id, name: c.name, on: c.id === active }))
      const index = categories.findIndex((c) => c.on)
      this.setData(
        {
          scene: menu.scene,
          errorText: '',
          refreshing: false,
          kitchenName: menu.kitchen ? menu.kitchen.name : '',
          categories,
          sections: menu.scene === 'menu' ? sectionsOf(menu.categories, menu.dishes) : [],
          chipInto: index >= 0 ? `cat-${index}` : '',
          scrollInto: '',
        },
        () => this.measureSections(),
      )
      this.syncCart(openCart)
    },
    pickActive(menu: PartnerMenu): string {
      if (menu.scene !== 'menu') return ''
      const ids = menu.categories.map((c) => c.id)
      if (this.activeId && ids.includes(this.activeId)) return this.activeId
      return ids[0] || ''
    },
    measureSections() {
      if (this.data.scene !== 'menu') {
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
          if (this.data.scene !== 'menu') return
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
      this.setData({ categories, chipInto: index >= 0 ? `cat-${index}` : '' })
    },
    onPickCat(e: WechatMiniprogram.TouchEvent) {
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
          chipInto: `cat-${index}`,
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
    onDishStep(e: WechatMiniprogram.TouchEvent) {
      const id = String(e.currentTarget.dataset.id || '')
      const dir = Number(e.currentTarget.dataset.dir) || 1
      if (!this.kitchenId) return
      const line = cartState().lines.find((l) => l.key === id)
      if (line) {
        setLineQty(line.key, line.quantity + (dir < 0 ? -1 : 1))
        this.syncCart()
        return
      }
      if (dir < 0) return
      const dish = this.allDishes.find((d) => d.id === id)
      if (!dish) return
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
      const qtyOf = new Map(current.map((l) => [l.dishId, l.quantity]))
      const sections = this.data.sections.map((s) => {
        let changed = false
        const dishes = s.dishes.map((d) => {
          const qty = qtyOf.get(d.id) || 0
          if (d.qty === qty) return d
          changed = true
          return { ...d, qty }
        })
        return changed ? { ...s, dishes } : s
      })
      this.setData({
        sections,
        cartPortions: portions,
        cartLines: current.map((l) => ({
          key: l.key,
          name: l.name,
          cover: l.cover,
          quantity: l.quantity,
          initial: Array.from(l.name)[0] || '',
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
