import type { LedgerScope, User } from '../../../types/api'
import { call } from '../../../core/api'
import { getUser, setUser } from '../../../core/store'
import { toast } from '../../../core/ui'

const OPTIONS: { value: LedgerScope; title: string; hint: string }[] = [
  { value: 'none', title: '不可见', hint: '对方看不到金额与明细' },
  { value: 'summary', title: '仅汇总', hint: '对方可见月合计与一级分类占比，不可查看明细' },
  { value: 'detail', title: '全部明细', hint: '对方可见完整流水与详情' },
]

function scopeOf(u: User | null): LedgerScope {
  const raw = u && u.ledgerVisibility && u.ledgerVisibility.scope
  if (raw === 'none' || raw === 'summary' || raw === 'detail') return raw
  return 'detail'
}

Component<{ options: typeof OPTIONS; scope: LedgerScope; foot: string }, {}, WechatMiniprogram.Component.MethodOption, { saving: boolean }, true>({
  data: {
    options: OPTIONS,
    scope: 'detail',
    foot: '结伴后对对方生效',
  },
  methods: {
    onLoad() {
      this.saving = false
      this.apply(getUser())
      void this.refresh()
    },

    apply(u: User | null) {
      this.setData({
        scope: scopeOf(u),
        foot: u && u.partner ? '改完立即对对方生效' : '结伴后对对方生效',
      })
    },

    async refresh() {
      const r = await call('user.me', {})
      if (!r.ok || !r.data.user || this.saving) return
      setUser(r.data.user)
      this.apply(r.data.user)
    },

    async onPick(e: WechatMiniprogram.TouchEvent) {
      const scope = String(e.currentTarget.dataset.scope) as LedgerScope
      if (scope !== 'none' && scope !== 'summary' && scope !== 'detail') return
      const prev = this.data.scope
      if (scope === prev || this.saving) return
      this.saving = true
      this.setData({ scope })
      const r = await call('user.saveLedgerVisibility', { scope })
      this.saving = false
      if (!r.ok) {
        this.setData({ scope: prev })
        return toast(r.message)
      }
      setUser(r.data.user)
      this.apply(r.data.user)
    },
  },
})
