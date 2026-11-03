import { callOrToast } from '../../../core/api'
import { cartState, clearCart, setLineQty } from '../../../core/cart'
import { PAGE_KITCHEN_ORDERS } from '../../../core/paths'
import { toast } from '../../../core/ui'

type Row = { key: string; name: string; quantity: number }

Component<{ rows: Row[]; note: string; submitting: boolean }, {}, WechatMiniprogram.Component.MethodOption, {}, true>({
  data: { rows: [], note: '', submitting: false },
  methods: {
    onLoad() {
      this.paint()
      if (!cartState().lines.length) wx.navigateBack()
    },
    paint() {
      const lines = cartState().lines
      this.setData({
        rows: lines.map((l) => ({ key: l.key, name: l.name, quantity: l.quantity })),
      })
    },
    onStep(e: WechatMiniprogram.TouchEvent) {
      const key = String(e.currentTarget.dataset.key || '')
      const dir = Number(e.currentTarget.dataset.dir) || 0
      const row = this.data.rows.find((r) => r.key === key)
      if (!row) return
      setLineQty(key, row.quantity + dir)
      this.paint()
      if (!cartState().lines.length) wx.navigateBack()
    },
    onNote(e: WechatMiniprogram.Input) {
      this.setData({ note: e.detail.value })
    },
    async onSubmit() {
      if (this.data.submitting) return
      const lines = cartState().lines
      if (!lines.length) {
        toast('购物车是空的')
        return
      }
      this.setData({ submitting: true })
      const r = await callOrToast('kitchen.orderCreate', {
        items: lines.map((l) => ({ dishId: l.dishId, quantity: l.quantity, tags: l.tags })),
        note: this.data.note.trim(),
      })
      this.setData({ submitting: false })
      if (!r) return
      clearCart()
      wx.redirectTo({ url: PAGE_KITCHEN_ORDERS })
    },
  },
})
