import type { ISODate } from './types'

const MS = 86400000
export function toDate(d: ISODate): Date {
  return new Date(d + 'T12:00:00Z')
}
export function iso(d: Date): ISODate {
  return d.toISOString().slice(0, 10)
}
export function addDays(d: ISODate, n: number): ISODate {
  return iso(new Date(toDate(d).getTime() + n * MS))
}
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toDate(a).getTime() - toDate(b).getTime()) / MS)
}
export function weekday(d: ISODate): number {
  return toDate(d).getUTCDay() // 0 Sun .. 6 Sat
}
export function cmp(a: ISODate, b: ISODate) {
  return a < b ? -1 : a > b ? 1 : 0
}
export function ageOn(dob: ISODate, on: ISODate): number {
  // string arithmetic: no Date allocation (hot path)
  let a = +on.slice(0, 4) - +dob.slice(0, 4)
  if (on.slice(5, 10) < dob.slice(5, 10)) a--
  return a
}
/** Days since epoch for an ISO date (fast, allocation-light). */
// scheduling compares dates millions of times over a season: parse each one once
const DAY_CACHE = new Map<string, number>()
export function dayNum(d: ISODate): number {
  let n = DAY_CACHE.get(d)
  if (n === undefined) {
    n = Math.round(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / MS)
    if (DAY_CACHE.size > 20000) DAY_CACHE.clear()
    DAY_CACHE.set(d, n)
  }
  return n
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export function fmtDate(d: ISODate, style: 'short' | 'long' | 'day' | 'dm' | 'full' | 'month' = 'short'): string {
  const x = toDate(d)
  const dd = x.getUTCDate(), m = x.getUTCMonth(), y = x.getUTCFullYear(), w = x.getUTCDay()
  switch (style) {
    case 'day': return DAYS[w]
    case 'dm': return `${dd} ${MONTHS[m]}`
    case 'long': return `${DAYS_LONG[w]} ${dd} ${MONTHS_LONG[m]} ${y}`
    case 'full': return `${DAYS[w]} ${dd} ${MONTHS[m]} ${y}`
    case 'month': return `${MONTHS_LONG[m]} ${y}`
    default: return `${dd} ${MONTHS[m]} ${y}`
  }
}
export const monthName = (m: number) => MONTHS_LONG[m]
export const monthKey = (d: ISODate) => d.slice(0, 7)
export function seasonLabel(season: number) {
  return `${season}/${String((season + 1) % 100).padStart(2, '0')}`
}
export function nextWeekday(d: ISODate, wd: number): ISODate {
  let x = d
  while (weekday(x) !== wd) x = addDays(x, 1)
  return x
}
