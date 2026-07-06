const config = require('../config')
const Mailbox = require('../models/Mailbox')

// Rotation, rate-limiting and warmup logic for sending mailboxes.

const EPOCH = new Date(0)

const nextLocalMidnight = (from) => {
  const d = new Date(from)
  d.setHours(24, 0, 0, 0)
  return d
}

const nextLocalHour = (from) => {
  const d = new Date(from)
  d.setMinutes(60, 0, 0)
  return d
}

// Reset day/hour counters when their window has elapsed. Mutates the doc.
// Returns true if anything rolled over (caller persists only when needed).
const resetCountersIfDue = (mailbox) => {
  const now = new Date()
  let rolled = false

  if (!mailbox.dayResetAt || now >= mailbox.dayResetAt) {
    mailbox.sentToday = 0
    mailbox.dayResetAt = nextLocalMidnight(now)
    rolled = true
  }

  if (!mailbox.hourResetAt || now >= mailbox.hourResetAt) {
    mailbox.sentThisHour = 0
    mailbox.hourResetAt = nextLocalHour(now)
    rolled = true
  }

  return rolled
}

// The daily cap in effect, factoring in warmup ramp-up.
const effectiveDailyCap = (mailbox) => {
  const base = mailbox.dailyLimit
  if (mailbox.warmupEnabled && mailbox.warmupStartDate) {
    const daysSince = Math.floor(
      (Date.now() - new Date(mailbox.warmupStartDate).getTime()) /
        (24 * 60 * 60 * 1000),
    )
    const week = Math.floor(daysSince / 7) + 1
    if (week <= 4) {
      return Math.min(base, config.warmupWeeks[week - 1].max)
    }
  }
  return base
}

// Whether a mailbox can take a send right now. May auto-unpause / reset counters
// (persisting those side-effects). Async because it can save.
const isAvailable = async (mailbox) => {
  if (!mailbox.active) return false

  // Auto-unpause when the pause window has elapsed.
  if (
    mailbox.healthStatus === 'paused' &&
    mailbox.pausedUntil &&
    new Date() >= mailbox.pausedUntil
  ) {
    mailbox.healthStatus = 'healthy'
    mailbox.pausedUntil = undefined
    await mailbox.save()
  }

  if (mailbox.healthStatus === 'error' || mailbox.healthStatus === 'paused')
    return false

  if (resetCountersIfDue(mailbox)) await mailbox.save()

  return (
    mailbox.sentToday < effectiveDailyCap(mailbox) &&
    mailbox.sentThisHour < mailbox.hourlyLimit
  )
}

// Pick the next available mailbox from a set, least-recently-used first.
const pickNext = async (mailboxIds) => {
  const mailboxes = await Mailbox.find({
    _id: { $in: mailboxIds },
  }).select('+password')

  const available = []
  for (const mb of mailboxes) {
    if (await isAvailable(mb)) available.push(mb)
  }

  available.sort(
    (a, b) =>
      (a.lastUsedAt || EPOCH).getTime() - (b.lastUsedAt || EPOCH).getTime(),
  )

  return available[0] || null
}

// Record a successful send against a mailbox.
const recordSend = async (mailbox) => {
  resetCountersIfDue(mailbox)
  mailbox.sentToday += 1
  mailbox.sentThisHour += 1
  mailbox.lastUsedAt = new Date()
  await mailbox.save()
  return mailbox
}

const pause = async (mailboxId, until, reason) => {
  const mailbox = await Mailbox.findById(mailboxId)
  if (!mailbox) return null
  mailbox.healthStatus = 'paused'
  mailbox.pausedUntil = until
  mailbox.lastError = reason
  await mailbox.save()
  return mailbox
}

const resume = async (mailboxId) => {
  const mailbox = await Mailbox.findById(mailboxId)
  if (!mailbox) return null
  mailbox.healthStatus = 'healthy'
  mailbox.pausedUntil = undefined
  mailbox.lastError = undefined
  await mailbox.save()
  return mailbox
}

// Strip the password before returning a mailbox to any API consumer.
const sanitize = (mailbox) => {
  const obj = typeof mailbox.toObject === 'function' ? mailbox.toObject() : { ...mailbox }
  delete obj.password
  return obj
}

module.exports = {
  resetCountersIfDue,
  effectiveDailyCap,
  isAvailable,
  pickNext,
  recordSend,
  pause,
  resume,
  sanitize,
}
