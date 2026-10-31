const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const DAY_MS = 86400000

export const pad2 = (n: number): string => (n < 10 ? `0${n}` : `${n}`)

export function dayStart(ms: number): number {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** 今天 / 昨天 / 本周几 / 今年 M月D日 周X / 往年 YYYY年M月D日 */
export function dayLabel(ms: number, now = Date.now()): string {
  if (!ms) return '更早'
  const diff = Math.round((dayStart(now) - dayStart(ms)) / DAY_MS)
  const d = new Date(ms)
  if (diff === 0) return '今天'
  if (diff === 1) return '昨天'
  const weekday = (new Date(now).getDay() + 6) % 7
  if (diff > 0 && diff <= weekday) return WEEKDAYS[d.getDay()]
  const md = `${d.getMonth() + 1}月${d.getDate()}日`
  if (d.getFullYear() === new Date(now).getFullYear()) return `${md} ${WEEKDAYS[d.getDay()]}`
  return `${d.getFullYear()}年${md}`
}

export function clock(ms: number): string {
  if (!ms) return ''
  const d = new Date(ms)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** 列表里不带日期分组时使用：今天显示时刻，其余显示「M月D日 HH:mm」 */
export function dateTime(ms: number, now = Date.now()): string {
  if (!ms) return ''
  const d = new Date(ms)
  const time = clock(ms)
  if (dayStart(ms) === dayStart(now)) return `今天 ${time}`
  const md = `${d.getMonth() + 1}月${d.getDate()}日 ${time}`
  return d.getFullYear() === new Date(now).getFullYear() ? md : `${d.getFullYear()}年${md}`
}

export const monthLabel = (ms: number): string => {
  if (!ms) return '更早'
  const d = new Date(ms)
  return `${d.getFullYear()}年${d.getMonth() + 1}月`
}

/** picker 用的 YYYY-MM-DD / HH:mm */
export function dateStr(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export const timeStr = clock

export function parseDateTime(date: string, time = '00:00'): number {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const t = new Date(y, m - 1, d, hh, mm).getTime()
  return Number.isFinite(t) ? t : NaN
}

export function fullDate(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${clock(ms)}`
}

export type Duration = { days: string; hours: string; minutes: string; seconds: string }

export function durationSince(sinceMs: number, nowMs = Date.now()): Duration {
  let s = Math.max(0, Math.floor((nowMs - sinceMs) / 1000))
  const days = Math.floor(s / 86400)
  s -= days * 86400
  const hours = Math.floor(s / 3600)
  s -= hours * 3600
  const minutes = Math.floor(s / 60)
  return { days: `${days}`, hours: pad2(hours), minutes: pad2(minutes), seconds: pad2(s - minutes * 60) }
}

const LETTER_TYPES: Record<string, string> = {
  confession: '表白',
  apology: '道歉',
  thankyou: '感谢',
  wish: '许愿',
  whisper: '悄悄话',
  text: '信',
}

export const LETTER_PRESET_TYPES = ['whisper', 'confession', 'apology', 'thankyou', 'wish'].map((name) => ({
  name,
  label: LETTER_TYPES[name],
}))

export function letterTypeLabel(type: string): string {
  if (LETTER_TYPES[type]) return LETTER_TYPES[type]
  return type.length > 8 ? type.slice(0, 8) + '…' : type
}

const REPORT_STATE_LABELS = { pending_read: '未阅', read: '已阅', evaluated: '已评价' }
export const reportStateLabel = (s: keyof typeof REPORT_STATE_LABELS): string => REPORT_STATE_LABELS[s]

/** 同一标签永远同色，对应 report-card 的 6 个色阶 */
export function tagColor(tag: string): number {
  let h = 0
  for (let i = 0; i < tag.length; i++) h = (h + tag.charCodeAt(i) * (i + 17)) % 2147483647
  return h % 6
}
