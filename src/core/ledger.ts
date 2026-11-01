import { pad2 } from './format'

/** 与云函数一致：自然月、展示用的日期都按北京时间。 */
const OFFSET = 8 * 60 * 60 * 1000
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

export function beijingMonthKey(ms = Date.now()): string {
  const d = new Date(ms + OFFSET)
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`
}

export function addMonths(key: string, delta: number): string {
  const y = Number(key.slice(0, 4))
  const m = Number(key.slice(5))
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`
}

export function monthTitle(key: string): string {
  return `${key.slice(0, 4)}年${Number(key.slice(5))}月`
}

type Parts = { y: number; m: number; day: number; hh: number; mm: number; weekday: string }

export function beijingParts(ms: number): Parts {
  const d = new Date(ms + OFFSET)
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hh: d.getUTCHours(),
    mm: d.getUTCMinutes(),
    weekday: WEEKDAYS[d.getUTCDay()],
  }
}

export function beijingDateStr(ms: number): string {
  const p = beijingParts(ms)
  return `${p.y}-${pad2(p.m)}-${pad2(p.day)}`
}

export function beijingTimeStr(ms: number): string {
  const p = beijingParts(ms)
  return `${pad2(p.hh)}:${pad2(p.mm)}`
}

/** 流水右侧的日期：今年不写年份 */
export function ledgerDay(ms: number, now = Date.now()): string {
  const p = beijingParts(ms)
  const n = beijingParts(now)
  const md = `${p.m}月${p.day}日 ${p.weekday}`
  return p.y === n.y ? md : `${p.y}年${md}`
}

export function ledgerDateTime(ms: number): string {
  const p = beijingParts(ms)
  return `${p.y}-${pad2(p.m)}-${pad2(p.day)} ${pad2(p.hh)}:${pad2(p.mm)}`
}

export function parseBeijingDateTime(date: string, time = '00:00'): number {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const tm = /^(\d{2}):(\d{2})$/.exec(time)
  if (!dm || !tm) return NaN
  const y = Number(dm[1])
  const m = Number(dm[2])
  const d = Number(dm[3])
  const hh = Number(tm[1])
  const mm = Number(tm[2])
  if (m < 1 || m > 12 || d < 1 || d > 31 || hh > 23 || mm > 59) return NaN
  const ms = Date.UTC(y, m - 1, d, hh, mm) - OFFSET
  const check = new Date(ms + OFFSET)
  if (check.getUTCFullYear() !== y || check.getUTCMonth() + 1 !== m || check.getUTCDate() !== d) return NaN
  return ms
}

export function formatYuan(fen: number): string {
  const neg = fen < 0
  const abs = Math.abs(Math.round(fen))
  const yuan = Math.floor(abs / 100)
  const cents = abs % 100
  const body = String(yuan).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${neg ? '-' : ''}¥${body}.${pad2(cents)}`
}

/** 编辑回填：86.00 */
export function fenToYuanInput(fen: number): string {
  const abs = Math.abs(Math.round(fen))
  return `${Math.floor(abs / 100)}.${pad2(abs % 100)}`
}

/** 合法正数金额（最多两位小数）转为分；否则 null */
export function yuanToFen(input: string): number | null {
  const s = input.trim().replace(/\.$/, '')
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null
  const [y, c = ''] = s.split('.')
  if (y.length > 7) return null
  const fen = Number(y) * 100 + Number((c + '00').slice(0, 2))
  if (!Number.isSafeInteger(fen) || fen <= 0 || fen > 99999999) return null
  return fen
}

/** 占比：去掉无意义的末位 0，至少保留一位小数 */
export function shareText(part: number, total: number): string {
  if (total <= 0 || part <= 0) return '0.0%'
  const n = (part / total) * 100
  const s = n.toFixed(2)
  return `${s.endsWith('0') ? n.toFixed(1) : s}%`
}

/** 条形相对本组最大项；非零项至少留一点宽度 */
export function barWidth(part: number, max: number): string {
  if (max <= 0 || part <= 0) return '0%'
  return `${Math.min(100, Math.max(8, Math.round((part / max) * 100)))}%`
}
