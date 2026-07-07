// In-process acceptance test for multi-step follow-up sequences (T-015).
// Creates throwaway __QSEQ__ templates/leads/campaigns, drives campaignService
// .start() + processOne() directly with INJECTED FAKE providers (never real
// SMTP), asserts the step-scheduling / stop-on-reply / regression behavior, then
// cleans everything up. Requires a running local mongod.
//
//   node server/scripts/testSequences.js
//
// Sends NO real email — every provider here is a fake stub. The follow-up "day"
// unit is shrunk to 200ms and MX checks are disabled so the run stays fast.

const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

// Shrink the follow-up delay unit + skip DNS/MX screening BEFORE config loads.
process.env.FOLLOWUP_DELAY_UNIT_MS = '200'
process.env.EMAIL_VERIFY_CHECK_MX = 'false'

const mongoose = require('mongoose')
const config = require('../config')
const { Lead, Template, Campaign, QueuedEmail, SendLog } = require('../models')
const campaignService = require('../services/campaignService')
const { processOne } = require('../workers/schedulerWorker')

const failures = []
const assert = (cond, msg) => {
  if (!cond) failures.push(msg)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const happyProvider = () => ({
  send: async () => ({ response: '250 OK fake' }),
})

const makeMailbox = (n) => ({
  name: `__QSEQ__${n}`,
  email: `qseq-${n}@example.com`,
  provider: 'smtp',
  host: 'smtp.invalid.local',
  port: 465,
  secure: true,
  username: `qseq-${n}`,
  password: 'dummy',
  dailyLimit: 1000,
  hourlyLimit: 1000,
  sentToday: 0,
  sentThisHour: 0,
  warmupEnabled: false,
  healthStatus: 'healthy',
  active: true,
})

const Mailbox = require('../models').Mailbox

// Single-link (deliverability-passing) template.
const makeTemplate = (name, body) =>
  Template.create({
    name,
    subject: 'Hi {{first_name}}',
    body: body || 'Hi {{first_name}}, quick note from us. {{ai_intro}}',
    signature: 'Cheers,\nZia',
    active: true,
  })

const makeLead = (tag) =>
  Lead.create({
    email: `__qseq__${tag}@example.com`,
    firstName: 'Test',
    status: 'new',
    aiIntro: 'I saw your work — impressive.',
  })

const cleanupFixtures = async () => {
  const leads = await Lead.find({ email: /^__qseq__/i }).select('_id')
  const leadIds = leads.map((l) => l._id)
  const camps = await Campaign.find({ name: /^__QSEQ__/ }).select('_id')
  const campIds = camps.map((c) => c._id)
  await QueuedEmail.deleteMany({
    $or: [{ leadId: { $in: leadIds } }, { campaignId: { $in: campIds } }],
  })
  await SendLog.deleteMany({ 'refs.campaignId': { $in: campIds } })
  await Lead.deleteMany({ email: /^__qseq__/i })
  await Template.deleteMany({ name: /^__QSEQ__/ })
  await Campaign.deleteMany({ name: /^__QSEQ__/ })
  await Mailbox.deleteMany({ name: /^__QSEQ__/ })
}

const run = async () => {
  await mongoose.connect(config.mongoUri)
  await cleanupFixtures()

  assert(
    config.followupDelayUnitMs === 200,
    `precondition: followupDelayUnitMs should be 200, got ${config.followupDelayUnitMs}`,
  )

  await Mailbox.create(makeMailbox('A'))
  const happyDeps = { providerFor: happyProvider }

  const t1 = await makeTemplate('__QSEQ__t1')
  const t2 = await makeTemplate('__QSEQ__t2')

  // ── (a) start enqueues ONLY step 0 ─────────────────────────────────────────
  const leadA = await makeLead('a')
  const campA = await Campaign.create({
    name: '__QSEQ__A',
    templateId: t1._id,
    steps: [
      { order: 0, templateId: t1._id, delayDays: 0 },
      { order: 1, templateId: t2._id, delayDays: 1 },
    ],
    status: 'draft',
  })
  const startA = await campaignService.start(campA._id, { leadIds: [leadA._id] })
  assert(startA.enqueued === 1, `(a) expected 1 enqueued, got ${startA.enqueued}`)
  const aRows = await QueuedEmail.find({ campaignId: campA._id })
  assert(aRows.length === 1, `(a) expected 1 queue row, got ${aRows.length}`)
  assert(
    aRows.length === 1 && aRows[0].stepIndex === 0,
    `(a) the only row must be stepIndex 0, got ${aRows[0] && aRows[0].stepIndex}`,
  )

  // ── (b) step0 sends → step1 scheduled at sentAt+delay, not sent early ───────
  const r0 = await processOne(happyDeps)
  assert(r0 && r0.sent, `(b) step0 should send, got ${JSON.stringify(r0)}`)
  const step0 = await QueuedEmail.findOne({
    campaignId: campA._id,
    stepIndex: 0,
  })
  const step1 = await QueuedEmail.findOne({
    campaignId: campA._id,
    stepIndex: 1,
  })
  assert(!!step1, `(b) a step1 row should now exist`)
  if (step1) {
    assert(
      step1.status === 'pending',
      `(b) step1 should be pending, got ${step1.status}`,
    )
    const expected = step0.sentAt.getTime() + 1 * 200
    const drift = Math.abs(step1.scheduledAt.getTime() - expected)
    assert(
      drift <= 80,
      `(b) step1 scheduledAt should be ~sentAt+200ms (drift ${drift}ms)`,
    )
    assert(
      step1.scheduledAt.getTime() > Date.now(),
      `(b) step1 scheduledAt should still be in the future right after send`,
    )
  }
  // Immediate tick must NOT send the not-yet-due follow-up.
  const rEarly = await processOne(happyDeps)
  assert(
    rEarly && rEarly.idle,
    `(b) early tick should be idle (follow-up not due), got ${JSON.stringify(rEarly)}`,
  )
  const step1Early = await QueuedEmail.findById(step1._id)
  assert(
    step1Early.status === 'pending',
    `(b) step1 must remain pending before its time, got ${step1Early.status}`,
  )
  // After the delay elapses, it sends.
  await sleep(300)
  const rLate = await processOne(happyDeps)
  assert(rLate && rLate.sent, `(b) step1 should send once due, got ${JSON.stringify(rLate)}`)
  const step1Sent = await QueuedEmail.findById(step1._id)
  assert(
    step1Sent.status === 'sent',
    `(b) step1 should be sent after its time, got ${step1Sent.status}`,
  )

  // ── (c) stop-on-reply cancels a due follow-up ──────────────────────────────
  const leadC = await makeLead('c')
  const campC = await Campaign.create({
    name: '__QSEQ__C',
    templateId: t1._id,
    steps: [
      { order: 0, templateId: t1._id, delayDays: 0 },
      { order: 1, templateId: t2._id, delayDays: 1 },
    ],
    status: 'draft',
  })
  await campaignService.start(campC._id, { leadIds: [leadC._id] })
  const c0 = await processOne(happyDeps)
  assert(c0 && c0.sent, `(c) step0 should send, got ${JSON.stringify(c0)}`)
  const cStep1 = await QueuedEmail.findOne({ campaignId: campC._id, stepIndex: 1 })
  assert(!!cStep1, `(c) a step1 row should be scheduled`)
  // Lead replies before the follow-up is due.
  const freshC = await Lead.findById(leadC._id)
  freshC.status = 'replied'
  await freshC.save()
  await sleep(300)
  const cLate = await processOne(happyDeps)
  assert(
    cLate && cLate.cancelled,
    `(c) due follow-up should be cancelled after reply, got ${JSON.stringify(cLate)}`,
  )
  const cStep1After = await QueuedEmail.findById(cStep1._id)
  assert(
    cStep1After.status === 'cancelled',
    `(c) step1 should be cancelled not sent, got ${cStep1After.status}`,
  )
  const cStep2 = await QueuedEmail.findOne({ campaignId: campC._id, stepIndex: 2 })
  assert(!cStep2, `(c) no step2 should be scheduled after a cancel`)

  // ── (d) no-steps regression: single send, no follow-up ─────────────────────
  const leadD = await makeLead('d')
  const campD = await Campaign.create({
    name: '__QSEQ__D',
    templateId: t1._id,
    steps: [],
    status: 'draft',
  })
  const startD = await campaignService.start(campD._id, { leadIds: [leadD._id] })
  assert(startD.enqueued === 1, `(d) expected 1 enqueued, got ${startD.enqueued}`)
  const d0 = await processOne(happyDeps)
  assert(d0 && d0.sent, `(d) single email should send, got ${JSON.stringify(d0)}`)
  const dStep1 = await QueuedEmail.findOne({ campaignId: campD._id, stepIndex: 1 })
  assert(!dStep1, `(d) no-steps campaign must not create a step1 row`)
  const dTotal = await QueuedEmail.countDocuments({ campaignId: campD._id })
  assert(dTotal === 1, `(d) no-steps campaign should have exactly 1 row, got ${dTotal}`)

  // ── (e) deliverability: 2-link step-2 template blocks the start ────────────
  const tBad = await makeTemplate(
    '__QSEQ__tbad',
    'Hi {{first_name}} see https://a.com and https://b.com',
  )
  const leadE = await makeLead('e')
  const campE = await Campaign.create({
    name: '__QSEQ__E',
    templateId: t1._id,
    steps: [
      { order: 0, templateId: t1._id, delayDays: 0 },
      { order: 1, templateId: tBad._id, delayDays: 1 },
    ],
    status: 'draft',
  })
  let threw = null
  try {
    await campaignService.start(campE._id, { leadIds: [leadE._id] })
  } catch (err) {
    threw = err
  }
  assert(!!threw, `(e) start should throw on a bad step-2 template`)
  assert(
    threw && /Step 2/.test(threw.message),
    `(e) error should mention 'Step 2', got ${threw && threw.message}`,
  )
  const eRows = await QueuedEmail.countDocuments({ campaignId: campE._id })
  assert(eRows === 0, `(e) a blocked start must enqueue 0 rows, got ${eRows}`)

  await cleanupFixtures()
  await mongoose.disconnect()
}

run()
  .then(() => {
    if (failures.length) {
      console.error(failures.map((f) => ` - ${f}`).join('\n'))
      console.error('SEQUENCES FAIL')
      process.exit(1)
    }
    console.log('SEQUENCES PASS')
    process.exit(0)
  })
  .catch(async (err) => {
    console.error(err)
    try {
      await cleanupFixtures()
      await mongoose.disconnect()
    } catch (_) {}
    console.error('SEQUENCES FAIL')
    process.exit(1)
  })
