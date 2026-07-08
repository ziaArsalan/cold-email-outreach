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
  business: 'company',
  website: 'website',
  url: 'website',
  industry: 'industry',
  country: 'country',
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

// Map + bulk-upsert rows into a list. Dedupes by email; existing leads are
// updated (moved into the list, source refreshed), new ones inserted.
const upsertLeadsIntoList = async (rows, listId, source) => {
  const mappedRows = (rows || []).map(mapRow)
  const valid = mappedRows.filter(Boolean)
  const skipped = mappedRows.length - valid.length

  const ops = valid.map((fields) => ({
    updateOne: {
      filter: { email: fields.email },
      update: {
        $set: { ...fields, listId, source },
        $setOnInsert: { createdAt: new Date() },
      },
      upsert: true,
    },
  }))

  if (!ops.length) return { inserted: 0, updated: 0, skipped }

  const result = await Lead.bulkWrite(ops, { ordered: false })
  return {
    inserted: result.upsertedCount || 0,
    updated: result.modifiedCount || 0,
    skipped,
  }
}

module.exports = { mapRow, upsertLeadsIntoList, HEADER_MAP }
