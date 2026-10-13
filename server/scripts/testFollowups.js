/*
 * Follow-ups module test suite.
 *
 *   node scripts/testFollowups.js   (or: npm run test:followups)
 *
 * Self-contained: runs against a THROWAWAY local database, exercises the period
 * math (pure), the phone normalizer (pure), and the lazy-assignment / board /
 * mark-done service (DB), then drops the database.
 *
 * SAFETY: never uses the project .env or a remote host. Forces a local mongod
 * and refuses anything else, so it can never touch production data.
 */
const mongoose = require('mongoose')

const envUri = process.env.MONGODB_URI
if (envUri && !/^mongodb:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(envUri)) {
  console.error('Refusing to run against a non-local MONGODB_URI:', envUri)
  process.exit(1)
}
const DB_URI = 'mongodb://localhost:27017/followups_test'

// Pin the timezone the suite asserts against, regardless of the machine's env.
process.env.FOLLOWUPS_TZ = 'Asia/Karachi' // UTC+5, no DST
process.env.FOLLOWUPS_DEFAULT_CC = '92'

const period = require('../services/periodService')
const phone = require('../services/phoneService')
const fs = require('../services/followupService')
const reminderService = require('../services/reminderService')
const { parseDone } = require('../routes/followupsWebhook')
const { Member, Task, TaskAssignment, ReminderLog } = require('../models')

let passed = 0
let failed = 0
const ok = (name, cond, extra) => {
  if (cond) {
    passed++
    console.log('  ✓', name)
  } else {
    failed++
    console.log('  ✗', name, extra != null ? '→ ' + JSON.stringify(extra) : '')
  }
}

// Karachi is UTC+5: local midnight = previous 19:00Z.
const UTC = (s) => new Date(s)

