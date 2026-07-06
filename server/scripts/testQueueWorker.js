// In-process acceptance test for the send queue + scheduler worker (T-010).
// Creates throwaway __QTEST__ leads/mailboxes/queue items, drives processOne()
// directly with INJECTED FAKE providers (never real SMTP, never start()), then
// cleans everything up. Requires a running local mongod.
//
//   node server/scripts/testQueueWorker.js
//
// Sends NO real email — every provider here is a fake stub.

const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

const mongoose = require('mongoose')
const config = require('../config')
const { Lead, Mailbox, QueuedEmail, SendLog } = require('../models')
const { enqueue } = require('../services/queueService')
const { processOne } = require('../workers/schedulerWorker')

const failures = []
const assert = (cond, msg) => {
  if (!cond) failures.push(msg)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Collected for the SendLog cross-check + cleanup.
const allQueueIds = []
let expectedLogs = 0

const makeMailbox = (n) => ({
  name: `__QTEST__${n}`,
  email: `qtest-${n}@example.com`,
  provider: 'smtp',
  host: 'smtp.invalid.local',
  port: 465,
  secure: true,
  username: `qtest-${n}`,
  password: 'dummy',
  dailyLimit: 1000,
  hourlyLimit: 1000,
  sentToday: 0,
  sentThisHour: 0,
  warmupEnabled: false,
  healthStatus: 'healthy',
  active: true,
})

// Fake providers — pure stubs, no network.
const happyProvider = () => ({
  send: async () => ({ response: '250 OK fake' }),
})
const capturingProvider = (sink) => (mailbox) => ({
  send: async () => {
    sink.push(mailbox.email)
    return { response: '250 OK fake' }
  },
})
const throwing554 = () => ({
  send: async () => {
    const e = new Error('too many messages')
    e.responseCode = 554
    e.response = '554 5.7.1 too many messages'
    throw e
  },
})
const throwingBoom = () => ({
  send: async () => {
    throw new Error('boom')
  },
})

const cleanupFixtures = async () => {
  const oldLeads = await Lead.find({ email: /^__qtest__/i }).select('_id')
  const oldLeadIds = oldLeads.map((l) => l._id)
  await QueuedEmail.deleteMany({ leadId: { $in: oldLeadIds } })
  await QueuedEmail.deleteMany({ _id: { $in: allQueueIds } })
  await SendLog.deleteMany({ 'refs.queueId': { $in: allQueueIds } })
  await Lead.deleteMany({ email: /^__qtest__/i })
  await Mailbox.deleteMany({ name: /^__QTEST__/ })
}

const run = async () => {
  await mongoose.connect(config.mongoUri)
  await cleanupFixtures()

  // Fixtures: two isolated mailboxes + three leads.
  const [boxA, boxB] = await Mailbox.create([makeMailbox('A'), makeMailbox('B')])
  const [leadA, leadB, leadC] = await Lead.create([
    { email: '__QTEST__a@example.com', status: 'new' },
    { email: '__QTEST__b@example.com', status: 'new' },
    { email: '__QTEST__c@example.com', status: 'new' },
  ])

  // ── (a) enqueue 3, no worker call → all pending ────────────────────────────
  const abc = []
  for (const lead of [leadA, leadB, leadC]) {
    const q = await enqueue({
      leadId: lead._id,
      mailboxId: boxA._id,
      subject: 'hi',
      body: 'body',
    })
    abc.push(q._id)
    allQueueIds.push(q._id)
  }
  const pendingCount = await QueuedEmail.countDocuments({
    _id: { $in: abc },
    status: 'pending',
  })
  assert(pendingCount === 3, `(a) expected 3 pending, got ${pendingCount}`)

  // ── (b) happy sends, one at a time, with differing gaps ────────────────────
  const happyDeps = { providerFor: happyProvider }
  const sentTimes = []
  for (let i = 0; i < 3; i++) {
    // Manual, growing+jittered gaps stand in for the worker's randomDelay.
    await sleep(40 + i * 70 + Math.floor(Math.random() * 30))
    const r = await processOne(happyDeps)
    sentTimes.push(Date.now())
    assert(r && r.sent, `(b) tick ${i + 1} should send, got ${JSON.stringify(r)}`)
    expectedLogs += 1
    const sent = await QueuedEmail.countDocuments({
      _id: { $in: abc },
      status: 'sent',
    })
    assert(sent === i + 1, `(b) after tick ${i + 1} expected ${i + 1} sent, got ${sent}`)
  }
  const gaps = [sentTimes[1] - sentTimes[0], sentTimes[2] - sentTimes[1]]
  assert(
    new Set(gaps).size >= 2,
    `(b) expected inter-send gaps to differ, got ${JSON.stringify(gaps)}`,
  )

  // ── (c) alternation across two mailboxes ───────────────────────────────────
  const used = []
  const altDeps = { providerFor: capturingProvider(used) }
  const q1 = await enqueue({ leadId: leadA._id, mailboxId: boxA._id, subject: 's', body: 'b' })
  const q2 = await enqueue({ leadId: leadB._id, mailboxId: boxB._id, subject: 's', body: 'b' })
  allQueueIds.push(q1._id, q2._id)
  const alt1 = await processOne(altDeps)
  const alt2 = await processOne(altDeps)
  expectedLogs += 2
  assert(alt1 && alt1.sent && alt2 && alt2.sent, `(c) both alternation ticks should send`)
  assert(
    used.length === 2 && used[0] === boxA.email && used[1] === boxB.email,
    `(c) expected alternation [${boxA.email}, ${boxB.email}], got ${JSON.stringify(used)}`,
  )

  // ── (c) 554 on A → pause A, requeue item, retries untouched ────────────────
  const qRl = await enqueue({ leadId: leadC._id, mailboxId: boxA._id, subject: 's', body: 'b' })
  allQueueIds.push(qRl._id)
  const rlRes = await processOne({ providerFor: throwing554 })
  expectedLogs += 2 // rotation (pause) + retry (reschedule)
  assert(rlRes && rlRes.category === 'rate-limit', `(c) 554 should classify rate-limit, got ${JSON.stringify(rlRes)}`)
  const freshA = await Mailbox.findById(boxA._id)
  assert(freshA.healthStatus === 'paused', `(c) mailbox A should be paused, got ${freshA.healthStatus}`)
  assert(
    freshA.pausedUntil && freshA.pausedUntil.getTime() > Date.now(),
    `(c) mailbox A pausedUntil should be in the future`,
  )
  const freshRl = await QueuedEmail.findById(qRl._id)
  assert(freshRl.status === 'pending', `(c) rate-limited item should be back pending, got ${freshRl.status}`)
  assert(
    freshRl.scheduledAt && freshRl.scheduledAt.getTime() > Date.now(),
    `(c) rate-limited item should have a future scheduledAt`,
  )
  assert(freshRl.retries === 0, `(c) rate-limit must not burn a retry, got retries=${freshRl.retries}`)

  // ── (c) other mailbox keeps sending while A is paused ──────────────────────
  const qCont = await enqueue({ leadId: leadB._id, mailboxId: boxB._id, subject: 's', body: 'b' })
  allQueueIds.push(qCont._id)
  const contRes = await processOne(happyDeps)
  expectedLogs += 1
  assert(contRes && contRes.sent, `(c) mailbox B should still send while A paused, got ${JSON.stringify(contRes)}`)

  // ── (d) unknown error retries with growing backoff then fails ──────────────
  const qFail = await enqueue({ leadId: leadA._id, mailboxId: boxB._id, subject: 's', body: 'b' })
  allQueueIds.push(qFail._id)
  const boomDeps = { providerFor: throwingBoom }
  const maxRetries = qFail.maxRetries
  const backoffs = []
  for (let i = 0; i < maxRetries + 1; i++) {
    // Force the (still-pending) item to be claimable again this tick.
    await QueuedEmail.updateOne(
      { _id: qFail._id, status: 'pending' },
      { $set: { scheduledAt: new Date(Date.now() - 1000) } },
    )
    const r = await processOne(boomDeps)
    const fresh = await QueuedEmail.findById(qFail._id)
    if (r && r.category === 'unknown') expectedLogs += 1
    if (fresh.status === 'pending') {
      backoffs.push(fresh.scheduledAt.getTime() - Date.now())
    }
  }
  assert(
    backoffs.length >= 2 && backoffs[1] > backoffs[0],
    `(d) backoff should grow across retries, got ${JSON.stringify(backoffs)}`,
  )
  const finalFail = await QueuedEmail.findById(qFail._id)
  assert(finalFail.status === 'failed', `(d) item should end 'failed', got ${finalFail.status}`)
  assert(!!finalFail.errorMessage, `(d) failed item should have errorMessage`)
  assert(!!finalFail.smtpResponse, `(d) failed item should have smtpResponse`)

  // ── (e) SendLog: one entry per attempt with category + refs ────────────────
  const logs = await SendLog.find({ 'refs.queueId': { $in: allQueueIds } })
  assert(
    logs.length === expectedLogs,
    `(e) expected ${expectedLogs} SendLog entries, got ${logs.length}`,
  )
  const allTagged = logs.every((l) => !!l.category && !!l.refs && !!l.refs.queueId)
  assert(allTagged, `(e) every SendLog must have a category and refs.queueId`)

  await cleanupFixtures()
  await mongoose.disconnect()
}

run()
  .then(() => {
    if (failures.length) {
      console.error(failures.map((f) => ` - ${f}`).join('\n'))
      console.error('QUEUE FAIL')
      process.exit(1)
    }
    console.log('QUEUE PASS')
    process.exit(0)
  })
  .catch(async (err) => {
    console.error(err)
    try {
      await cleanupFixtures()
      await mongoose.disconnect()
    } catch (_) {}
    console.error('QUEUE FAIL')
    process.exit(1)
  })
