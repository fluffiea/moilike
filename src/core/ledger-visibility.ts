import type { LedgerScope, LedgerView, User } from '../types/api'

/** 记账页分段。只在对方开放汇总或明细时出现 */
export const LEDGER_VIEWS: { value: LedgerView; label: string }[] = [
  { value: 'mine', label: '我的' },
  { value: 'partner', label: '对方' },
]

/** 设置页「对方可见范围」。说明文案与云端三个 scope 一一对应 */
export const LEDGER_SCOPE_OPTIONS: { value: LedgerScope; title: string; hint: string }[] = [
  { value: 'none', title: '不可见', hint: '对方看不到账，记账页也不出现切换' },
  { value: 'summary', title: '仅汇总', hint: '对方可见月合计与一级分类占比，不可查看明细' },
  { value: 'detail', title: '全部明细', hint: '对方可见完整流水与详情' },
]

export function isLedgerScope(raw: unknown): raw is LedgerScope {
  return raw === 'none' || raw === 'summary' || raw === 'detail'
}

/** 缺省、脏数据都按全部明细，和云端一致 */
export function ledgerScopeOf(raw: unknown): LedgerScope {
  return isLedgerScope(raw) ? raw : 'detail'
}

export function ledgerScopeOfUser(u: User | null): LedgerScope {
  return ledgerScopeOf(u && u.ledgerVisibility && u.ledgerVisibility.scope)
}

/** 对方是否已经让我看见账。缺字段按未开放，避免旧缓存误放出切换 */
export function partnerLedgerOpen(u: User | null): boolean {
  const raw = u && u.partner ? u.partner.ledgerScope : ''
  return raw === 'summary' || raw === 'detail'
}

export function ledgerScopeLabel(scope: LedgerScope): string {
  const hit = LEDGER_SCOPE_OPTIONS.find((item) => item.value === scope)
  return hit ? hit.title : '全部明细'
}

export function ledgerVisibilityFoot(bound: boolean): string {
  return bound ? '改完立即对对方生效' : '结伴后对对方生效'
}

export function ledgerHeroLabel(view: LedgerView): string {
  if (view === 'partner') return '对方本月合计'
  return '支出'
}

export function readLedgerView(raw: string): LedgerView {
  if (raw === 'partner') return raw
  return 'mine'
}

export type LedgerChrome = {
  showList: boolean
  canDrill: boolean
  summaryNote: string
  emptyTitle: string
  emptyHint: string
}

/** 纯展示。看谁的账、出不出流水，以服务端 scope 为准 */
export function ledgerChrome(view: LedgerView, scope: LedgerScope): LedgerChrome {
  const partner = view === 'partner'
  return {
    showList: !partner || scope === 'detail',
    canDrill: !partner || scope === 'detail',
    summaryNote: partner && scope === 'summary' ? '对方仅开放汇总，不可查看明细' : '',
    emptyTitle: partner ? '对方本月还没有记账' : '这个月还没有支出',
    emptyHint: partner ? '' : '记一笔就好',
  }
}

export function ledgerCategoryEmpty(view: LedgerView): { title: string; hint: string } {
  if (view === 'partner') return { title: '对方还没有这类支出', hint: '' }
  return { title: '还没有这类支出', hint: '记一笔就好' }
}

/** 这条视图不能看流水时的说明；能看时为空 */
export function ledgerLinesBlocked(scope: LedgerScope): string {
  if (scope === 'none') return '对方暂未开放账单'
  if (scope === 'summary') return '对方仅开放汇总，不可查看明细'
  return ''
}
