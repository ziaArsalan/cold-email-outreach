// Outbound send scheduler. Drains the QueuedEmail queue one item at a time,
// rotating across mailboxes and applying human-like delays between sends. All
// SMTP/DB side-effects funnel through queueService + mailboxService so the loop
// itself stays testable (processOne is called directly by the acceptance test).

const config = require('../config')
const { Lead, Mailbox, Campaign, QueuedEmail } = require('../models')
const mailboxService = require('../services/mailboxService')
const campaignService = require('../services/campaignService')
const {
  claimNext,
  markSent,
  markFailed,
  markBounced,
  reschedule,
  log,
  classifySendError,
} = require('../services/queueService')

// Uniform random int within the configured range for the send mode.
const randomDelay = (mode = config.sendMode) => {
  const range = config.delays[mode] || config.delays.warmup
  return (
    Math.floor(Math.random() * (range.maxMs - range.minMs + 1)) + range.minMs
  )
}

// Process a single queue item end-to-end. Injectable deps keep it unit-testable.
const processOne = async (deps = {}) => {
  const providerFor = deps.providerFor || require('../services/smtp').providerFor
  const now = deps.now || (() => new Date())

  try {
    const item = await claimNext(now())
    if (!item) return { idle: true }

    // Campaign gating: only send when the owning campaign is running, inside its
    // schedule window, and under its daily cap. Otherwise requeue the item.
    let campaign = null
    if (item.campaignId) {
      const refs = { queueId: item._id, campaignId: item.campaignId }
      campaign = await Campaign.findById(item.campaignId)

      if (!campaign || campaign.status !== 'running') {
        await reschedule(item, { delayMs: config.workerTickGuardMs })
        await log('info', 'campaign', 'skip — campaign not running', refs)
        return { requeued: true }
      }

      if (!campaignService.isWithinWindow(campaign, now())) {
        await reschedule(item, { delayMs: config.workerIdleMs })
        await log('info', 'campaign', 'skip — outside schedule window', refs)
        return { requeued: true }
      }

      if (
        campaign.dailyLimit > 0 &&
        (await campaignService.sentTodayCount(campaign._id, now())) >=
          campaign.dailyLimit
      ) {
        const midnight = new Date(now())
        midnight.setHours(24, 0, 0, 0)
        await reschedule(item, { delayMs: midnight.getTime() - now().getTime() })
        await log('info', 'campaign', 'skip — daily limit reached', refs)
        return { requeued: true }
      }
    }

    // Pick the sending mailbox. Item pins a mailbox → rotate within just that
    // one; else campaign mailboxIds → rotate across those; else every active box.
    let mailboxIds
    if (item.mailboxId) {
      mailboxIds = [item.mailboxId]
    } else if (campaign && campaign.mailboxIds && campaign.mailboxIds.length) {
      mailboxIds = campaign.mailboxIds
    } else {
      const active = await Mailbox.find({ active: true }).select('_id')
      mailboxIds = active.map((m) => m._id)
    }

    const mailbox = await mailboxService.pickNext(mailboxIds)
    if (!mailbox) {
      await reschedule(item, { delayMs: config.workerTickGuardMs })
      await log('warn', 'rotation', 'no mailbox available', {
        queueId: item._id,
        campaignId: item.campaignId,
      })
      return { requeued: true }
    }

    const lead = await Lead.findById(item.leadId)
    const to = lead && lead.email
    if (!to) {
      await markFailed(item, {
        errorMessage: `lead ${item.leadId} missing or has no email`,
      })
      await log('error', 'error', 'lead missing or has no email', {
        queueId: item._id,
        mailboxId: mailbox._id,
        campaignId: item.campaignId,
      })
      return { failed: true }
    }

    const provider = providerFor(mailbox)

    try {
      const info = await provider.send({
        to,
        subject: item.subject,
        text: item.body,
        fromName: mailbox.name || process.env.FROM_NAME,
        fromEmail: mailbox.email,
      })

      await markSent(item, info.response)
      await mailboxService.recordSend(mailbox)

      // Best-effort lead status update — must not fail the send.
      try {
        lead.status = 'contacted'
        lead.lastContactDate = new Date()
        await lead.save()
      } catch (_) {}

      // Best-effort campaign completion — when nothing is left in flight, mark it
      // completed. Must never fail the send.
      try {
        if (item.campaignId && campaign && campaign.status === 'running') {
          const remaining = await QueuedEmail.countDocuments({
            campaignId: item.campaignId,
            status: { $in: ['pending', 'scheduled', 'sending'] },
          })
          if (remaining === 0) {
            campaign.status = 'completed'
            await campaign.save()
          }
        }
      } catch (_) {}

      await log('info', 'smtp', 'sent', {
        queueId: item._id,
        mailboxId: mailbox._id,
        campaignId: item.campaignId,
      })
      return { sent: true }
    } catch (err) {
      const category = classifySendError(err)
      const refs = {
        queueId: item._id,
        mailboxId: mailbox._id,
        campaignId: item.campaignId,
      }

      if (category === 'rate-limit') {
        const backoff = config.retry.backoffBaseMs * 2 ** item.retries
        await mailboxService.pause(
          mailbox._id,
          new Date(Date.now() + backoff),
          `rate-limit: ${err.message}`,
        )
        await reschedule(item, {
          delayMs: backoff,
          retriesIncrement: 0,
          errorMessage: err.message,
          smtpResponse: err.response,
        })
        await log('warn', 'rotation', `mailbox paused (rate-limit): ${err.message}`, refs)
        await log('warn', 'retry', `rescheduled after rate-limit in ${backoff}ms`, refs)
      } else if (category === 'auth-or-connection') {
        mailbox.healthStatus = 'error'
        mailbox.lastError = err.message
        await mailbox.save()
        await reschedule(item, {
          delayMs: config.retry.backoffBaseMs,
          retriesIncrement: 0,
          errorMessage: err.message,
        })
        await log('error', 'error', `auth/connection error: ${err.message}`, refs)
      } else if (category === 'permanent') {
        await markBounced(item, {
          errorMessage: err.message,
          smtpResponse: err.response,
        })
        try {
          lead.status = 'bounced'
          lead.bounceStatus = err.response
          await lead.save()
        } catch (_) {}
        await log('warn', 'smtp', `permanent failure (bounced): ${err.message}`, refs)
      } else {
        if (item.retries + 1 >= item.maxRetries) {
          await markFailed(item, {
            errorMessage: err.message,
            smtpResponse: err.response || String(err),
          })
          await log('error', 'retry', `gave up after ${item.retries + 1} attempts: ${err.message}`, refs)
        } else {
          const backoff = config.retry.backoffBaseMs * 2 ** item.retries
          await reschedule(item, {
            delayMs: backoff,
            retriesIncrement: 1,
            errorMessage: err.message,
            smtpResponse: err.response || String(err),
          })
          await log('warn', 'retry', `retry ${item.retries + 1} in ${backoff}ms: ${err.message}`, refs)
        }
      }

      return { failed: true, category }
    }
  } catch (err) {
    await log('error', 'error', `worker tick failed: ${err.message}`, {}, {
      stack: err.stack,
    })
    return { error: true }
  }
}

let started = false
let timer = null

const start = (deps) => {
  if (started) return
  if (!config.queueWorkerEnabled) {
    console.log('[queueWorker] disabled — not started')
    return
  }
  started = true
  console.log(`[queueWorker] started — sendMode=${config.sendMode}`)

  const tick = async () => {
    const r = await processOne(deps).catch(() => ({ error: true }))
    const delay =
      r && r.sent
        ? randomDelay(deps && deps.sendMode)
        : Math.min(config.workerIdleMs, randomDelay(deps && deps.sendMode))
    timer = setTimeout(tick, delay)
  }

  tick()
}

const stop = () => {
  if (timer) clearTimeout(timer)
  timer = null
  started = false
}

module.exports = { start, stop, processOne, randomDelay }
