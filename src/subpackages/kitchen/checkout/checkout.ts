import { callOrToast } from '../../../core/api'
import { cartState, clearCart, setLineQty } from '../../../core/cart'
import { PAGE_KITCHEN_ORDERS } from '../../../core/paths'
import { toast } from '../../../core/ui'

const LEAVE = '备注还没提交，离开后会丢掉这句。'

type Row = { key: string; name: string; quantity: number; tagText: string }

function alertLeave(on: boolean) {
  if (on) {
    if (typeof wx.enableAlertBeforeUnload === 'function') wx.enableAlertBeforeUnload({ message: LEAVE })
    return
  }
  if (typeof wx.disableAlertBeforeUnload === 'function') wx.disableAlertBeforeUnload()
}

Component<
  { rows: Row[]; portions: number; note: string; leaveHint: string; submitting: boolean; preview: boolean },
  {},
  WechatMiniprogram.Component.MethodOption,
  {},
  true
>({
  data: { rows: [], portions: 0, note: '', leaveHint: '', submitting: false, preview: false },
  methods: {
    onLoad(q: Record<string, string | undefined>) {
      this.setData({ preview: q.preview === '1' })
      this.paint()
      if (!cartState().lines.length) wx.navigateBack()
    },
    onUnload() {
      alertLeave(false)
    },
    paint() {
      const lines = cartState().lines
      this.setData({
        portions: lines.reduce((n, l) => n + l.quantity, 0),
        rows: lines.map((l) => ({
          key: l.key,
          name: l.name,
          quantity: l.quantity,
          tagText: l.tags.join('、'),
        })),
      })
    },
    onStep(e: WechatMiniprogram.TouchEvent) {
      const key = String(e.currentTarget.dataset.key || '')
      const dir = Number(e.currentTarget.dataset.dir) || 0
      const row = this.data.rows.find((r) => r.key === key)
      if (!row) return
      setLineQty(key, row.quantity + dir)
      if (!cartState().lines.length) {
        alertLeave(false)
        wx.navigateBack()
        return
      }
      this.paint()
    },
    onNote(e: WechatMiniprogram.Input) {
      const note = e.detail.value
      const leaveHint = note.trim() ? LEAVE : ''
      if (leaveHint !== this.data.leaveHint) alertLeave(!!leaveHint)
      this.setData({ note, leaveHint })
    },
    async onSubmit() {
      if (this.data.preview) {
        toast('这是自己的厨房，不能下单')
        return
      }
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
      alertLeave(false)
      this.setData({ leaveHint: '' })
      clearCart()
      wx.redirectTo({ url: PAGE_KITCHEN_ORDERS })
    },
  },
})
