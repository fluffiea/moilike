import type { MenuDish, PartnerMenu } from '../../types/api'
import { call } from '../../core/api'
import { addLine, cartState, clearCart, consumeOpenCart, setLineQty, useKitchen } from '../../core/cart'
import { charsOf, QUICK_TAGS } from '../../core/kitchen'
import { PAGE_KITCHEN_CHECKOUT, PAGE_KITCHEN_ORDERS, PAGE_LOGIN } from '../../core/paths'
import { getUser, isRegistered } from '../../core/store'
import { confirm, toast } from '../../core/ui'

type Scene = 'loading' | 'error' | PartnerMenu['scene']
type Cat = { id: string; name: string; chars: string[]; on: boolean }
type DishRow = { id: string; name: string; desc: string; cover: string; sales: string; categoryId: string; cat: string }
type SpecTag = { name: string; on: boolean }
type CartRow = { key: string; name: string; cover: string; quantity: number; tagText: string }
type Spec = { id: string; name: string; desc: string; cover: string; quantity: number; tags: SpecTag[] }

function rowsOf(dishes: MenuDish[], categories: { id: string; name: string }[]): DishRow[] {
  const names = new Map(categories.map((c) => [c.id, c.name]))
  return dishes.map((d) => ({
    id: d.id,
    name: d.name,
    desc: d.desc,
    cover: d.cover ? d.cover.thumb : '',
    sales: d.salesLabel,
    categoryId: d.categoryId,
    cat: names.get(d.categoryId) || '',
  }))
}

Component<
  {
    scene: Scene
    errorText: string
    refreshing: boolean
    kitchenName: string
    categories: Cat[]
    dishes: DishRow[]
    catEmpty: boolean
    cartPortions: number
    cartOpen: boolean
    specOpen: boolean
    spec: Spec
    cartLines: CartRow[]
  },
  {},
  WechatMiniprogram.Component.MethodOption,
  { kitchenId: string; allDishes: DishRow[]; activeId: string },
  true
>({
  data: {
    scene: 'loading',
    errorText: '',
    refreshing: false,
    kitchenName: '',
    categories: [],
    dishes: [],
    catEmpty: false,
    cartPortions: 0,
    cartOpen: false,
    specOpen: false,
    spec: { id: '', name: '', desc: '', cover: '', quantity: 1, tags: [] },
    cartLines: [],
  },
  methods: {
    onLoad() {
      this.kitchenId = ''
      this.allDishes = []
      this.activeId = ''
      if (!isRegistered(getUser())) wx.reLaunch({ url: PAGE_LOGIN })
    },
    onShow() {
      if (!isRegistered(getUser())) return
      void this.reload(consumeOpenCart())
    },
    async onRefresh() {
      this.setData({ refreshing: true })
      await this.reload(false)
    },
    async reload(openCart: boolean) {
      const r = await call('kitchen.partner', {})
      if (!r.ok) {
        this.setData({ scene: 'error', errorText: r.message, refreshing: false })
        return
      }
      this.apply(r.data, openCart)
    },
    apply(menu: PartnerMenu, openCart: boolean) {
      if (menu.scene === 'unpaired' || menu.scene === 'no_kitchen') clearCart()
      this.kitchenId = menu.kitchen ? menu.kitchen.id : ''
      if (this.kitchenId) useKitchen(this.kitchenId)
      this.allDishes = rowsOf(menu.dishes, menu.categories)
      const active = this.pickActive(menu)
      this.activeId = active
      const dishes = this.rowsFor(active)
      this.setData({
        scene: menu.scene,
        errorText: '',
        refreshing: false,
        kitchenName: menu.kitchen ? menu.kitchen.name : '',
        categories: menu.categories.map((c) => ({ id: c.id, name: c.name, chars: charsOf(c.name), on: c.id === active })),
        dishes,
        catEmpty: menu.scene === 'menu' && dishes.length === 0,
        specOpen: openCart ? false : this.data.specOpen,
      })
      this.syncCart(openCart)
    },
    pickActive(menu: PartnerMenu): string {
      if (menu.scene !== 'menu') return ''
      const ids = menu.categories.map((c) => c.id)
      if (this.activeId && ids.includes(this.activeId)) return this.activeId
      const hit = menu.categories.find((c) => menu.dishes.some((d) => d.categoryId === c.id))
      return hit ? hit.id : menu.categories.length ? menu.categories[0].id : ''
    },
    rowsFor(categoryId: string): DishRow[] {
      if (!this.allDishes) return []
      return this.allDishes.filter((d) => d.categoryId === categoryId)
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
          tagText: l.tags.join('、'),
        })),
        cartOpen: portions > 0 && (forceOpen || this.data.cartOpen),
      })
    },
    onPickCat(e: WechatMiniprogram.TouchEvent) {
      const id = String(e.currentTarget.dataset.id || '')
      this.activeId = id
      const dishes = this.rowsFor(id)
      this.setData({
        categories: this.data.categories.map((c) => ({ ...c, on: c.id === id })),
        dishes,
        catEmpty: dishes.length === 0,
      })
    },
    onOpenSpec(e: WechatMiniprogram.TouchEvent) {
      const id = String(e.currentTarget.dataset.id || '')
      const dish = this.allDishes.find((d) => d.id === id)
      if (!dish) return
      this.setData({
        specOpen: true,
        cartOpen: false,
        spec: {
          id: dish.id,
          name: dish.name,
          desc: dish.desc,
          cover: dish.cover,
          quantity: 1,
          tags: QUICK_TAGS.map((name) => ({ name, on: false })),
        },
      })
    },
    onSpecStep(e: WechatMiniprogram.TouchEvent) {
      const dir = Number(e.currentTarget.dataset.dir) || 0
      const quantity = Math.min(99, Math.max(1, this.data.spec.quantity + dir))
      this.setData({ 'spec.quantity': quantity })
    },
    onToggleTag(e: WechatMiniprogram.TouchEvent) {
      const name = String(e.currentTarget.dataset.name || '')
      this.setData({
        'spec.tags': this.data.spec.tags.map((t) => (t.name === name ? { name: t.name, on: !t.on } : t)),
      })
    },
    onAddSpec() {
      const spec = this.data.spec
      const added = addLine({
        kitchenId: this.kitchenId,
        dishId: spec.id,
        name: spec.name,
        cover: spec.cover,
        quantity: spec.quantity,
        tags: spec.tags.filter((t) => t.on).map((t) => t.name),
      })
      if (!added) {
        toast('一次最多 30 行')
        return
      }
      this.setData({ specOpen: false })
      this.syncCart()
    },
    onOpenCart() {
      if (!this.data.cartPortions) return
      this.setData({ cartOpen: true, specOpen: false })
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
      this.setData({ cartOpen: false, specOpen: false })
      wx.navigateTo({ url: PAGE_KITCHEN_CHECKOUT })
    },
    onOrders() {
      wx.navigateTo({ url: PAGE_KITCHEN_ORDERS })
    },
    onCloseSpec() {
      this.setData({ specOpen: false })
    },
    onCloseCart() {
      this.setData({ cartOpen: false })
    },
    noop() {},
  },
})