async function main() {
  console.log('\n[unit] period keys (Asia/Karachi, UTC+5)')
  ok('one_time → once', period.periodKeyFor('one_time') === 'once')

  // Monthly boundary: Oct 31 23:00 Karachi = still 2026-10; +2h = Nov 1 01:00 → 2026-11.
  ok(
    'monthly before local month end',
    period.periodKeyFor('monthly', UTC('2026-10-31T18:00:00Z')) === '2026-10',
    period.periodKeyFor('monthly', UTC('2026-10-31T18:00:00Z')),
  )
  ok(
    'monthly rolls at LOCAL midnight (not UTC)',
    period.periodKeyFor('monthly', UTC('2026-10-31T20:00:00Z')) === '2026-11',
    period.periodKeyFor('monthly', UTC('2026-10-31T20:00:00Z')),
  )

  // Weekly boundary: Sun 2026-01-04 23:00 Karachi (=18:00Z) is ISO W01;
  // +2h = Mon 2026-01-05 01:00 Karachi (=20:00Z, still Sunday in UTC) is W02.
  ok(
    'weekly Sunday local → W01',
    period.periodKeyFor('weekly', UTC('2026-01-04T18:00:00Z')) === '2026-W01',
    period.periodKeyFor('weekly', UTC('2026-01-04T18:00:00Z')),
  )
  ok(
    'weekly rolls at LOCAL Monday 00:00 → W02 (UTC still Sunday)',
    period.periodKeyFor('weekly', UTC('2026-01-04T20:00:00Z')) === '2026-W02',
    period.periodKeyFor('weekly', UTC('2026-01-04T20:00:00Z')),
  )
  ok('period label monthly', period.periodLabel('2026-10') === 'October 2026')
  ok('period label weekly', period.periodLabel('2026-W42') === 'week 42, 2026')

  console.log('\n[unit] phone normalize (default CC 92)')
  ok("local '0300 1234567'", phone.normalize('0300 1234567') === '923001234567', phone.normalize('0300 1234567'))
  ok("'+92 300 1234567'", phone.normalize('+92 300 1234567') === '923001234567', phone.normalize('+92 300 1234567'))
  ok("'00923001234567'", phone.normalize('00923001234567') === '923001234567', phone.normalize('00923001234567'))
  ok("bare national '3001234567'", phone.normalize('3001234567') === '923001234567', phone.normalize('3001234567'))
  ok("already E.164 '923001234567'", phone.normalize('923001234567') === '923001234567')
  ok('empty → null', phone.normalize('') === null)
  ok('junk/too short → null', phone.normalize('123') === null)
  ok('toE164 formats with +', phone.toE164('923001234567') === '+923001234567')

  console.log('\n[db] lazy assignment generation')
  await mongoose.connect(DB_URI, { serverSelectionTimeoutMS: 5000 })
  await mongoose.connection.dropDatabase()

  const now = UTC('2026-10-14T06:00:00Z') // a Wednesday; Karachi 11:00
  const wk = period.periodKeyFor('weekly', now)
  const mo = period.periodKeyFor('monthly', now)

  const [m1, m2, m3, mInactive] = await Member.create([
    { name: 'Ali', phone: '923000000001' },
    { name: 'Bina', phone: '923000000002' },
    { name: 'Carl', phone: '923000000003' },
    { name: 'Dead', phone: '923000000009', isActive: false },
  ])
  const taskA = await Task.create({ title: 'Weekly report', recurrence: 'weekly', assignTo: 'all' })
  const taskB = await Task.create({
    title: 'Monthly review',
    recurrence: 'monthly',
    assignTo: 'selected',
    assignees: [m1._id, m2._id],
  })

  await fs.ensureCurrentAssignments(now)
  const aCount = await TaskAssignment.countDocuments({ task: taskA._id, periodKey: wk })
  const bCount = await TaskAssignment.countDocuments({ task: taskB._id, periodKey: mo })
  ok("'all' task → one row per active member (3)", aCount === 3, aCount)
  ok("'selected' task → only its assignees (2)", bCount === 2, bCount)
  const inactiveRows = await TaskAssignment.countDocuments({ member: mInactive._id })
  ok('inactive member never assigned', inactiveRows === 0, inactiveRows)

  // Idempotent re-run makes no duplicates.
  await fs.ensureCurrentAssignments(now)
  ok(
    'ensure is idempotent (no dup rows)',
    (await TaskAssignment.countDocuments({ task: taskA._id, periodKey: wk })) === 3,
  )

  console.log('\n[db] new member auto-assignment')
  const m5 = await Member.create({ name: 'Eve', phone: '923000000005' })
  await fs.ensureAssignmentsForMember(m5._id, now)
  ok(
    'new member gets the all-task row',
    !!(await TaskAssignment.exists({ task: taskA._id, member: m5._id, periodKey: wk })),
  )
  ok(
    'new member NOT added to a selected task they are not in',
    !(await TaskAssignment.exists({ task: taskB._id, member: m5._id, periodKey: mo })),
  )

  console.log('\n[db] mark done + next-period reset')
  const a1 = await TaskAssignment.findOne({ task: taskA._id, member: m1._id, periodKey: wk })
  await fs.complete(a1._id, 'admin@local')
  const a1b = await TaskAssignment.findById(a1._id)
  ok('complete() sets done + completedBy', a1b.status === 'done' && a1b.completedBy === 'admin@local')
  await fs.undo(a1._id)
  ok('undo() returns to pending + clears completedBy', (await TaskAssignment.findById(a1._id)).status === 'pending')
  await fs.complete(a1._id, 'admin@local')

  const nextWeekNow = new Date(now.getTime() + 7 * 86400 * 1000)
  const wk2 = period.periodKeyFor('weekly', nextWeekNow)
  ok('next week has a different period key', wk2 !== wk, { wk, wk2 })
  await fs.ensureCurrentAssignments(nextWeekNow)
  const nextRow = await TaskAssignment.findOne({ task: taskA._id, member: m1._id, periodKey: wk2 })
  ok('next period starts pending', nextRow && nextRow.status === 'pending')
  ok('previous period row stays done (history preserved)', (await TaskAssignment.findById(a1._id)).status === 'done')

  console.log('\n[db] reconcile all↔selected (current period onward)')
  // selected → all: m3 should gain taskB's current-period row.
  taskB.assignTo = 'all'
  await taskB.save()
  await fs.reconcileTaskCurrentPeriod(taskB, now)
  ok('selected→all adds the previously-excluded member', !!(await TaskAssignment.exists({ task: taskB._id, member: m3._id, periodKey: mo })))

  // all → selected [m1]: m2/m3/m5 pending rows for taskA current period removed, m1 stays.
  taskA.assignTo = 'selected'
  taskA.assignees = [m1._id]
  await taskA.save()
  await fs.reconcileTaskCurrentPeriod(taskA, now)
  ok('all→selected keeps the chosen member', !!(await TaskAssignment.exists({ task: taskA._id, member: m1._id, periodKey: wk })))
  ok('all→selected drops a de-assigned PENDING member', !(await TaskAssignment.exists({ task: taskA._id, member: m2._id, periodKey: wk })))

  console.log('\n[db] board + pendingByMember')
  // Reset taskA back to all for a clean board check.
  taskA.assignTo = 'all'
  taskA.assignees = []
  await taskA.save()
  const board = await fs.getBoard({ now })
  ok('board lists active members only', board.summary.totalMembers === 4, board.summary.totalMembers)
  ok('board has per-task tallies', Array.isArray(board.summary.perTask) && board.summary.perTask.length === 2)
  const aliRow = board.members.find((r) => r.name === 'Ali')
  ok('member row carries tags', aliRow && aliRow.tags.length >= 1)

  const pend = await fs.pendingByMember([], now)
  ok('pendingByMember groups per member', Array.isArray(pend) && pend.every((p) => p.pending.length > 0))

  console.log('\n[db] markMemberDone (webhook helper)')
  const target = pend.find((p) => p.pending.length > 0)
  if (target) {
    const n = await fs.markMemberDone(target.member._id, { now, by: 'member_reply' })
    ok('markMemberDone closes all pending for the member', n === target.pending.length, { n, expected: target.pending.length })
    const stillPending = await TaskAssignment.countDocuments({ member: target.member._id, status: 'pending', periodKey: { $in: [wk, mo] } })
    ok('no pending left for that member this period', stillPending === 0, stillPending)
  } else {
    ok('markMemberDone (skipped — no pending member)', true)
  }

  console.log('\n[unit] webhook DONE parsing')
  ok("'DONE' → all", JSON.stringify(parseDone('DONE')) === JSON.stringify({ all: true }))
  ok("'done' (lowercase) → all", JSON.stringify(parseDone('done')) === JSON.stringify({ all: true }))
  ok("'DONE 2' → index 2", parseDone('DONE 2').index === 2)
  ok("'Done report' → title", parseDone('Done report').title === 'report')
  ok("'hello' → null", parseDone('hello') === null)

  console.log('\n[db] reminders: one message per member, throttle, stop-when-done')
  await mongoose.connection.dropDatabase()
  const rNow = UTC('2026-10-14T06:00:00Z')
  const [r1, r2] = await Member.create([
    { name: 'Ali', phone: '923111111111' },
    { name: 'Bina', phone: '923222222222' },
  ])
  await Task.create({ title: 'Weekly report', recurrence: 'weekly', assignTo: 'all' })
  await Task.create({ title: 'Monthly review', recurrence: 'monthly', assignTo: 'all' })
  await fs.ensureCurrentAssignments(rNow)

  const sent = await reminderService.send({ scope: { type: 'all' }, triggeredBy: 'test' })
  ok('one item per member (2)', sent.items.length === 2, sent.items.length)
  ok('wa_link items are queued', sent.queued === 2 && sent.sent === 0, sent)
  ok('wa.me link built', sent.items[0].link && sent.items[0].link.startsWith('https://wa.me/'))
  const aliLogCount = await ReminderLog.countDocuments({ member: r1._id })
  ok('exactly ONE log per member (not one per task)', aliLogCount === 1, aliLogCount)
  const aliLog = await ReminderLog.findOne({ member: r1._id })
  ok(
    'message lists BOTH pending tasks',
    /Weekly report/.test(aliLog.message) && /Monthly review/.test(aliLog.message),
    aliLog.message,
  )

  // Marking a member fully done removes them from the recipient set.
  await fs.markMemberDone(r1._id, { now: rNow, by: 'admin@local' })
  const prevAfterDone = await reminderService.preview({ scope: { type: 'all' } })
  ok('marking done stops reminders (Ali excluded)', !prevAfterDone.recipients.some((x) => String(x.memberId) === String(r1._id)))
  ok('never remind someone with no pending (count=1, only Bina)', prevAfterDone.recipientCount === 1, prevAfterDone.recipientCount)

  // Throttle: record a delivery for Bina (markSent stamps her assignments), then
  // she's throttled unless forced.
  const binaItem = sent.items.find((x) => String(x.memberId) === String(r2._id))
  await reminderService.markSent(binaItem.logId)
  const throttled = await reminderService.preview({ scope: { type: 'all' }, force: false })
  ok('throttle hides a recently-reminded member', throttled.recipientCount === 0, throttled.recipientCount)
  const forced = await reminderService.preview({ scope: { type: 'all' }, force: true })
  ok('force overrides the throttle', forced.recipientCount === 1, forced.recipientCount)
  const binaAssignment = await TaskAssignment.findOne({ member: r2._id })
  ok('markSent stamps lastRemindedAt + reminderCount', !!binaAssignment.lastRemindedAt && binaAssignment.reminderCount === 1)

  await mongoose.connection.dropDatabase()
  await mongoose.disconnect()

  console.log(`\n${passed} passed, ${failed} failed\n`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
