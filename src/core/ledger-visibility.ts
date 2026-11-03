import type { LedgerScope, LedgerView, User } from '../types/api'

/** 记账页分段，顺序与云端 view 一致 */
export const LEDGER_VIEWS: { value: LedgerView; label: string }[] = [
  { value: 'mine', label: '我的' },
  { value: 'partner', label: '对方' },
  { value: 'us', label: '我们' },
]

/** 设置页「对方可见范围」。说明文案与云端三个 scope 一一对应 */
export const LEDGER_SCOPE_OPTIONS: { value: LedgerScope; title: string; hint: string }[] = [
  { value: 'none', title: '不可见', hint: '对方看不到金额与明细' },
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

export function ledgerScopeLabel(scope: LedgerScope): string {
  const hit = LEDGER_SCOPE_OPTIONS.find((item) => item.value === scope)
  return hit ? hit.title : '全部明细'
}

export function ledgerVisibilityFoot(bound: boolean): string {
  return bound ? '改完立即对对方生效' : '结伴后对对方生效'
}

export function ledgerHeroLabel(view: LedgerView): string {
  if (view === 'partner') return '对方本月合计'
  if (view === 'us') return '我们本月合计'
  return '支出'
}

export function readLedgerView(raw: string): LedgerView {
  if (raw === 'partner' || raw === 'us') return raw
  return 'mine'
}

export const LEDGER_HIDDEN = {
  title: '对方暂未开放账单',
  hint: '对方将可见范围设为不可见',
}

export type LedgerChrome = {
  /** 对方设为不可见：整页空态，不展示金额 */
  hidden: boolean
  showMonth: boolean
  showList: boolean
  showWho: boolean
  canDrill: boolean
  summaryNote: string
  excludeNote: boolean
  emptyTitle: string
  emptyHint: string
}

/**
 * 纯展示。金额是否含对方以服务端 includesPartner 为准，这里不自行加总。
 */
export function ledgerChrome(view: LedgerView, scope: LedgerScope, includesPartner: boolean): LedgerChrome {
  const partner = view === 'partner'
  const us = view === 'us'
  const hidden = partner && scope === 'none'
  let emptyTitle = '这个月还没有支出'
  let emptyHint = ''
  if (partner) emptyTitle = '对方本月还没有记账'
  else if (us && scope === 'summary') emptyTitle = '这个月还没有我的支出'
  else if (view === 'mine') emptyHint = '记一笔就好'
  return {
    hidden,
    showMonth: !hidden,
    showList: !partner || scope === 'detail',
    showWho: us && scope === 'detail',
    canDrill: view === 'mine' || (partner && scope === 'detail') || (us && scope !== 'summary'),
    summaryNote: partner && scope === 'summary' ? '对方仅开放汇总，不可查看明细' : '',
    excludeNote: us && !includesPartner,
    emptyTitle,
    emptyHint,
  }
}

export function ledgerCategoryEmpty(view: LedgerView): { title: string; hint: string } {
  if (view === 'partner') return { title: '对方还没有这类支出', hint: '' }
  return { title: '还没有这类支出', hint: view === 'mine' ? '记一笔就好' : '' }
}

/** 这条视图不能看流水时的说明；能看时为空 */
export function ledgerLinesBlocked(scope: LedgerScope): string {
  if (scope === 'none') return '对方暂未开放账单'
  if (scope === 'summary') return '对方仅开放汇总，不可查看明细'
  return ''
}
