// In-process acceptance test for T-013 deliverability guards. Exercises the pure
// validateBody/buildMailOptions/domainMismatch helpers, the enqueue-time gate in
// campaignService.start(), and the presence of DELIVERABILITY.md. Creates
// throwaway __QDLV__ fixtures and cleans them up. Requires a running local
// mongod.
//
//   node server/scripts/testDeliverability.js
//
// Sends NO real email — the worker never runs and no SMTP is touched.

const path = require('path')
const fs = require('fs')
const assert = require('assert')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

const mongoose = require('mongoose')
const config = require('../config')
const { Lead, Template, Campaign, QueuedEmail, SendLog } = require('../models')
const {
  validateBody,
  domainMismatch,
} = require('../services/deliverabilityService')
const { buildMailOptions } = require('../services/smtp/NodemailerProvider')
const campaignService = require('../services/campaignService')

const failures = []
const check = (cond, msg) => {
  if (!cond) failures.push(msg)
}

const cleanupFixtures = async () => {
  const tpls = await Template.find({ name: /^__QADLV__/ }).select('_id')
  const leads = await Lead.find({ email: /^__qadlv__/i }).select('_id')
  const camps = await Campaign.find({ name: /^__QADLV__/ }).select('_id')
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

  // ── (a) validateBody ───────────────────────────────────────────────────────
  check(!validateBody('').ok, '(a) empty body should fail')
  check(!validateBody('   ').ok, '(a) whitespace-only body should fail')

  const twoLink = validateBody(
    'Check https://a.com and also https://b.com today',
  )
  check(!twoLink.ok, '(a) two-link body should fail')
  check(
    twoLink.errors.some((e) => /links/i.test(e)),
    `(a) two-link failure should mention links, got ${JSON.stringify(twoLink.errors)}`,
  )

  check(!validateBody('hello <img src="x"> world').ok, '(a) <img> should fail')
  check(!validateBody('hello ![x](y) world').ok, '(a) markdown image should fail')

  const oneLink = validateBody('Hi there, quick question.\n\n-- Sam\nhttps://devtronics.co')
  check(oneLink.ok, `(a) single-link body should pass, got ${JSON.stringify(oneLink.errors)}`)

  // ── (b) buildMailOptions ───────────────────────────────────────────────────
  const noHtml = buildMailOptions({
    to: 'a@x.com',
    subject: 's',
    text: 'plain',
    html: null,
    fromName: 'N',
    fromEmail: 'n@x.com',
  })
  check(
    !('html' in noHtml),
    `(b) html:null should omit the html key, got keys ${JSON.stringify(Object.keys(noHtml))}`,
  )
  check(noHtml.text === 'plain', '(b) text should always be present')

  const withHtml = buildMailOptions({
    to: 'a@x.com',
    subject: 's',
    text: 'plain',
    html: '<b>x</b>',
    fromName: 'N',
    fromEmail: 'n@x.com',
  })
  check(withHtml.html === '<b>x</b>', '(b) html should be present when supplied')

  // ── (c) enqueue gate ───────────────────────────────────────────────────────
  const badTpl = await Template.create({
    name: '__QADLV__two-link',
    subject: 'Hi {{first_name}}',
    body: 'See https://a.com and https://b.com for details',
    signature: '',
  })
  const goodTpl = await Template.create({
    name: '__QADLV__one-link',
    subject: 'Hi {{first_name}}',
    body: 'Hi {{first_name}}, quick question about {{company}}.',
    signature: 'Sam\nhttps://devtronics.co',
  })
  const lead = await Lead.create({
    email: '__QADLV__lead@example.com',
    firstName: 'Q',
    company: 'Acme',
    status: 'new',
    aiIntro: 'canned intro so no AI call happens',
  })
  const camp = await Campaign.create({
    name: '__QADLV__campaign',
    templateId: badTpl._id,
    status: 'draft',
  })

  let threw = false
  try {
    await campaignService.start(camp._id, { leadIds: [lead._id] })
  } catch (err) {
    threw = true
    check(
      /links/i.test(err.message),
      `(c) enqueue gate error should mention links, got "${err.message}"`,
    )
  }
  check(threw, '(c) start() with a 2-link template should throw')
  const afterBad = await QueuedEmail.countDocuments({ campaignId: camp._id })
  check(afterBad === 0, `(c) no queue items should be created on gate failure, got ${afterBad}`)

  // Point the (still-draft) campaign at the good template and start again.
  const freshCamp = await Campaign.findById(camp._id)
  check(freshCamp.status === 'draft', `(c) campaign should still be draft after gate failure, got ${freshCamp.status}`)
  freshCamp.status = 'draft'
  freshCamp.templateId = goodTpl._id
  await freshCamp.save()

  const res = await campaignService.start(freshCamp._id, { leadIds: [lead._id] })
  check(res && res.enqueued === 1, `(c) good template should enqueue 1, got ${JSON.stringify(res)}`)
  const pending = await QueuedEmail.countDocuments({ campaignId: camp._id, status: 'pending' })
  check(pending === 1, `(c) expected 1 pending queue item, got ${pending}`)

  // ── (d) domainMismatch ─────────────────────────────────────────────────────
  check(!!domainMismatch('a@x.com', 'a@y.com'), '(d) different domains should warn')
  check(domainMismatch('a@x.com', 'b@x.com') === null, '(d) same domain should be null')
  check(domainMismatch('', 'a@y.com') === null, '(d) blank from should be null')

  // ── (e) DELIVERABILITY.md content ──────────────────────────────────────────
  const docPath = path.join(__dirname, '..', '..', '.claude', 'docs', 'DELIVERABILITY.md')
  check(fs.existsSync(docPath), '(e) DELIVERABILITY.md should exist')
  const doc = fs.existsSync(docPath) ? fs.readFileSync(docPath, 'utf8') : ''
  check(/spf1/.test(doc), '(e) doc should contain an SPF (spf1) example')
  check(/DKIM/i.test(doc), '(e) doc should mention DKIM')
  check(/DMARC1/.test(doc), '(e) doc should contain a DMARC1 example')

  await cleanupFixtures()
  await mongoose.disconnect()
}

run()
  .then(() => {
    if (failures.length) {
      console.error(failures.map((f) => ` - ${f}`).join('\n'))
      console.error('DELIVERABILITY FAIL')
      process.exit(1)
    }
    console.log('DELIVERABILITY PASS')
    process.exit(0)
  })
  .catch(async (err) => {
    console.error(err)
    try {
      await cleanupFixtures()
      await mongoose.disconnect()
    } catch (_) {}
    console.error('DELIVERABILITY FAIL')
    process.exit(1)
  })
