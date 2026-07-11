// Campaign lifecycle + enqueue logic for T-011. Turns a draft campaign into a
// batch of QueuedEmail items (one per targeted lead), and owns the state machine
// (draft → running ↔ paused → stopped/completed). The scheduler worker consults
// isWithinWindow / sentTodayCount to decide whether an item may send right now.
//
// No SMTP here — sends flow through the worker. AI intros reuse the same cache
// semantics as POST /leads/:id/preview (only call the model when aiIntro blank).

const { Lead, Template, Campaign, QueuedEmail } = require('../models')
const { generateIntro } = require('./aiService')
const { enqueue, log } = require('./queueService')
const { render } = require('./templateService')
const { validateBody } = require('./deliverabilityService')
const { verifyEmail } = require('./emailVerificationService')
const settingsService = require('./settingsService')

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

// Raise a transition/validation error the route layer maps to HTTP 400.
const badRequest = (message) => {
  const err = new Error(message)
  err.status = 400
  return err
}

// Local start-of-day for `now`.
const startOfDay = (now = new Date()) => {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d
}

// The campaign's steps as an ordered array. A campaign with explicit steps →
// a copy sorted by order; otherwise a single synthetic step-0 wrapping the
// legacy templateId (delay 0), so no-sequence campaigns behave exactly as before.
const normalizeSteps = (campaign) => {
  if (campaign.steps && campaign.steps.length)
    return [...campaign.steps].sort((a, b) => a.order - b.order)
  return [{ order: 0, templateId: campaign.templateId, delayDays: 0 }]
}

// Render + enqueue one step for a lead. Reuses the lead's cached aiIntro (no AI
// call here — step 0's start() already primes it). scheduledAt null = immediate.
const enqueueStepForLead = async (campaign, lead, stepIndex, scheduledAt) => {
  const step = normalizeSteps(campaign)[stepIndex]
  const template = await Template.findById(step.templateId)
  if (!template) throw badRequest(`Step ${stepIndex + 1} template not found`)

  const vars = {
    first_name: lead.firstName || '',
    last_name: lead.lastName || '',
    company: lead.company || '',
    industry: lead.industry || '',
    website: lead.website || '',
    ai_intro: lead.aiIntro || '',
  }
  const renderedSubject = render(template.subject, vars)
  let body = render(template.body, vars)
  if (template.signature) body += '\n\n' + render(template.signature, vars)
  let subject = renderedSubject

  // Per-lead full body override — initial email (step 0) only. When set, send the
  // custom body verbatim (custom subject if provided, else the rendered one).
  // Follow-up steps always render their own templates.
  if (
    stepIndex === 0 &&
    typeof lead.bodyOverride === 'string' &&
    lead.bodyOverride.trim()
  ) {
    body = lead.bodyOverride
    subject = lead.subjectOverride || renderedSubject
  }

  return enqueue({
    campaignId: campaign._id,
    leadId: lead._id,
    subject,
    body,
    stepIndex,
    scheduledAt,
    maxRetries: settingsService.get().maxRetries,
  })
}

// Resolve which leads a campaign should target. Explicit leadIds → exactly those;
// otherwise every fresh ('new') lead. Excludes leads already holding an in-flight
// (pending|scheduled|sending) QueuedEmail for this campaign — the double-enqueue
// guard, so re-running start never duplicates work.
const targetLeads = async (campaign, leadIds) => {
  let leads
  if (Array.isArray(leadIds) && leadIds.length) {
    leads = await Lead.find({ _id: { $in: leadIds } })
  } else if (campaign.listId) {
    leads = await Lead.find({ listId: campaign.listId, status: 'new' })
  } else {
    leads = await Lead.find({ status: 'new' })
  }
  if (!leads.length) return []

  const inflight = await QueuedEmail.find({
    campaignId: campaign._id,
    leadId: { $in: leads.map((l) => l._id) },
    status: { $in: ['pending', 'scheduled', 'sending'] },
  }).select('leadId')
  const excluded = new Set(inflight.map((q) => String(q.leadId)))

  return leads.filter((l) => !excluded.has(String(l._id)))
}

