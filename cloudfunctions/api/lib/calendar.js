/** 记账的自然月按北京时间（UTC+8）切分，不跟云函数机器时区走。 */

const OFFSET = 8 * 60 * 60 * 1000

function pad2(n) {
  return n < 10 ? `0${n}` : `${n}`
}

/** @param {number} ms */
function monthKeyFromMs(ms) {
  const d = new Date(ms + OFFSET)
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`
}

/** @param {unknown} key @returns {{ y: number, m: number } | null} */
function parseMonth(key) {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}$/.test(key)) return null
  const y = Number(key.slice(0, 4))
  const m = Number(key.slice(5))
  if (y < 2000 || y > 2100 || m < 1 || m > 12) return null
  return { y, m }
}

/** 该月 1 日 00:00（北京时间）的 UTC 毫秒；非法月份返回 null */
function monthStartMs(key) {
  const p = parseMonth(key)
  if (!p) return null
  return Date.UTC(p.y, p.m - 1, 1) - OFFSET
}

/** @param {string} key @param {number} delta */
function addMonths(key, delta) {
  const p = parseMonth(key)
  if (!p) return null
  const d = new Date(Date.UTC(p.y, p.m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`
}

/**
 * 下个月 1 日 00:00（北京时间）。不能走 monthStartMs(addMonths())：
 * 2100-12 的下个月是 2101-01，会被年份上限判成非法，调用方再减 1 会变成 1970。
 */
function nextMonthStartMs(key) {
  const p = parseMonth(key)
  if (!p) return null
  return Date.UTC(p.y, p.m, 1) - OFFSET
}

function currentMonthKey(now = Date.now()) {
  return monthKeyFromMs(now)
}

module.exports = { monthKeyFromMs, parseMonth, monthStartMs, nextMonthStartMs, addMonths, currentMonthKey }
