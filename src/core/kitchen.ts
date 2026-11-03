import { callOrToast } from './api'
import { promptText, toast } from './ui'

/** 与 cloudfunctions/api/routes/kitchen.js 的 QUICK_TAGS、名字长度保持一致 */
export const QUICK_TAGS = ['今天就要', '周末', '想你了'] as const
export const KITCHEN_NAME_MAX = 20
export const CATEGORY_NAME_MAX = 8

export function lineText(name: string, quantity: number, tags: string[]): string {
  const base = `${name} ×${quantity}`
  return tags.length ? `${base} · ${tags.join('、')}` : base
}

/** 订单状态只对应字色，不另做色块 */
export function orderStatusClass(status: string): string {
  if (status === 'pending') return 'mo-st-pending'
  if (status === 'in_progress') return 'mo-st-progress'
  if (status === 'done') return 'mo-st-done'
  return 'mo-st-muted'
}

/** 取消返回 null；空名或超长会先 toast 再返回 null */
export async function askLimitedName(opts: {
  title: string
  placeholder?: string
  value?: string
  max: number
  empty: string
  tooLong: string
}): Promise<string | null> {
  const raw = await promptText({ title: opts.title, placeholder: opts.placeholder, value: opts.value })
  if (raw == null) return null
  const name = raw.trim()
  if (!name) {
    toast(opts.empty)
    return null
  }
  if (name.length > opts.max) {
    toast(opts.tooLong)
    return null
  }
  return name
}

/** 经营页和菜单页共用。成功返回新名字 */
export async function renameKitchen(current: string): Promise<string | null> {
  const name = await askLimitedName({
    title: '厨房改名',
    placeholder: '例如阿柚的小厨房',
    value: current,
    max: KITCHEN_NAME_MAX,
    empty: '先给厨房起个名字',
    tooLong: '厨房名最多 20 个字',
  })
  if (!name) return null
  const r = await callOrToast('kitchen.rename', { name })
  return r ? r.kitchen.name : null
}
