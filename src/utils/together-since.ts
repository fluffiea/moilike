/** 本地日期 + 时间（picker）→ 毫秒时间戳 */
export function parseLocalDateTimeToMs(dateStr: string, timeStr: string): number {
  const dPart = typeof dateStr === 'string' ? dateStr.trim() : ''
  const tPart = typeof timeStr === 'string' ? timeStr.trim() : ''
  if (!dPart || !tPart) return NaN
  const dp = dPart.split('-')
  if (dp.length !== 3) return NaN
  const y = parseInt(dp[0], 10)
  const m = parseInt(dp[1], 10)
  const day = parseInt(dp[2], 10)
  const tp = tPart.split(':')
  if (tp.length < 2) return NaN
  const hh = parseInt(tp[0], 10)
  const mm = parseInt(tp[1], 10)
  if (
    !Number.isFinite(y) ||
    !Number.isFinite(m) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hh) ||
    !Number.isFinite(mm)
  ) {
    return NaN
  }
  const t = new Date(y, m - 1, day, hh, mm, 0, 0).getTime()
  if (Number.isNaN(t)) return NaN
  return t
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

function calendarPartsFromMs(ms: number): {
  y: number
  m: number
  d: number
  hh: number
  mm: number
} | null {
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return null
  return {
    y: d.getFullYear(),
    m: d.getMonth() + 1,
    d: d.getDate(),
    hh: d.getHours(),
    mm: d.getMinutes(),
  }
}

export function formatMsToDateStr(ms: number): string {
  const p = calendarPartsFromMs(ms)
  if (!p) return ''
  return `${p.y}-${pad2(p.m)}-${pad2(p.d)}`
}

export function formatMsToTimeStr(ms: number): string {
  const p = calendarPartsFromMs(ms)
  if (!p) return ''
  return `${pad2(p.hh)}:${pad2(p.mm)}`
}

/** 对象页：纪念日已写入时的整句（WXML 单行绑定） */
export function formatTogetherSavedLabelCn(ms: number): string {
  const p = calendarPartsFromMs(ms)
  if (!p) return ''
  return `已同步 ${p.y}年${p.m}月${p.d}日 ${pad2(p.hh)}:${pad2(p.mm)}（双方一致）`
}

/** 朝夕页头像区下方副标题整句 */
export function formatTogetherSubtitleCn(ms: number): string {
  const p = calendarPartsFromMs(ms)
  if (!p) return ''
  return `${p.y}年${p.m}月${p.d}日 ${pad2(p.hh)}:${pad2(p.mm)}，悄悄从这一秒数起`
}

export type TogetherDurationParts = {
  days: number
  hours: number
  minutes: number
  seconds: number
}

/** 从起始时刻到 nowMs 的时长（秒级向下取整，差为负时按 0） */
export function splitDurationFromMs(sinceMs: number, nowMs: number): TogetherDurationParts {
  let diff = Math.floor((nowMs - sinceMs) / 1000)
  if (!Number.isFinite(diff) || diff < 0) diff = 0
  const days = Math.floor(diff / 86400)
  diff -= days * 86400
  const hours = Math.floor(diff / 3600)
  diff -= hours * 3600
  const minutes = Math.floor(diff / 60)
  const seconds = diff - minutes * 60
  return { days, hours, minutes, seconds }
}

/** 朝夕倒计时格子的展示字符串（与 pad2 规则一致，避免页面与工具各写一份） */
export function formatDurationGridStrings(parts: TogetherDurationParts): {
  togetherDaysStr: string
  togetherHoursStr: string
  togetherMinutesStr: string
  togetherSecondsStr: string
} {
  return {
    togetherDaysStr: `${parts.days}`,
    togetherHoursStr: pad2(parts.hours),
    togetherMinutesStr: pad2(parts.minutes),
    togetherSecondsStr: pad2(parts.seconds),
  }
}

export function floorToMinuteMs(ms: number): number {
  if (!Number.isFinite(ms)) return NaN
  return Math.floor(ms / 60000) * 60000
}
