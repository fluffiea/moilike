/** 与 together-since 分包隔离：避免部分 DevTools 对 `together-since` 模块具名导出压缩异常 */
export function togetherSinceMsFromUser(u: { togetherSinceMs?: number } | null): number | null {
  if (!u) return null
  const raw = u.togetherSinceMs
  if (typeof raw !== 'number' || Number.isNaN(raw)) return null
  return Math.floor(raw)
}
