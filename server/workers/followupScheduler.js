// Scheduled auto-reminder job for the Follow-ups module (node-cron — already a
// project dependency; no new scheduler was added). Fires a primary nudge and an
// optional secondary nudge at the configured local day/time (Asia/Karachi),
// sending ONE reminder per still-pending member via the active provider.
//
// Live behavior each run: the kill switch (autoRemindersEnabled) and provider
// are read fresh from settings, so toggling the kill switch takes effect without
// a restart. The schedule TIMES are (re)registered by schedule()/reschedule() —
// the settings route calls reschedule() after a change so new times apply live.
//
// With the wa_link provider the job can't actually deliver (clicks are manual),
// so it just builds the queue of 'queued' ReminderLogs that surface in the
// Reminders screen for the admin to click through.

const cron = require('node-cron')
const config = require('../config')
const settings = require('../services/followupSettingsService')
const reminderService = require('../services/reminderService')

let jobs = []

const DOW = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }

// 'mon 10:00' → '0 10 * * 1'. Returns null for blank/invalid specs.
const toCron = (spec) => {
  if (!spec) return null
  const m = /^([a-z]{3})\s+(\d{1,2}):(\d{2})$/i.exec(String(spec).trim())
  if (!m) return null
  const dow = DOW[m[1].toLowerCase()]
  if (dow === undefined) return null
  const hour = parseInt(m[2], 10)
  const min = parseInt(m[3], 10)
  if (hour > 23 || min > 59) return null
  return `${min} ${hour} * * ${dow}`
}

const runNudge = async (which) => {
  const s = settings.get()
  if (!s.autoRemindersEnabled) {
    console.log(`[followups] auto-reminders OFF (kill switch) — ${which} nudge skipped`)
    return { skipped: true }
  }
  try {
    const result = await reminderService.send({
      scope: { type: 'all' },
      force: false, // throttle still applies, so the secondary only hits those due
      triggeredBy: `scheduler:${which}`,
    })
    console.log(
      `[followups] ${which} nudge → provider=${result.provider} sent=${result.sent} ` +
        `queued=${result.queued} failed=${result.failed} throttled=${result.throttled}`,
    )
    return result
  } catch (e) {
    console.warn(`[followups] ${which} nudge failed:`, e.message)
    return { error: e.message }
  }
}

const clear = () => {
  jobs.forEach((j) => j.stop())
  jobs = []
}

const schedule = async () => {
  clear()
  let s
  try {
    s = await settings.getFresh()
  } catch (_) {
    s = settings.defaults()
  }
  const tz = config.followups.timezone
  for (const [which, spec] of [
    ['primary', s.schedulePrimary],
    ['secondary', s.scheduleSecondary],
  ]) {
    const expr = toCron(spec)
    if (!expr) continue
    jobs.push(cron.schedule(expr, () => runNudge(which), { timezone: tz }))
    console.log(`[followups] ${which} nudge scheduled — '${spec}' (${expr}) tz=${tz}`)
  }
  if (!jobs.length) console.log('[followups] no auto-reminder nudges scheduled')
}

const start = () => schedule()
const reschedule = () => schedule()

module.exports = { start, reschedule, runNudge, toCron }
