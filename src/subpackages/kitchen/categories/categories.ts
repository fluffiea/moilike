import type { KitchenCategory } from '../../../types/api'
import { call, callOrToast } from '../../../core/api'
import { PAGE_KITCHEN_CREATE } from '../../../core/paths'
import { confirm, promptText, toast } from '../../../core/ui'

type Row = KitchenCategory & { meta: string }

Component<{ loading: boolean; rows: Row[] }, {}, WechatMiniprogram.Component.MethodOption, {}, true>({
  data: { loading: true, rows: [] },
  methods: {
    onShow() {
      void this.reload()
    },
    async reload() {
      const r = await call('kitchen.categories', {})
      if (!r.ok) {
        toast(r.message)
        this.setData({ loading: false })
        if (r.code === 'NO_KITCHEN') wx.redirectTo({ url: PAGE_KITCHEN_CREATE })
        return
      }
      this.setData({
        loading: false,
        rows: r.data.categories.map((c) => ({
          ...c,
          meta: c.dishCount > 0 ? `含 ${c.dishCount} 道菜` : '空分类，可删除',
        })),
      })
    },
    async onAdd() {
      const raw = await promptText({ title: '新增分类', placeholder: '例如心意' })
      if (raw == null) return
      const name = raw.trim()
      if (!name) {
        toast('先写分类名')
        return
      }
      if (name.length > 8) {
        toast('分类名最多 8 个字')
        return
      }
      const r = await callOrToast('kitchen.createCategory', { name })
      if (r) void this.reload()
    },
    async onRename(e: WechatMiniprogram.TouchEvent) {
      const id = String(e.currentTarget.dataset.id || '')
      const row = this.data.rows.find((c) => c.id === id)
      if (!row) return
      const raw = await promptText({ title: '分类改名', value: row.name })
      if (raw == null) return
      const name = raw.trim()
      if (!name) {
        toast('先写分类名')
        return
      }
      if (name.length > 8) {
        toast('分类名最多 8 个字')
        return
      }
      const r = await callOrToast('kitchen.renameCategory', { id, name })
      if (r) void this.reload()
    },
    async onRemove(e: WechatMiniprogram.TouchEvent) {
      const id = String(e.currentTarget.dataset.id || '')
      const row = this.data.rows.find((c) => c.id === id)
      if (!row) return
      if (row.dishCount > 0) {
        toast('还有菜品，不能删除')
        return
      }
      const yes = await confirm({ title: '删除这个分类？', content: '空分类删除后不能恢复。', confirmText: '删除', danger: true })
      if (!yes) return
      const r = await call('kitchen.removeCategory', { id })
      if (!r.ok) {
        toast(r.message)
        return
      }
      void this.reload()
    },
  },
})
