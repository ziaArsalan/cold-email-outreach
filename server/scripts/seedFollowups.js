/*
 * Seed the Follow-ups module with demo data: 5 members + 2 tasks, then
 * materialize the current period's assignments.
 *
 *   npm run seed:followups            (seeds the LOCAL dev DB)
 *   npm run seed:followups -- --force (allow a non-local MONGODB_URI)
 *
 * SAFETY: refuses a non-local MONGODB_URI unless --force is passed, so it can't
 * accidentally write demo rows into the Atlas production database. Idempotent —
 * members are upserted by phone and tasks by title, so re-running won't dupe.
 */
const mongoose = require('mongoose')
const config = require('../config')
const phone = require('../services/phoneService')
const followupService = require('../services/followupService')
const { Member, Task } = require('../models')

const uri = config.mongoUri
const isLocal = /^mongodb:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(uri)
if (!isLocal && !process.argv.includes('--force')) {
  console.error(
    'Refusing to seed a non-local MONGODB_URI (' +
      uri.replace(/\/\/[^@]*@/, '//***@') +
      ').\nRe-run with --force if you really mean to seed this database.',
  )
  process.exit(1)
}

const MEMBERS = [
  { name: 'Ahmed Khan', phone: '03001234567', registrationId: 'REG-001' },
  { name: 'Bilal Raza', phone: '03011234568', registrationId: 'REG-002' },
  { name: 'Sana Malik', phone: '+92 302 1234569', registrationId: 'REG-003' },
  { name: 'Hira Shah', phone: '0303 1234570' },
  { name: 'Usman Ali', phone: '923041234571' },
]

const TASKS = [
  {
    title: 'Weekly report',
    description: 'Submit your weekly progress report.',
    recurrence: 'weekly',
    assignTo: 'all',
    tagColor: '#60a5fa',
  },
  {
    title: 'Monthly fee',
    description: 'Confirm this month’s fee has been paid.',
    recurrence: 'monthly',
    assignTo: 'all',
    tagColor: '#f59e0b',
  },
]

async function main() {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 })

  let members = 0
  for (const m of MEMBERS) {
    const normalized = phone.normalize(m.phone)
    await Member.updateOne(
      { phone: normalized },
      { $set: { name: m.name, registrationId: m.registrationId || null, isActive: true } },
      { upsert: true },
    )
    members++
  }

  let tasks = 0
  for (const t of TASKS) {
    await Task.updateOne({ title: t.title }, { $set: { ...t, isActive: true } }, { upsert: true })
    tasks++
  }

  const created = await followupService.ensureCurrentAssignments()

  console.log(`[seed] ${members} members, ${tasks} tasks, current-period assignments materialized (${created} upserts).`)
  await mongoose.disconnect()
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
