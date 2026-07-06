// Unit-style check for mailbox rotation + skip logic. Creates 3 throwaway
// mailboxes (__ROTTEST__1/2/3), exercises pickNext/recordSend, then cleans up.
// Sends NO email — only DB reads/writes.
//
//   node server/scripts/testRotation.js     (mongod must be running)

const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

const mongoose = require('mongoose')
const config = require('../config')
const Mailbox = require('../models/Mailbox')
const {
  pickNext,
  recordSend,
  pause,
  resume,
  effectiveDailyCap,
} = require('../services/mailboxService')

const EPOCH = new Date(0)
const failures = []
const assert = (cond, msg) => {
  if (!cond) failures.push(msg)
}

const makeMailbox = (n) => ({
  name: `__ROTTEST__${n}`,
  email: `rottest${n}@example.com`,
  provider: 'smtp',
  host: 'smtp.invalid.local',
  port: 465,
  secure: true,
  username: `rottest${n}`,
  password: 'dummy',
  dailyLimit: 50,
  hourlyLimit: 10,
  sentToday: 0,
  sentThisHour: 0,
  warmupEnabled: false,
  healthStatus: 'healthy',
  active: true,
})

const run = async () => {
  await mongoose.connect(config.mongoUri)

  // Clean any leftovers from a prior run.
  await Mailbox.deleteMany({ name: /^__ROTTEST__/ })

  const [box1, box2, box3] = await Mailbox.create([
    makeMailbox(1),
    makeMailbox(2),
    makeMailbox(3),
  ])
  const ids = [box1._id, box2._id, box3._id]

  // 1) Rotation: 4 picks should yield 1,2,3,1 (least-recently-used order).
  const picked = []
  for (let i = 0; i < 4; i++) {
    const mb = await pickNext(ids)
    if (!mb) {
      failures.push(`pick ${i + 1}: expected a mailbox, got null`)
      break
    }
    picked.push(mb.name)
    await recordSend(mb)
  }
  assert(
    JSON.stringify(picked) ===
      JSON.stringify([
        '__ROTTEST__1',
        '__ROTTEST__2',
        '__ROTTEST__3',
        '__ROTTEST__1',
      ]),
    `rotation order wrong: got ${JSON.stringify(picked)}`,
  )

  // 2) Paused mailbox is skipped even when it is the oldest-used.
  await pause(box2._id, new Date(Date.now() + 60 * 60000), 'test')
  await Mailbox.updateOne({ _id: box2._id }, { lastUsedAt: EPOCH })
  const afterPause = await pickNext(ids)
  assert(afterPause, 'after pause: expected a mailbox, got null')
  assert(
    afterPause && afterPause.name !== '__ROTTEST__2',
    `paused box2 should be skipped, but pickNext returned ${afterPause && afterPause.name}`,
  )

  // 3) At-limit mailbox is skipped. Resume box2, then push box3 to its cap and
  //    make it the oldest — it must still be skipped.
  await resume(box2._id)
  const cap = effectiveDailyCap(box3)
  await Mailbox.updateOne(
    { _id: box3._id },
    { sentToday: cap, lastUsedAt: EPOCH },
  )
  const afterLimit = await pickNext(ids)
  assert(afterLimit, 'after limit: expected a mailbox, got null')
  assert(
    afterLimit && afterLimit.name !== '__ROTTEST__3',
    `at-limit box3 should be skipped, but pickNext returned ${afterLimit && afterLimit.name}`,
  )

  await Mailbox.deleteMany({ name: /^__ROTTEST__/ })
  await mongoose.disconnect()
}

run()
  .then(() => {
    if (failures.length) {
      console.error(failures.map((f) => ` - ${f}`).join('\n'))
      console.error('ROTATION FAIL')
      process.exit(1)
    }
    console.log('ROTATION PASS')
    process.exit(0)
  })
  .catch(async (err) => {
    console.error(err)
    try {
      await Mailbox.deleteMany({ name: /^__ROTTEST__/ })
      await mongoose.disconnect()
    } catch (_) {}
    console.error('ROTATION FAIL')
    process.exit(1)
  })
