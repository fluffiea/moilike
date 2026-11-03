/** 与 cloudfunctions/api/routes/kitchen.js 的 QUICK_TAGS 保持一致 */
export const QUICK_TAGS = ['今天就要', '周末', '想你了'] as const

export function lineText(name: string, quantity: number, tags: string[]): string {
  const base = `${name} ×${quantity}`
  return tags.length ? `${base} · ${tags.join('、')}` : base
}

export function charsOf(name: string): string[] {
  return Array.from(name)
}
