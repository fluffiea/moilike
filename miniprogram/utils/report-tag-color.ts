/** 与 WXSS `.report-tag-chip--c0` … `--c5` 对应；同串永远同色 */
const PALETTE_N = 6

export function reportTagColorIndex(tag: string): number {
  const s = typeof tag === 'string' ? tag.trim() : ''
  if (!s) return 0
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h + s.charCodeAt(i) * (i + 17)) % 2147483647
  }
  const v = Math.abs(h) % PALETTE_N
  return v
}
