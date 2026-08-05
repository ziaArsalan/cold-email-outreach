// Single source of truth for the "day" boundary used by daily send caps and
// counter resets. Computed in config.dailyResetTimezone (default UTC) so the
// reset lands at LOCAL midnight rather than the server's UTC clock. Used by
// mailboxService (sentToday reset), campaignService (sentTodayCount), and the
// scheduler (reschedule-to-next-reset when a daily cap is hit) — keeping all
// three in agreement.

const config = require('../config')

const tz = () => config.dailyResetTimezone

// Wall-clock seconds elapsed since local midnight in a timezone (via Intl).
const secondsIntoDay = (date, timeZone) => {
  const p = {}
  for (const x of new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date))
    p[x.type] = x.value
  const hour = parseInt(p.hour, 10) % 24 // some envs emit '24' at midnight
  return hour * 3600 + parseInt(p.minute, 10) * 60 + parseInt(p.second, 10)
}

// Most recent local midnight (as a UTC instant) in the configured timezone.
const startOfDay = (now = new Date()) => {
  const t = tz()
  if (!t || t === 'UTC') {
    const d = new Date(now)
    d.setUTCHours(0, 0, 0, 0)
    return d
  }
  try {
    return new Date(now.getTime() - secondsIntoDay(now, t) * 1000)
  } catch {
    const d = new Date(now)
    d.setUTCHours(0, 0, 0, 0)
    return d
  }
}

// Next local midnight (as a UTC instant) in the configured timezone.
const nextMidnight = (now = new Date()) => {
  const t = tz()
  if (!t || t === 'UTC') {
    const d = new Date(now)
    d.setUTCHours(24, 0, 0, 0)
    return d
  }
  try {
    return new Date(now.getTime() + (86400 - secondsIntoDay(now, t)) * 1000)
  } catch {
    const d = new Date(now)
    d.setUTCHours(24, 0, 0, 0)
    return d
  }
}

module.exports = { startOfDay, nextMidnight, secondsIntoDay }
