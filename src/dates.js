// All dates are stored as 'YYYY-MM-DD' strings in local time.

export const FREQUENCIES = {
  once: { label: 'One-time', months: 0 },
  monthly: { label: 'Monthly', months: 1 },
  quarterly: { label: 'Quarterly', months: 3 },
  halfyearly: { label: 'Half-yearly', months: 6 },
  yearly: { label: 'Yearly', months: 12 },
}

export function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function formatISO(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function todayISO() {
  return formatISO(new Date())
}

// Adds months while keeping the original day-of-month where possible,
// so a 31st due date goes 31 Jan -> 28 Feb -> 31 Mar instead of drifting.
export function addMonths(iso, months, anchorDay) {
  const date = parseDate(iso)
  const day = anchorDay || date.getDate()
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  target.setDate(Math.min(day, lastDay))
  return formatISO(target)
}

export function nextDueDate(payment) {
  const months = FREQUENCIES[payment.frequency]?.months || 0
  if (!months || !payment.dueDate) return null
  return addMonths(payment.dueDate, months, payment.anchorDay)
}

export function daysUntil(iso) {
  if (!iso) return null
  const ms = parseDate(iso) - parseDate(todayISO())
  return Math.round(ms / 86400000)
}

export function prettyDate(iso) {
  if (!iso) return '—'
  return parseDate(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function dueLabel(days) {
  if (days < 0) return `Overdue by ${-days} day${days === -1 ? '' : 's'}`
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  return `Due in ${days} days`
}
