// Queue operations for the outbound send worker. Pure data/model layer — no
// SMTP or express here. The scheduler worker (server/workers/schedulerWorker.js)
// drives these transitions.

const { QueuedEmail, SendLog } = require('../models')

// Create a pending queue item. scheduledAt null = eligible immediately.
const enqueue = async ({
  campaignId,
  leadId,
  mailboxId,
  stepIndex = 0,
  subject,
  body,
  scheduledAt,
}) => {
  return QueuedEmail.create({
    campaignId,
    leadId,
    mailboxId,
    stepIndex,
    subject,
    body,
    status: 'pending',
    scheduledAt: scheduledAt || null,
  })
}

// Atomically claim the next eligible pending item, flipping it to 'sending' so
// no two workers can grab the same one. Returns the doc or null.
const claimNext = async (now = new Date()) => {
  return QueuedEmail.findOneAndUpdate(
    {
      status: 'pending',
      $or: [{ scheduledAt: null }, { scheduledAt: { $lte: now } }],
    },
    { $set: { status: 'sending' } },
    { sort: { scheduledAt: 1, createdAt: 1 }, new: true },
  )
}

const markSent = async (item, smtpResponse) => {
  item.status = 'sent'
  item.sentAt = new Date()
  item.smtpResponse = smtpResponse
  return item.save()
}

// Push an item back to 'pending' for a later attempt. retriesIncrement lets the
// caller decide whether this attempt burns a retry (transient causes do not).
const reschedule = async (
  item,
  { delayMs, retriesIncrement = 0, errorMessage, smtpResponse },
) => {
  item.status = 'pending'
  item.scheduledAt = new Date(Date.now() + delayMs)
  item.retries += retriesIncrement
  if (errorMessage !== undefined) item.errorMessage = errorMessage
  if (smtpResponse !== undefined) item.smtpResponse = smtpResponse
  return item.save()
}

const markFailed = async (item, { errorMessage, smtpResponse }) => {
  item.status = 'failed'
  if (errorMessage !== undefined) item.errorMessage = errorMessage
  if (smtpResponse !== undefined) item.smtpResponse = smtpResponse
  return item.save()
}

const markBounced = async (item, { errorMessage, smtpResponse }) => {
  item.status = 'bounced'
  if (errorMessage !== undefined) item.errorMessage = errorMessage
  if (smtpResponse !== undefined) item.smtpResponse = smtpResponse
  return item.save()
}

// Cancel an item without sending — used when a follow-up is no longer wanted
// (e.g. the lead already replied/bounced/unsubscribed before it was due).
const markCancelled = async (item, { errorMessage }) => {
  item.status = 'cancelled'
  if (errorMessage !== undefined) item.errorMessage = errorMessage
  return item.save()
}

// Append a structured log line. Never let logging break a send.
const log = async (level, category, message, refs = {}, meta = {}) => {
  try {
    return await SendLog.create({ level, category, message, refs, meta })
  } catch (_) {
    return null
  }
}

// Bucket an SMTP/transport error so the worker can decide how to react.
const classifySendError = (err) => {
  const text = err.response || err.message || ''
  const rateLimitCodes = [421, 450, 451, 452, 454, 554]
  if (
    rateLimitCodes.includes(err.responseCode) ||
    /too many|rate|throttl|spam|blocked/i.test(text)
  )
    return 'rate-limit'

  const connCodes = [
    'EAUTH',
    'ECONNECTION',
    'ETIMEDOUT',
    'ENOTFOUND',
    'ESOCKET',
    'ECONNREFUSED',
  ]
  if (connCodes.includes(err.code)) return 'auth-or-connection'

  if (err.responseCode >= 500 && err.responseCode < 600) return 'permanent'

  return 'unknown'
}

module.exports = {
  enqueue,
  claimNext,
  markSent,
  reschedule,
  markFailed,
  markBounced,
  markCancelled,
  log,
  classifySendError,
}
