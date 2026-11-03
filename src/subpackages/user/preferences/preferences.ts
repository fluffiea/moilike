import type { LedgerScope, ReportFilter, User } from '../../../types/api'
import { call } from '../../../core/api'
import { normalizeReportFilter } from '../../../core/format'
import { PAGE_LEDGER_VISIBILITY } from '../../../core/paths'
import { getUser, setUser } from '../../../core/store'
import { toast } from '../../../core/ui'

const SCOPE_LABEL: Record<LedgerScope, string> = {
  none: '不可见',
  summary: '仅汇总',
  detail: '全部明细',
}

function scopeLabel(u: User | null): string {
  const raw = u && u.ledgerVisibility && u.ledgerVisibility.scope
  if (raw === 'none' || raw === 'summary' || raw === 'detail') return SCOPE_LABEL[raw]
  return SCOPE_LABEL.detail
}

const OPTIONS: { value: ReportFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'await_me', label: '待我回应' },
  { value: 'mine', label: '我发的' },
]

Component<{ options: typeof OPTIONS; index: number; scopeLabel: string }, {}, WechatMiniprogram.Component.MethodOption, { saving: boolean }, true>({
  data: { options: OPTIONS, index: 1, scopeLabel: SCOPE_LABEL.detail },
  methods: {
    onLoad() {
      this.saving = false
      this.sync()
    },

    onShow() {
      this.sync()
    },

    sync() {
      const u = getUser()
      if (!u) return
      const index = OPTIONS.findIndex((o) => o.value === normalizeReportFilter(u.preferences.resonanceReportFilter))
      this.setData({ index: index < 0 ? 1 : index, scopeLabel: scopeLabel(u) })
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

    onVisibility() {
      wx.navigateTo({ url: PAGE_LEDGER_VISIBILITY })
    },
  },
})
