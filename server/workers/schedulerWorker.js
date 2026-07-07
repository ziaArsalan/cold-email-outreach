// Outbound send scheduler. Drains the QueuedEmail queue one item at a time,
// rotating across mailboxes and applying human-like delays between sends. All
// SMTP/DB side-effects funnel through queueService + mailboxService so the loop
// itself stays testable (processOne is called directly by the acceptance test).

const config = require('../config')
const { Lead, Mailbox, Campaign, QueuedEmail } = require('../models')
const mailboxService = require('../services/mailboxService')
const campaignService = require('../services/campaignService')
const settingsService = require('../services/settingsService')
const {
  claimNext,
  markSent,
  markFailed,
  markBounced,
  markCancelled,
  reschedule,
  log,
  classifySendError,
} = require('../services/queueService')

// Uniform random int within the live-configured range for the send mode. Reads
// the effective settings (portal ?? env) so switching mode/delays takes effect
// on the next send with no restart.
const randomDelay = (mode) => {
  const s = settingsService.get()
  mode = mode || s.sendMode
  const range = s.delays[mode] || s.delays.warmup
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

    // Stop-on-reply: a pending follow-up must not send once the lead is out of
    // the funnel (replied/bounced/unsubscribed). Cancel it instead of sending.
    if (lead && ['replied', 'bounced', 'unsubscribed'].includes(lead.status)) {
      const refs = {
        queueId: item._id,
        mailboxId: mailbox._id,
        campaignId: item.campaignId,
      }
      await markCancelled(item, { errorMessage: 'stopped — lead ' + lead.status })
      await log('info', 'campaign', 'stopped — lead ' + lead.status, refs)
      return { cancelled: true }
    }

    const provider = providerFor(mailbox)

    try {
      const info = await provider.send({
        to,
        subject: item.subject,
        text: item.body,
        html:
          campaign && campaign.htmlEnabled
            ? item.body.replace(/\n/g, '<br/>')
            : null,
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

      // Best-effort follow-up scheduling — MUST run before the completion check
      // below, else a mid-sequence campaign would see 0 in-flight and wrongly
      // complete. Schedules the next step at sentAt + delay; never throws out of
      // the send path.
      try {
        const steps = campaignService.normalizeSteps(campaign || {})
        const next = item.stepIndex + 1
        if (
          campaign &&
          campaign.status === 'running' &&
          steps[next] &&
          lead &&
          !['replied', 'bounced', 'unsubscribed'].includes(lead.status)
        ) {
          const sentAt = item.sentAt || new Date()
          const when = new Date(
            sentAt.getTime() + steps[next].delayDays * config.followupDelayUnitMs,
          )
          await campaignService.enqueueStepForLead(campaign, lead, next, when)
        }
      } catch (_) {}

      // Best-effort campaign completion — when nothing is left in flight, mark it
      // completed. Must never fail the send. Runs AFTER the follow-up enqueue so
      // a scheduled next step keeps a mid-sequence campaign 'running'.
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
// Tracks the last-seen enabled state so we log the OFF→idle / ON→resume
// transitions once, not on every idle tick.
let wasEnabled = null

const start = (deps) => {
  if (started) return
  started = true
  console.log('[queueWorker] started — gating live via settings')

  const tick = async () => {
    const s = settingsService.get()

    // Gate every tick on the live setting — toggling OFF pauses sends within one
    // idle interval (no restart); toggling ON resumes them.
    if (!s.queueWorkerEnabled) {
      if (wasEnabled !== false) console.log('[queueWorker] paused via settings')
      wasEnabled = false
      timer = setTimeout(tick, s.workerIdleMs)
      return
    }
    if (wasEnabled === false) console.log('[queueWorker] resumed via settings')
    wasEnabled = true

    const r = await processOne(deps).catch(() => ({ error: true }))
    const delay =
      r && r.sent
        ? randomDelay(deps && deps.sendMode)
        : Math.min(s.workerIdleMs, randomDelay(deps && deps.sendMode))
    timer = setTimeout(tick, delay)
  }

  tick()
}

const stop = () => {
  if (timer) clearTimeout(timer)
  timer = null
  started = false
  wasEnabled = null
}

module.exports = { start, stop, processOne, randomDelay }
