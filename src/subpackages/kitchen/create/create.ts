import { call, callOrToast } from '../../../core/api'
import { PAGE_KITCHEN_MENU, PAGE_KITCHEN_OPS } from '../../../core/paths'
import { toast } from '../../../core/ui'

Component<{ ready: boolean; name: string; submitting: boolean }, {}, WechatMiniprogram.Component.MethodOption, {}, true>({
  data: { ready: false, name: '', submitting: false },
  methods: {
    async onLoad() {
      const mine = await call('kitchen.mine', {})
      if (mine.ok && mine.data.kitchen) {
        wx.redirectTo({ url: PAGE_KITCHEN_OPS })
        return
      }
      this.setData({ ready: true })
    },
    onName(e: WechatMiniprogram.Input) {
      this.setData({ name: e.detail.value })
    },
    async onCreate() {
      if (this.data.submitting) return
      const name = this.data.name.trim()
      if (!name) {
        toast('先给厨房起个名字')
        return
      }
      this.setData({ submitting: true })
      const r = await callOrToast('kitchen.create', { name })
      if (!r) {
        this.setData({ submitting: false })
        return
      }
      wx.redirectTo({ url: PAGE_KITCHEN_MENU })
    },
  },
})
