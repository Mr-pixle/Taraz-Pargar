// Jalali (Shamsi) calendar helpers. Dates are stored as ISO "YYYY-MM-DD" (Gregorian) and shown as Shamsi.
const div = (a: number, b: number) => ~~(a / b)
const mod = (a: number, b: number) => a - ~~(a / b) * b

const BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178]

function jalCal(jy: number, withoutLeap = false) {
  const gy = jy + 621
  let leapJ = -14
  let jp = BREAKS[0]
  let jump = 0
  for (let i = 1; i < BREAKS.length; i++) {
    const jm = BREAKS[i]
    jump = jm - jp
    if (jy < jm) break
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4)
    jp = jm
  }
  let n = jy - jp
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4)
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150
  const march = 20 + leapJ - leapG
  if (withoutLeap) return { gy, march, leap: -1 }
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33
  let leap = mod(mod(n + 1, 33) - 1, 4)
  if (leap === -1) leap = 4
  return { leap, gy, march }
}

function g2d(gy: number, gm: number, gd: number) {
  let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752
  return d
}

function d2g(jdn: number) {
  let j = 4 * jdn + 139361631
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908
  const i = div(mod(j, 1461), 4) * 5 + 308
  const gd = div(mod(i, 153), 5) + 1
  const gm = mod(div(i, 153), 12) + 1
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6)
  return { gy, gm, gd }
}

function j2d(jy: number, jm: number, jd: number) {
  const r = jalCal(jy, true)
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1
}

function d2j(jdn: number) {
  const gy = d2g(jdn).gy
  let jy = gy - 621
  const r = jalCal(jy, false)
  const jdn1f = g2d(gy, 3, r.march)
  let k = jdn - jdn1f
  if (k >= 0) {
    if (k <= 185) return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 }
    k -= 186
  } else {
    jy -= 1
    k += 179
    if (r.leap === 1) k += 1
  }
  return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 }
}

export interface JDate { jy: number; jm: number; jd: number }

export function toJalali(iso: string): JDate {
  const [y, m, d] = iso.split('-').map(Number)
  return d2j(g2d(y, m, d))
}

export function fromJalali(jy: number, jm: number, jd: number): string {
  const g = d2g(j2d(jy, jm, jd))
  return `${g.gy}-${String(g.gm).padStart(2, '0')}-${String(g.gd).padStart(2, '0')}`
}

export function jMonthLength(jy: number, jm: number) {
  if (jm <= 6) return 31
  if (jm <= 11) return 30
  return jalCal(jy).leap === 0 ? 30 : 29
}

export const J_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']
// Week starts on Saturday. Index 0 = شنبه … 6 = جمعه
export const WEEKDAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه']
export const WEEKDAYS_SHORT = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج']

// ---- ISO date arithmetic (UTC based, no DST surprises) ----
export function isoFromDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function toUTC(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}
export function addDays(iso: string, n: number) {
  const t = new Date(toUTC(iso) + n * 86400000)
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`
}
export function diffDays(a: string, b: string) {
  return Math.round((toUTC(a) - toUTC(b)) / 86400000)
}
/** 0 = Saturday … 6 = Friday */
export function weekdayIndex(iso: string) {
  const js = new Date(toUTC(iso)).getUTCDay() // 0 = Sunday
  return (js + 1) % 7
}
export function isWeekend(iso: string) {
  const w = weekdayIndex(iso)
  return w === 5 || w === 6 // پنجشنبه و جمعه
}
export function startOfWeek(iso: string) {
  return addDays(iso, -weekdayIndex(iso))
}
export function rangeDays(from: string, to: string) {
  const out: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}
export function startOfJMonth(iso: string) {
  const j = toJalali(iso)
  return fromJalali(j.jy, j.jm, 1)
}
export function addJMonths(iso: string, n: number) {
  const j = toJalali(iso)
  let m = j.jm - 1 + n
  const y = j.jy + Math.floor(m / 12)
  m = ((m % 12) + 12) % 12
  return fromJalali(y, m + 1, 1)
}

// ---- Tehran time (Asia/Tehran) ----
const TEH_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' })
const TEH_TIME = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', hour12: false })
/** Calendar day in Tehran for a moment, as ISO "YYYY-MM-DD" */
export function tehranISO(d: Date = new Date()) { return TEH_DATE.format(d) }
/** "HH:MM" in Tehran */
export function tehranTime(d: Date = new Date()) { return TEH_TIME.format(d) }
/** "۱۴۰۵/۰۸/۰۴" — for stored message text (notification bodies) */
export function jalaliFa(iso: string) {
  const j = toJalali(iso)
  return `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`.replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d])
}
