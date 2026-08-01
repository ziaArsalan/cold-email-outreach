// Fetch real business leads from Google Maps via an Apify actor. Returns lead
// objects mapped to our Lead fields, keeping ONLY places that yielded an email
// (Google Maps itself has no emails — the actor crawls each business website for
// them, so many places produce none). Emails are often role-based (info@/…) —
// campaignService.start's pre-send verification screens those downstream.

const ACTOR = process.env.APIFY_MAPS_ACTOR || 'compass/crawler-google-places'
const MAX_CAP = 120 // hard ceiling to protect the Apify free-tier credit budget

const COUNTRY_NAMES = {
  SA: 'Saudi Arabia', AE: 'United Arab Emirates', BH: 'Bahrain', KW: 'Kuwait',
  QA: 'Qatar', OM: 'Oman', EG: 'Egypt', US: 'United States', GB: 'United Kingdom',
}

// Map one raw Apify place -> Lead fields. Google Maps gives a business, not a
// person, so first/last name stay blank and the business title becomes company.
const mapPlace = (p) => {
  const email = Array.isArray(p.emails) && p.emails.length ? String(p.emails[0]).toLowerCase().trim() : ''
  if (!email) return null
  return {
    email,
    company: (p.title || '').trim(),
    website: (p.website || '').trim(),
    industry: (p.categoryName || '').trim(),
    country: COUNTRY_NAMES[p.countryCode] || p.countryCode || '',
  }
}

// Run the actor for a search query and return { rows, foundPlaces }.
// rows = mappable leads (have an email); foundPlaces = total places scraped.
const fetchGoogleMapsLeads = async (query, maxResults) => {
  if (!process.env.APIFY_API_TOKEN)
    throw new Error('APIFY_API_TOKEN is not configured on the server')
  const q = String(query || '').trim()
  if (!q) throw new Error('A search query is required (e.g. "restaurants in Riyadh")')

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

  const rows = (items || []).map(mapPlace).filter(Boolean)
  // Dedupe by email within this run so upsert counts are meaningful.
  const seen = new Set()
  const deduped = rows.filter((r) => (seen.has(r.email) ? false : seen.add(r.email)))
  return { rows: deduped, foundPlaces: (items || []).length }
}

module.exports = { fetchGoogleMapsLeads }
