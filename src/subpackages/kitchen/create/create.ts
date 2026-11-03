import { call, callOrToast } from '../../../core/api'
import { PAGE_KITCHEN_MENU, PAGE_KITCHEN_OPS } from '../../../core/paths'
import { toast } from '../../../core/ui'

type Phase = 'loading' | 'error' | 'form'

Component<{ phase: Phase; errorText: string; name: string; submitting: boolean }, {}, WechatMiniprogram.Component.MethodOption, {}, true>({
  data: { phase: 'loading', errorText: '', name: '', submitting: false },
  methods: {
    onLoad() {
      void this.prepare()
    },
    async prepare() {
      const mine = await call('kitchen.mine', {})
      if (mine.ok && mine.data.kitchen) {
        wx.redirectTo({ url: PAGE_KITCHEN_OPS })
        return
      }
      if (!mine.ok) {
        this.setData({ phase: 'error', errorText: mine.message })
        return
      }
      this.setData({ phase: 'form', errorText: '' })
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
