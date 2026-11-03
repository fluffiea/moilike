import type { KitchenCategory } from '../../../types/api'
import { call, callOrToast } from '../../../core/api'
import { askLimitedName, CATEGORY_NAME_MAX } from '../../../core/kitchen'
import { PAGE_KITCHEN_CREATE } from '../../../core/paths'
import { confirm, toast } from '../../../core/ui'

type Row = KitchenCategory & { meta: string }
type Status = 'loading' | 'error' | 'ready'

function askCategoryName(title: string, value = ''): Promise<string | null> {
  return askLimitedName({
    title,
    placeholder: '例如心意',
    value,
    max: CATEGORY_NAME_MAX,
    empty: '先写分类名',
    tooLong: '分类名最多 8 个字',
  })
}

Component<
  { status: Status; errorText: string; rows: Row[] },
  {},
  WechatMiniprogram.Component.MethodOption,
  {},
  true
>({
  data: { status: 'loading', errorText: '', rows: [] },
  methods: {
    onShow() {
      void this.reload()
    },
    async reload() {
      const r = await call('kitchen.categories', {})
      if (!r.ok) {
        if (r.code === 'NO_KITCHEN') {
          wx.redirectTo({ url: PAGE_KITCHEN_CREATE })
          return
        }
        if (this.data.status === 'ready') toast(r.message)
        else this.setData({ status: 'error', errorText: r.message })
        return
      }
      this.setData({
        status: 'ready',
        errorText: '',
        rows: r.data.categories.map((c) => ({
          ...c,
          meta: c.dishCount > 0 ? `含 ${c.dishCount} 道菜` : '空分类，可删除',
        })),
      })
    },
    async onAdd() {
      const name = await askCategoryName('新增分类')
      if (!name) return
      const r = await callOrToast('kitchen.createCategory', { name })
      if (r) void this.reload()
    },
    async onRename(e: WechatMiniprogram.TouchEvent) {
      const id = String(e.currentTarget.dataset.id || '')
      const row = this.data.rows.find((c) => c.id === id)
      if (!row) return
      const name = await askCategoryName('分类改名', row.name)
      if (!name) return
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
