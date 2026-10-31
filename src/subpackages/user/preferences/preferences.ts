import type { ReportFilter } from '../../../types/api'
import { call } from '../../../core/api'
import { getUser, setUser } from '../../../core/store'
import { toast } from '../../../core/ui'

const OPTIONS: { value: ReportFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'action_needed', label: '待处理' },
  { value: 'mine', label: '我的报备' },
]

Component<{ options: typeof OPTIONS; index: number }, {}, WechatMiniprogram.Component.MethodOption, { saving: boolean }, true>({
  data: { options: OPTIONS, index: 2 },
  methods: {
    onLoad() {
      this.saving = false
      const u = getUser()
      if (u) this.setData({ index: OPTIONS.findIndex((o) => o.value === u.preferences.resonanceReportFilter) })
    },

    /** 先切换再保存，失败回退 */
    async onPick(e: WechatMiniprogram.TouchEvent) {
      const index = Number(e.currentTarget.dataset.index)
      const prev = this.data.index
      if (index === prev || this.saving) return
      this.saving = true
      this.setData({ index })
      const r = await call('user.savePreferences', { preferences: { resonanceReportFilter: OPTIONS[index].value } })
      this.saving = false
      if (!r.ok) {
        this.setData({ index: prev })
        return toast(r.message)
      }
      setUser(r.data.user)
    },
  },
})
