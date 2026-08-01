// Fetch real business leads from Google Maps via an Apify actor. Returns lead
// objects mapped to our Lead fields, keeping ONLY places that yielded a usable
// email (Google Maps itself has no emails — the actor crawls each business
// website for them, so many places produce none).
//
// Quality filtering happens here, before anything is saved:
//  1. Junk addresses scraped off pages (asset filenames, platform/no-reply
//     inboxes like *.wixpress.com, example.com) are dropped outright.
//  2. When a site lists several emails we PREFER a personal/named one over a
//     generic role inbox (info@, contact@, sales@…).
//  3. With skipRoleBased on (the default), a place whose ONLY email is a generic
//     role inbox is skipped entirely rather than imported as a low-quality lead.

const { isRoleBased } = require('./emailVerificationService')

const ACTOR = process.env.APIFY_MAPS_ACTOR || 'compass/crawler-google-places'
const MAX_CAP = 120 // hard ceiling to protect the Apify free-tier credit budget

const COUNTRY_NAMES = {
  SA: 'Saudi Arabia', AE: 'United Arab Emirates', BH: 'Bahrain', KW: 'Kuwait',
  QA: 'Qatar', OM: 'Oman', EG: 'Egypt', US: 'United States', GB: 'United Kingdom',
}

// Platform/placeholder domains that show up when a scraper grabs an address off
// page chrome or a website builder rather than the business itself.
const JUNK_DOMAINS = new Set([
  'example.com', 'example.org', 'domain.com', 'yourdomain.com', 'email.com',
  'sentry.io', 'wix.com', 'wixpress.com', 'sentry.wixpress.com',
  'squarespace.com', 'godaddy.com', 'cloudflare.com', 'wordpress.com',
])

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

// Obvious non-business matches: bad format, asset filenames misread as emails
// (…@logo.png), or a known platform/placeholder domain.
const looksJunk = (email) => {
  if (!EMAIL_RE.test(email)) return true
  if (/\.(png|jpe?g|gif|svg|webp|ico|css|js)$/i.test(email)) return true
  const domain = email.slice(email.indexOf('@') + 1)
  return JUNK_DOMAINS.has(domain)
}

// Clean + rank a place's scraped emails: drop junk, then prefer a personal
// (non-role) address over a generic one. Returns { email, roleBased } or null.
const pickEmail = (rawEmails) => {
  const cleaned = (Array.isArray(rawEmails) ? rawEmails : [])
    .map((e) => String(e || '').toLowerCase().trim())
    .filter((e) => e && !looksJunk(e))
  if (!cleaned.length) return null
  const personal = cleaned.find((e) => !isRoleBased(e))
  if (personal) return { email: personal, roleBased: false }
  return { email: cleaned[0], roleBased: true }
}

// Map one raw Apify place -> Lead fields. Google Maps gives a business, not a
// person, so first/last name stay blank and the business title becomes company.
// Returns { row, roleBased } or null when there's no usable email.
const mapPlace = (p) => {
  const chosen = pickEmail(p.emails)
  if (!chosen) return null
  return {
    roleBased: chosen.roleBased,
    row: {
      email: chosen.email,
      company: (p.title || '').trim(),
      website: (p.website || '').trim(),
      industry: (p.categoryName || '').trim(),
      country: COUNTRY_NAMES[p.countryCode] || p.countryCode || '',
    },
  }
}

// Run the actor for a search query and return { rows, foundPlaces, roleBasedSkipped }.
//  - rows = importable leads (have a usable email, after quality filtering)
//  - foundPlaces = total places scraped
//  - roleBasedSkipped = places dropped because their only email was a generic
//    role inbox (only counted when skipRoleBased is on)
const fetchGoogleMapsLeads = async (query, maxResults, opts = {}) => {
  if (!process.env.APIFY_API_TOKEN)
    throw new Error('APIFY_API_TOKEN is not configured on the server')
  const q = String(query || '').trim()
  if (!q) throw new Error('A search query is required (e.g. "restaurants in Riyadh")')

  const skipRoleBased = opts.skipRoleBased !== false // default: skip generic inboxes
  const limit = Math.min(MAX_CAP, Math.max(1, parseInt(maxResults, 10) || 20))

  const { ApifyClient } = require('apify-client')
  const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN })

  const run = await client.actor(ACTOR).call(
    {
      searchStringsArray: [q],
      maxCrawledPlacesPerSearch: limit,
      language: 'en',
      scrapeContacts: true, // crawl each business website for emails/socials
    },
    { waitSecs: 300 },
  )
  const { items } = await client.dataset(run.defaultDatasetId).listItems()

  const rows = []
  const seen = new Set() // dedupe by email within this run
  let roleBasedSkipped = 0
  for (const item of items || []) {
    const mapped = mapPlace(item)
    if (!mapped) continue
    if (mapped.roleBased && skipRoleBased) {
      roleBasedSkipped += 1
      continue
    }
    if (seen.has(mapped.row.email)) continue
    seen.add(mapped.row.email)
    rows.push(mapped.row)
  }

  return { rows, foundPlaces: (items || []).length, roleBasedSkipped }
}

module.exports = { fetchGoogleMapsLeads }