// Enqueue one email per targeted lead and flip the campaign to running. Only
// valid from 'draft'. Returns { enqueued: N }. Sends nothing itself.
const start = async (campaignId, { leadIds } = {}) => {
  const campaign = await Campaign.findById(campaignId)
  if (!campaign) throw badRequest('Campaign not found')
  if (campaign.status !== 'draft')
    throw badRequest('Only draft campaigns can be started')

  const steps = normalizeSteps(campaign)
  if (!steps[0].templateId)
    throw badRequest('Campaign has no valid template — set templateId first')

  // Deliverability gate: validate EVERY step's template body+signature before the
  // enqueue loop. Doing it here (not per-lead) prevents partially enqueuing a
  // batch on a bad template — the links/images live in the template itself, and
  // the per-lead ai_intro is length/format-constrained by the AI prompt, so a
  // template that passes here passes for every lead. A bad follow-up template
  // blocks the whole start so we never enqueue step 0 for a doomed sequence.
  for (let i = 0; i < steps.length; i++) {
    const t = await Template.findById(steps[i].templateId)
    if (!t) throw badRequest(`Step ${i + 1} template not found`)
    const composed = t.body + (t.signature ? '\n\n' + t.signature : '')
    const check = validateBody(composed)
    if (!check.ok)
      throw badRequest(
        `Step ${i + 1} template fails deliverability rules: ${check.errors[0]}`,
      )
  }

  // Atomically claim the campaign draft→running BEFORE enqueuing, so a
  // double-click (or any concurrent double-submit) can't enqueue the batch
  // twice. Only one request wins the findOneAndUpdate; the loser sees the
  // campaign is no longer a draft. Deliverability is validated above (pre-claim)
  // so a bad template still leaves the campaign in draft.
  const claimed = await Campaign.findOneAndUpdate(
    { _id: campaignId, status: 'draft' },
    { $set: { status: 'running' } },
    { new: true },
  )
  if (!claimed)
    throw badRequest('Campaign is already being started (or is no longer a draft)')

  // From here the campaign is 'running' with nothing enqueued yet (the worker
  // has no items to send until this loop finishes). If enqueuing throws, roll
  // the status back to draft so the user can fix and retry — leads already
  // enqueued in the partial run stay 'queued' and are excluded on retry (the
  // status:'new' filter + the in-flight dedupe), so a retry never double-sends.
  try {
    return await enqueueBatch(campaign, leadIds)
  } catch (err) {
    await Campaign.updateOne(
      { _id: campaignId, status: 'running' },
      { $set: { status: 'draft' } },
    )
    throw err
  }
}

// The targeting → screening → AI-intro → enqueue batch, split out of start() so
// start() can wrap it in the claim/rollback guard above. Returns { enqueued, skipped }.
const enqueueBatch = async (campaign, leadIds) => {
  const targeted = await targetLeads(campaign, leadIds)

  // Free pre-send screening — format/MX/disposable/role-based. Runs before AI
  // generation and enqueue so a bad address never costs an AI call or an SMTP
  // attempt. Not a paid mailbox-exists verifier, just cheap upfront filtering.
  const leads = []
  let skipped = 0
  for (const lead of targeted) {
    const { valid, reason } = await verifyEmail(lead.email)
    lead.emailCheckStatus = valid ? 'valid' : 'invalid'
    lead.emailCheckReason = valid ? undefined : reason
    if (!valid) {
      lead.status = 'failed'
      await lead.save()
      skipped += 1
    } else {
      await lead.save()
      leads.push(lead)
    }
  }
  if (skipped)
    await log(
      'warn',
      'campaign',
      `campaign ${campaign._id}: skipped ${skipped} lead(s) with invalid emails at start`,
      { campaignId: campaign._id },
    )

  const missingIntros = leads.filter((l) => !(l.aiIntro && l.aiIntro.trim()))
  if (missingIntros.length > 10)
    await log(
      'warn',
      'campaign',
      `starting campaign ${campaign._id}: ${missingIntros.length} leads need AI intros (will generate on enqueue)`,
      { campaignId: campaign._id },
    )

  let enqueued = 0
  for (const lead of leads) {
    // Same cache semantics as /leads/:id/preview — only call AI when blank.
    if (!(lead.aiIntro && lead.aiIntro.trim())) {
      const { intro, subject } = await generateIntro(lead, campaign.aiPrompt)
      lead.aiIntro = intro
      if (!lead.aiSubject) lead.aiSubject = subject
      await lead.save()
    }

    // Enqueue only step 0 now; the worker schedules each follow-up after the
    // prior step actually sends (so delays run from real send times).
    await enqueueStepForLead(campaign, lead, 0, null)

    lead.status = 'queued'
    lead.campaignId = campaign._id
    await lead.save()
    enqueued += 1
  }

  return { enqueued, skipped }
}

const pause = async (id) => {
  const campaign = await Campaign.findById(id)
  if (!campaign) throw badRequest('Campaign not found')
  if (!['draft', 'running'].includes(campaign.status))
    throw badRequest(`Cannot pause a ${campaign.status} campaign`)
  campaign.status = 'paused'
  await campaign.save()
  return campaign
}

const resume = async (id) => {
  const campaign = await Campaign.findById(id)
  if (!campaign) throw badRequest('Campaign not found')
  if (campaign.status !== 'paused')
    throw badRequest(`Cannot resume a ${campaign.status} campaign`)
  campaign.status = 'running'
  await campaign.save()
  return campaign
}

