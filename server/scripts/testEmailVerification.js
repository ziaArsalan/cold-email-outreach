// In-process acceptance test for the pre-send email verification guard.
// Exercises the pure isValidFormat/isRoleBased/isDisposableDomain/hasMX/
// verifyEmail helpers and the enqueue-time gate in campaignService.start()
// (invalid-email leads are skipped, marked 'failed', never enqueued; valid
// ones proceed as before). Creates throwaway __QEV__ fixtures and cleans them
// up. Requires a running local mongod and outbound DNS (for the MX checks).
//
//   node server/scripts/testEmailVerification.js
//
// Sends NO real email — the worker never runs and no SMTP is touched.

const path = require('path')
const assert = require('assert')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

const mongoose = require('mongoose')
const config = require('../config')
const { Lead, Template, Campaign, QueuedEmail, SendLog } = require('../models')
const {
  isValidFormat,
  isRoleBased,
  isDisposableDomain,
  hasMX,
  verifyEmail,
} = require('../services/emailVerificationService')
const campaignService = require('../services/campaignService')

const failures = []
const check = (cond, msg) => {
  if (!cond) failures.push(msg)
}

const cleanupFixtures = async () => {
  const tpls = await Template.find({ name: /^__QEV__/ }).select('_id')
  const leads = await Lead.find({ email: /__qev__/i }).select('_id')
  const camps = await Campaign.find({ name: /^__QEV__/ }).select('_id')
  const leadIds = leads.map((l) => l._id)
  const campIds = camps.map((c) => c._id)
  await QueuedEmail.deleteMany({
    $or: [{ leadId: { $in: leadIds } }, { campaignId: { $in: campIds } }],
  })
  await SendLog.deleteMany({ 'refs.campaignId': { $in: campIds } })
  await Template.deleteMany({ _id: { $in: tpls.map((t) => t._id) } })
  await Lead.deleteMany({ _id: { $in: leadIds } })
  await Campaign.deleteMany({ _id: { $in: campIds } })
}

const run = async () => {
  await mongoose.connect(config.mongoUri)
  await cleanupFixtures()

  // ── (a) isValidFormat ──────────────────────────────────────────────────────
  check(isValidFormat('jane@acme.com'), '(a) plain address should be valid format')
  check(!isValidFormat('not-an-email'), '(a) missing @ should be invalid format')
  check(!isValidFormat('jane@nodot'), '(a) domain without a dot should be invalid format')
  check(!isValidFormat('jane @acme.com'), '(a) embedded space should be invalid format')
  check(!isValidFormat(''), '(a) empty string should be invalid format')

  // ── (b) isRoleBased ─────────────────────────────────────────────────────────
  check(isRoleBased('admin@acme.com'), '(b) admin@ should be role-based')
  check(isRoleBased('Info@Acme.com'), '(b) role check should be case-insensitive')
  check(!isRoleBased('jane.doe@acme.com'), '(b) a named person should not be role-based')

  // ── (c) isDisposableDomain ──────────────────────────────────────────────────
  check(isDisposableDomain('mailinator.com'), '(c) mailinator.com should be disposable')
  check(!isDisposableDomain('gmail.com'), '(c) gmail.com should not be disposable')

  // ── (d) hasMX (real DNS lookups) ────────────────────────────────────────────
  check(await hasMX('gmail.com'), '(d) gmail.com should have MX records')
  check(
    !(await hasMX('this-domain-should-not-exist-xyz123abc.test')),
    '(d) a nonexistent domain should have no MX records',
  )

  // ── (e) verifyEmail composite ───────────────────────────────────────────────
  const badFormat = await verifyEmail('not-an-email')
  check(!badFormat.valid && /format/i.test(badFormat.reason), '(e) bad format should fail with a format reason')

  const roleBased = await verifyEmail('support@gmail.com')
  check(!roleBased.valid && /role/i.test(roleBased.reason), '(e) role-based should fail with a role reason')

  const disposable = await verifyEmail('someone@mailinator.com')
  check(!disposable.valid && /disposable/i.test(disposable.reason), '(e) disposable should fail with a disposable reason')

  const good = await verifyEmail('jane.doe@gmail.com')
  check(good.valid && good.reason === null, `(e) a real-looking gmail address should pass, got ${JSON.stringify(good)}`)

  // ── (f) enqueue gate — campaignService.start() skips invalid leads ─────────
  const tpl = await Template.create({
    name: '__QEV__template',
    subject: 'Hi {{first_name}}',
    body: 'Hi {{first_name}}, {{ai_intro}}',
    signature: 'Sam\nhttps://devtronics.co',
  })
  const goodLead = await Lead.create({
    email: '__qev__good@gmail.com',
    firstName: 'Good',
    company: 'Acme',
    status: 'new',
    aiIntro: 'canned intro so no AI call happens',
  })
  const badFormatLead = await Lead.create({
    email: '__qev__bad-format-not-an-email',
    firstName: 'BadFormat',
    company: 'Acme',
    status: 'new',
    aiIntro: 'canned',
  })
  const disposableLead = await Lead.create({
    email: '__qev__disposable@mailinator.com',
    firstName: 'Disposable',
    company: 'Acme',
    status: 'new',
    aiIntro: 'canned',
  })
  const camp = await Campaign.create({
    name: '__QEV__campaign',
    templateId: tpl._id,
    status: 'draft',
  })

  const res = await campaignService.start(camp._id, {
    leadIds: [goodLead._id, badFormatLead._id, disposableLead._id],
  })
  check(res.enqueued === 1, `(f) expected 1 enqueued, got ${JSON.stringify(res)}`)
  check(res.skipped === 2, `(f) expected 2 skipped, got ${JSON.stringify(res)}`)

  const queued = await QueuedEmail.countDocuments({ campaignId: camp._id })
  check(queued === 1, `(f) expected exactly 1 queue item, got ${queued}`)

  const goodAfter = await Lead.findById(goodLead._id)
  check(goodAfter.status === 'queued', `(f) good lead should be 'queued', got ${goodAfter.status}`)
  check(goodAfter.emailCheckStatus === 'valid', `(f) good lead should be emailCheckStatus 'valid', got ${goodAfter.emailCheckStatus}`)

  const badAfter = await Lead.findById(badFormatLead._id)
  check(badAfter.status === 'failed', `(f) bad-format lead should be 'failed', got ${badAfter.status}`)
  check(
    badAfter.emailCheckStatus === 'invalid' && /format/i.test(badAfter.emailCheckReason || ''),
    `(f) bad-format lead should carry a format reason, got ${JSON.stringify(badAfter.emailCheckReason)}`,
  )

  const disposableAfter = await Lead.findById(disposableLead._id)
  check(disposableAfter.status === 'failed', `(f) disposable lead should be 'failed', got ${disposableAfter.status}`)
  check(
    /disposable/i.test(disposableAfter.emailCheckReason || ''),
    `(f) disposable lead should carry a disposable reason, got ${JSON.stringify(disposableAfter.emailCheckReason)}`,
  )

  await cleanupFixtures()
  await mongoose.disconnect()
}

run()
  .then(() => {
    if (failures.length) {
      console.error(failures.map((f) => ` - ${f}`).join('\n'))
      console.error('EMAIL VERIFICATION FAIL')
      process.exit(1)
    }
    console.log('EMAIL VERIFICATION PASS')
    process.exit(0)
  })
  .catch(async (err) => {
    console.error(err)
    try {
      await cleanupFixtures()
      await mongoose.disconnect()
    } catch (_) {}
    console.error('EMAIL VERIFICATION FAIL')
    process.exit(1)
  })
