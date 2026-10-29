/**
 * 餐次与账本日。按设备本地时区。
 * 5:00–11:00 早餐，11:00–16:00 午餐，其余晚餐（含 0:00–5:00）。
 * 云函数 migrate/mapping.js 里的 inferSlot 必须与这里一致。
 */

function pad2(n) {
  const v = Math.floor(Math.abs(n))
  return v < 10 ? '0' + v : String(v)
}

function inferSlot(hour, minute) {
  const mins = hour * 60 + minute
  if (mins >= 5 * 60 && mins < 11 * 60) return 'breakfast'
  if (mins >= 11 * 60 && mins < 16 * 60) return 'lunch'
  return 'dinner'
}

function formatDayKey(date) {
  return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate())
}

function parseDayKey(key) {
  const parts = typeof key === 'string' ? key.split('-') : []
  const y = parseInt(parts[0], 10)
  const m = parseInt(parts[1], 10)
  const d = parseInt(parts[2], 10)
  if (!y || !m || !d) return new Date()
  return new Date(y, m - 1, d)
}

function shiftDayKey(key, delta) {
  const date = parseDayKey(key)
  date.setDate(date.getDate() + delta)
  return formatDayKey(date)
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function formatDateLabel(key) {
  const date = parseDayKey(key)
  return date.getMonth() + 1 + '月' + date.getDate() + '日 ' + WEEKDAYS[date.getDay()]
}

function formatHm(ms) {
  const date = new Date(ms)
  return pad2(date.getHours()) + ':' + pad2(date.getMinutes())
}

function recordAtFrom(dayKey, hm) {
  const day = parseDayKey(dayKey)
  const parts = typeof hm === 'string' ? hm.split(':') : []
  const hh = parseInt(parts[0], 10)
  const mm = parseInt(parts[1], 10)
  if (Number.isNaN(hh) || Number.isNaN(mm)) return 0
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hh, mm, 0, 0).getTime()
}

function inferSlotFromHm(hm) {
  const parts = typeof hm === 'string' ? hm.split(':') : []
  const hh = parseInt(parts[0], 10)
  const mm = parseInt(parts[1], 10)
  if (Number.isNaN(hh) || Number.isNaN(mm)) return 'lunch'
  return inferSlot(hh, mm)
}

module.exports = {
  pad2,
  inferSlot,
  formatDayKey,
  parseDayKey,
  shiftDayKey,
  formatDateLabel,
  formatHm,
  recordAtFrom,
  inferSlotFromHm,
}
