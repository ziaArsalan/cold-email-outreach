// Shared lead-import mapping + upsert used by CSV upload, Google Sheet import,
// and the one-shot importFromSheets script. Maps arbitrary header-keyed rows to
// Lead fields, then bulk-upserts by email (dedupe) into a given list.

const { Lead } = require('../models')

// Lowercased/trimmed header → Lead field.
const HEADER_MAP = {
  email: 'email',
  'e-mail': 'email',
  'first name': 'firstName',
  firstname: 'firstName',
  first_name: 'firstName',
  'last name': 'lastName',
  lastname: 'lastName',
  last_name: 'lastName',
  company: 'company',
  'company name': 'company', // Apollo export header
  business: 'company',
  website: 'website',
  url: 'website',
  industry: 'industry',
  country: 'country',
  title: 'title', // Apollo export header
}

// Map one header-keyed row object to a Lead field object, or null when it has
// no usable email. Falls back to splitting a `name` column into first/last.
const mapRow = (row) => {
  if (!row || typeof row !== 'object') return null

  const mapped = {}
  let rawName = ''
  for (const [key, value] of Object.entries(row)) {
    const norm = String(key).toLowerCase().trim()
    const field = HEADER_MAP[norm]
    if (field) {
      mapped[field] = typeof value === 'string' ? value.trim() : value
    } else if (norm === 'name') {
      rawName = typeof value === 'string' ? value.trim() : ''
    }
  }

  // Derive first/last from a single `name` column when not given explicitly.
  if (!mapped.firstName && !mapped.lastName && rawName) {
    const [firstName, ...rest] = rawName.split(/\s+/)
    if (firstName) mapped.firstName = firstName
    const lastName = rest.join(' ')
    if (lastName) mapped.lastName = lastName
  }

  const email = String(mapped.email || '').toLowerCase().trim()
  if (!email) return null
  mapped.email = email
  mapped.status = 'new'

  return mapped
}

// Map + bulk-upsert rows into a list, with duplicate detection. An email can
// never produce a duplicate document (unique index + upsert), so this reports
// duplicates instead of creating them:
//   - duplicatesInFile: rows collapsed because the same email appeared more than
//     once in THIS upload (the last occurrence wins, so fuller later rows keep).
//   - duplicatesInDb (== updated): unique emails that already existed as leads —
//     these are moved into this list / refreshed rather than inserted as new.
//   - inserted: brand-new leads; skipped: rows with no usable/valid email.
const upsertLeadsIntoList = async (rows, listId, source) => {
  const mappedRows = (rows || []).map(mapRow)
  const valid = mappedRows.filter(Boolean)
  const skipped = mappedRows.length - valid.length

  // Collapse in-file duplicates by email (last wins).
  const byEmail = new Map()
  for (const r of valid) byEmail.set(r.email, r)
  const unique = [...byEmail.values()]
  const duplicatesInFile = valid.length - unique.length

  if (!unique.length)
    return { inserted: 0, updated: 0, skipped, duplicatesInFile, duplicatesInDb: 0 }

  // Which of these emails already exist? bulkWrite's modifiedCount misses
  // matched-but-unchanged docs, so count existence explicitly for accuracy.
  const emails = unique.map((r) => r.email)
  const existing = await Lead.find({ email: { $in: emails } })
    .select('email')
    .lean()
  const duplicatesInDb = new Set(existing.map((l) => l.email)).size
  const inserted = unique.length - duplicatesInDb

  const ops = unique.map((fields) => ({
    updateOne: {
      filter: { email: fields.email },
      update: {
        $set: { ...fields, listId, source },
        $setOnInsert: { createdAt: new Date() },
      },
      upsert: true,
    },
  }))
  await Lead.bulkWrite(ops, { ordered: false })

  return {
    inserted,
    updated: duplicatesInDb, // kept for existing callers; == duplicatesInDb
    skipped,
    duplicatesInFile,
    duplicatesInDb,
  }
}

module.exports = { mapRow, upsertLeadsIntoList, HEADER_MAP }
