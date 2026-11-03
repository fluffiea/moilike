import type { ReportFilter } from '../../../types/api'
import { call } from '../../../core/api'
import { normalizeReportFilter } from '../../../core/format'
import { getUser, setUser } from '../../../core/store'
import { toast } from '../../../core/ui'

const OPTIONS: { value: ReportFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'await_me', label: '待我回应' },
  { value: 'mine', label: '我发的' },
]

Component<{ options: typeof OPTIONS; index: number }, {}, WechatMiniprogram.Component.MethodOption, { saving: boolean }, true>({
  data: { options: OPTIONS, index: 1 },
  methods: {
    onLoad() {
      this.saving = false
      const u = getUser()
      if (u) {
        const index = OPTIONS.findIndex((o) => o.value === normalizeReportFilter(u.preferences.resonanceReportFilter))
        this.setData({ index: index < 0 ? 1 : index })
      }
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
