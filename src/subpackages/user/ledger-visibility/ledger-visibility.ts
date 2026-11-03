import type { LedgerScope, User } from '../../../types/api'
import { call } from '../../../core/api'
import { isLedgerScope, LEDGER_SCOPE_OPTIONS, ledgerScopeOfUser, ledgerVisibilityFoot } from '../../../core/ledger-visibility'
import { getUser, setUser } from '../../../core/store'
import { toast } from '../../../core/ui'

Component<{ options: typeof LEDGER_SCOPE_OPTIONS; scope: LedgerScope; foot: string }, {}, WechatMiniprogram.Component.MethodOption, { saving: boolean }, true>({
  data: {
    options: LEDGER_SCOPE_OPTIONS,
    scope: 'detail',
    foot: ledgerVisibilityFoot(false),
  },
  methods: {
    onLoad() {
      this.saving = false
      this.apply(getUser())
      void this.refresh()
    },

    apply(u: User | null) {
      this.setData({
        scope: ledgerScopeOfUser(u),
        foot: ledgerVisibilityFoot(Boolean(u && u.partner)),
      })
    },

    async refresh() {
      const r = await call('user.me', {})
      if (!r.ok || !r.data.user || this.saving) return
      setUser(r.data.user)
      this.apply(r.data.user)
    },

    async onPick(e: WechatMiniprogram.TouchEvent) {
      const scope = String(e.currentTarget.dataset.scope)
      if (!isLedgerScope(scope)) return
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
