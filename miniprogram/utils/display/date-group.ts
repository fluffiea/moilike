/** 列表按自然日分组：今天 / 昨天 / 本周 / 更早的日期标签。 */

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

export type DateGroup<T> = {
  dateLabel: string
  dateKey: string
  posts: T[]
}

function dateKeyFromMs(ms: number): string {
  const d = new Date(ms)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function dateLabelFromMs(ms: number, now: Date): string {
  const d = new Date(ms)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.floor((today.getTime() - target.getTime()) / 86400000)

  if (diffDays === 0) return '今天'
  if (diffDays === 1) return '昨天'

  const dayOfWeek = target.getDay()
  const weekStart = new Date(today)
  weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7))
  if (target >= weekStart) {
    return WEEKDAY_LABELS[dayOfWeek]
  }

  return `${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAY_LABELS[dayOfWeek]}`
}

/**
 * 将已按时间倒序的列表按自然日分组。
 * getMs 返回 0 的条目归入「更早」组（排在最后）。
 */
export function groupByDate<T>(items: T[], getMs: (item: T) => number): DateGroup<T>[] {
  if (items.length === 0) return []
  const now = new Date()
  const groups: DateGroup<T>[] = []
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const ms = getMs(item)
    const key = ms > 0 ? dateKeyFromMs(ms) : '__unknown__'
    const label = ms > 0 ? dateLabelFromMs(ms, now) : '更早'
    const last = groups[groups.length - 1]
    if (last && last.dateKey === key) {
      last.posts.push(item)
    } else {
      groups.push({ dateLabel: label, dateKey: key, posts: [item] })
    }
  }
  return groups
}