const stop = async (id) => {
  const campaign = await Campaign.findById(id)
  if (!campaign) throw badRequest('Campaign not found')
  if (!['draft', 'running', 'paused'].includes(campaign.status))
    throw badRequest(`Cannot stop a ${campaign.status} campaign`)
  campaign.status = 'stopped'
  await campaign.save()
  // Cancel the not-yet-sent items so nothing more goes out…
  const pending = await QueuedEmail.find({
    campaignId: campaign._id,
    status: { $in: ['pending', 'scheduled'] },
  }).select('leadId')
  await QueuedEmail.updateMany(
    { campaignId: campaign._id, status: { $in: ['pending', 'scheduled'] } },
    { $set: { status: 'cancelled', errorMessage: 'campaign stopped' } },
  )
  // …and release their leads back to 'new' (they were never sent), so they can
  // be targeted again by a re-start or another campaign instead of being
  // stranded in 'queued' with no live queue item.
  const leadIds = pending.map((q) => q.leadId)
  if (leadIds.length)
    await Lead.updateMany(
      { _id: { $in: leadIds }, status: 'queued' },
      { $set: { status: 'new' } },
    )
  return campaign
}

// Send a terminal campaign back to 'draft' so it can be edited and re-started.
// Only from stopped/completed. Re-Start then re-targets eligible ('new') leads —
// already-contacted leads are naturally excluded, so a restart never re-emails.
const reopen = async (id) => {
  const campaign = await Campaign.findById(id)
  if (!campaign) throw badRequest('Campaign not found')
  if (!['stopped', 'completed'].includes(campaign.status))
    throw badRequest(`Cannot restart a ${campaign.status} campaign`)
  campaign.status = 'draft'
  await campaign.save()
  return campaign
}

// Delete a campaign that is not actively running (pause/stop it first), and
// clean up its queue items + send logs so nothing dangles.
const remove = async (id) => {
  const campaign = await Campaign.findById(id)
  if (!campaign) throw badRequest('Campaign not found')
  if (campaign.status === 'running')
    throw badRequest('Pause or stop the campaign before deleting it')
  await QueuedEmail.deleteMany({ campaignId: campaign._id })
  await Campaign.findByIdAndDelete(id)
  return { deleted: true }
}

// Whether `now` falls inside the campaign's send window. No schedule → always
// open. days: three-letter lowercase (['mon'..'sun']); empty days = every day.
// Time window is [startTime, endTime); supports overnight (end < start).
const isWithinWindow = (campaign, now = new Date()) => {
  const schedule = campaign.schedule || {}
  const { days, startTime, endTime } = schedule
  const hasDays = Array.isArray(days) && days.length
  if (!hasDays && !startTime && !endTime) return true

  if (hasDays) {
    const today = DAYS[now.getDay()]
    if (!days.includes(today)) return false
  }

  if (startTime && endTime) {
    const nowMin = now.getHours() * 60 + now.getMinutes()
    const toMin = (t) => {
      const [h, m] = t.split(':').map(Number)
      return h * 60 + m
    }
    const s = toMin(startTime)
    const e = toMin(endTime)
    if (s === e) return true
    if (s < e) return nowMin >= s && nowMin < e
    // Overnight window (e.g. 22:00 → 06:00).
    return nowMin >= s || nowMin < e
  }

  return true
}

// How many emails this campaign has sent since local midnight.
const sentTodayCount = async (campaignId, now = new Date()) =>
  QueuedEmail.countDocuments({
    campaignId,
    status: 'sent',
    sentAt: { $gte: startOfDay(now) },
  })

// One aggregate → { campaignIdString: { pending, sending, sent, ... } } for the
// campaigns list. Statuses with no rows are simply absent from a campaign's map.
const countsByCampaign = async () => {
  const rows = await QueuedEmail.aggregate([
    { $group: { _id: { c: '$campaignId', s: '$status' }, n: { $sum: 1 } } },
  ])
  const out = {}
  for (const r of rows) {
    if (!r._id.c) continue
    const key = String(r._id.c)
    if (!out[key]) out[key] = {}
    out[key][r._id.s] = r.n
  }
  return out
}

// Global queue tallies by status → { pending, scheduled, ... } with every enum
// key present (missing statuses default to 0) for the dashboard cards.
const queueCountsByStatus = async () => {
  const out = {
    pending: 0,
    scheduled: 0,
    sending: 0,
    sent: 0,
    failed: 0,
    bounced: 0,
    cancelled: 0,
  }
  const rows = await QueuedEmail.aggregate([
    { $group: { _id: '$status', n: { $sum: 1 } } },
  ])
  for (const r of rows) if (r._id in out) out[r._id] = r.n
  return out
}

// Global lead tallies by status, every enum key present (missing = 0). Used for
// the lead-level reply/bounce rates on the dashboard.
const leadCountsByStatus = async () => {
  const out = {
    new: 0,
    queued: 0,
    contacted: 0,
    replied: 0,
    bounced: 0,
    unsubscribed: 0,
    failed: 0,
  }
  const rows = await Lead.aggregate([
    { $group: { _id: '$status', n: { $sum: 1 } } },
  ])
  for (const r of rows) if (r._id in out) out[r._id] = r.n
  return out
}

module.exports = {
  normalizeSteps,
  enqueueStepForLead,
  targetLeads,
  start,
  pause,
  resume,
  stop,
  reopen,
  remove,
  isWithinWindow,
  sentTodayCount,
  countsByCampaign,
  queueCountsByStatus,
  leadCountsByStatus,
}
