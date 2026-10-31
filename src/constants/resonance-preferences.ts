import type { MoPreferences } from '../types/user'

/** 「共鸣」Tab 报备列表默认筛选；与 {@link resolveResonanceReportFilter} 一致 */
export const DEFAULT_RESONANCE_REPORT_FILTER = 'mine' as const

function parseReportFilterPref(
  v: unknown,
): 'mine' | 'action_needed' | 'all' | undefined {
  if (v === 'mine' || v === 'action_needed' || v === 'all') {
    return v
  }
  return undefined
}

/** 根据用户偏好解析进入「共鸣」页时应使用的报备筛选。 */
export function resolveResonanceReportFilter(
  prefs: MoPreferences | null | undefined,
): 'mine' | 'action_needed' | 'all' {
  if (prefs == null) {
    return DEFAULT_RESONANCE_REPORT_FILTER
  }
  const v = parseReportFilterPref(prefs.resonanceReportFilter)
  if (v != null) {
    return v
  }
  return DEFAULT_RESONANCE_REPORT_FILTER
}

/** 偏好签名（含 openId）：用于共鸣页判断会话偏好是否变化 */
export function resonancePrefsSignature(
  openId: string | undefined,
  prefs: MoPreferences | null | undefined,
): string {
  const reportFilter = resolveResonanceReportFilter(prefs)
  return `${openId != null ? openId : ''}:${reportFilter}`
}

let resonancePrefsAppliedSig = ''

/**
 * 相对上次应用未变则返回 false（不覆盖用户在现场切换的筛选）；
 * 有变化或缓存已失效则写入新签名并返回 true。
 */
export function consumeResonancePrefsApplyIfNeeded(
  openId: string | undefined,
  prefs: MoPreferences | null | undefined,
): boolean {
  const sig = resonancePrefsSignature(openId, prefs)
  if (sig === resonancePrefsAppliedSig) return false
  resonancePrefsAppliedSig = sig
  return true
}

/** 偏好保存成功后调用，下次进入共鸣页必重新套用会话偏好 */
export function invalidateResonancePrefsApplyCache(): void {
  resonancePrefsAppliedSig = ''
}
