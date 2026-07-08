// Idempotent one-shot import: pulls all leads from Google Sheets into MongoDB,
// then seeds a default Mailbox (from SMTP_* env) and a default Template.
// Safe to run repeatedly — leads are upserted by email, seeds use $setOnInsert.
//
//   npm run import:sheets   (from server/)

const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

const mongoose = require('mongoose')
const { connectMongo } = require('../db')
const { fetchAllLeads } = require('../services/sheetsService')
const { upsertLeadsIntoList } = require('../services/leadImportService')
const { Mailbox, Template } = require('../models')

const DEFAULT_TEMPLATE = {
  name: 'Default',
  subject: 'Quick idea for {{company}}',
  body: `Hi {{first_name}},

{{ai_intro}}

At Devtronics we help businesses like {{company}} launch branded digital loyalty programs that increase repeat visits and work directly with Apple Wallet and Google Wallet.

Would you be open to a quick 15-minute demo next week?

Best,`,
  signature: `Zia Arsalan
Founder | Devtronics
https://devtronics.co`,
  active: true,
}

const run = async () => {
  try {
    await connectMongo()
    console.log('[import] connected to MongoDB')
  } catch (e) {
    console.error('[import] could not connect to MongoDB:', e.message)
    process.exit(1)
  }

  const sheetRows = await fetchAllLeads()
  console.log(`[import] fetched ${sheetRows.length} rows from Sheets`)

  // Reshape to header-keyed rows the shared mapper understands
  // (email→email, name→first/last split, business→company, website→website).
  const rows = sheetRows.map((row) => ({
    email: row.email,
    name: row.name,
    business: row.business,
    website: row.website,
  }))

  const { inserted, updated, skipped } = await upsertLeadsIntoList(
    rows,
    null,
    'sheets',
  )
  console.log(
    `[import] leads — inserted ${inserted}, updated ${updated}, skipped ${skipped}`,
  )

  // Seed a default Mailbox from SMTP_* env vars (idempotent by email).
  const smtpUser = process.env.SMTP_USER
  if (smtpUser) {
    const mailboxSeed = await Mailbox.updateOne(
      { email: smtpUser },
      {
        $setOnInsert: {
          name: process.env.FROM_NAME || 'Default',
          email: smtpUser,
          provider: 'smtp',
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT) || 465,
          secure: process.env.SMTP_SECURE === 'true',
          username: smtpUser,
          password: process.env.SMTP_PASS,
          warmupEnabled: true,
          healthStatus: 'healthy',
          active: true,
        },
      },
      { upsert: true },
    )
    console.log(
      mailboxSeed.upsertedCount
        ? `[import] seeded default Mailbox (${smtpUser})`
        : `[import] default Mailbox already present (${smtpUser})`,
    )
  } else {
    console.warn('[import] SMTP_USER not set — skipping Mailbox seed')
  }

  // Seed the default Template (idempotent by name).
  const templateSeed = await Template.updateOne(
    { name: DEFAULT_TEMPLATE.name },
    { $setOnInsert: DEFAULT_TEMPLATE },
    { upsert: true },
  )
  console.log(
    templateSeed.upsertedCount
      ? '[import] seeded default Template'
      : '[import] default Template already present',
  )

  await mongoose.disconnect()
  console.log('[import] done')
  process.exit(0)
}

run().catch(async (e) => {
  console.error('[import] failed:', e)
  try {
    await mongoose.disconnect()
  } catch (_) {}
  process.exit(1)
})
