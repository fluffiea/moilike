import type { MoPreferences } from '../types/user'

/** 与见证页一级 Tab 一致 */
export const DEFAULT_CHRONICLE_MAIN_TAB = 'daily' as const
/** 与报备次级筛选一致；无云端偏好时的产品默认 */
export const DEFAULT_CHRONICLE_REPORT_FILTER = 'pending' as const

/**
 * 根据用户偏好（可为空）解析进入见证页时应展示的 Tab / 报备筛选。
 * 未设置时：日常 + 待阅读。
 */
export function resolveChronicleEntryPrefs(
  prefs: MoPreferences | null | undefined,
): {
  mainModule: 'daily' | 'report'
  reportFilter: 'pending' | 'all' | 'mine'
} {
  const main =
    prefs?.chronicleDefaultMainTab === 'report' ? 'report' : DEFAULT_CHRONICLE_MAIN_TAB
  const rf = prefs?.chronicleReportFilter
  const reportFilter =
    rf === 'pending' || rf === 'all' || rf === 'mine' ? rf : DEFAULT_CHRONICLE_REPORT_FILTER
  return { mainModule: main, reportFilter }
}

/**
 * 偏好会话签名（含 openId）：用于判断会话偏好是否变化。
 * 主 Tab / 筛选取 resolve 后的规范值，避免「缺省字段」与「显式默认值」被当成不同偏好。
 */
export function prefsSignature(
  openId: string | undefined,
  prefs: MoPreferences | null | undefined,
): string {
  const { mainModule, reportFilter } = resolveChronicleEntryPrefs(prefs)
  return `${openId ?? ''}:${mainModule}:${reportFilter}`
}

/** 上次已在见证页同步过的偏好签名；设置页保存成功后应 invalidate，以便下次进入见证立即按新偏好展示 */
let chroniclePrefsAppliedSig = ''

/**
 * 相对上次应用未变则返回 false（不覆盖用户在现场切换的 Tab）；
 * 有变化或缓存已失效则写入新签名并返回 true。
 */
export function consumeChroniclePrefsApplyIfNeeded(
  openId: string | undefined,
  prefs: MoPreferences | null | undefined,
): boolean {
  const sig = prefsSignature(openId, prefs)
  if (sig === chroniclePrefsAppliedSig) return false
  chroniclePrefsAppliedSig = sig
  return true
}

/** 偏好保存成功后调用，下次进入见证页必重新套用会话偏好 */
export function invalidateChroniclePrefsApplyCache(): void {
  chroniclePrefsAppliedSig = ''
}
