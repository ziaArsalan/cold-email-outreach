// Cycle/period math for the Follow-ups module. A task's "current period" is
// computed in the configured timezone (config.followups.timezone, default
// Asia/Karachi) so weekly cycles roll over at local Monday 00:00 and monthly
// cycles at the local 1st 00:00 — not at the server's UTC clock.
//
// period keys:
//   one_time → 'once'                (one cycle, forever)
//   weekly   → ISO week 'YYYY-Www'   (e.g. '2026-W42', week starts Monday)
//   monthly  → 'YYYY-MM'             (e.g. '2026-10')
//
// Technique mirrors services/dayBoundary.js: read the wall-clock civil date in
// the target timezone via Intl, then do pure calendar math on that civil date
// (no further timezone ambiguity once we have Y/M/D).

const config = require('../config')

const tz = () => (config.followups && config.followups.timezone) || 'UTC'

// The civil {year, month(1-12), day} shown on a wall clock in `timeZone` at the
// given instant. en-CA formats as YYYY-MM-DD, which is easy to split.
const civilParts = (date, timeZone) => {
  const s = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
  const [year, month, day] = s.split('-').map((n) => parseInt(n, 10))
  return { year, month, day }
}

// ISO-8601 week number + week-year for a civil date. Week 1 is the week with
// the year's first Thursday; weeks start Monday. Uses Date.UTC on the civil
// parts purely as an arithmetic calendar (not a timezone conversion).
const isoWeek = (year, month, day) => {
  const d = new Date(Date.UTC(year, month - 1, day))
  const dayNum = (d.getUTCDay() + 6) % 7 // Mon=0 .. Sun=6
  d.setUTCDate(d.getUTCDate() - dayNum + 3) // move to this week's Thursday
  const weekYear = d.getUTCFullYear()
  const firstThursday = new Date(Date.UTC(weekYear, 0, 4))
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3)
  const week = 1 + Math.round((d - firstThursday) / (7 * 24 * 3600 * 1000))
  return { weekYear, week }
}

// The period key for a task at a given instant.
const periodKeyFor = (recurrence, now = new Date()) => {
  if (recurrence === 'one_time') return 'once'
  const { year, month, day } = civilParts(now, tz())
  if (recurrence === 'monthly') return `${year}-${String(month).padStart(2, '0')}`
  if (recurrence === 'weekly') {
    const { weekYear, week } = isoWeek(year, month, day)
    return `${weekYear}-W${String(week).padStart(2, '0')}`
  }
  throw new Error(`unknown recurrence: ${recurrence}`)
}

// Convenience: current period key for a task document.
const currentPeriodKey = (task, now = new Date()) =>
  periodKeyFor(task.recurrence, now)

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// Human label for a period key, for reminder messages ({{period_label}}).
//   '2026-10'    → 'October 2026'
//   '2026-W42'   → 'week 42, 2026'
//   'once'       → 'your tasks'
const periodLabel = (periodKey) => {
  if (!periodKey || periodKey === 'once') return 'your tasks'
  const wk = /^(\d{4})-W(\d{2})$/.exec(periodKey)
  if (wk) return `week ${parseInt(wk[2], 10)}, ${wk[1]}`
  const mo = /^(\d{4})-(\d{2})$/.exec(periodKey)
  if (mo) return `${MONTHS[parseInt(mo[2], 10) - 1]} ${mo[1]}`
  return periodKey
}

module.exports = {
  periodKeyFor,
  currentPeriodKey,
  periodLabel,
  isoWeek,
  civilParts,
}
