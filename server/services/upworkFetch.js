// Pluggable Upwork fetch layer, keyed on UPWORK_SOURCE.
// Ships with fixtures so the dedupe → Claude → Sheets pipeline is fully
// testable now. Real sources (rss/google) land in T-003.

const path = require('path');
const config = require('../jobs/config');

// Normalize a raw fixture/source record into the shape the pipeline expects.
const normalize = (raw) => ({
  id: raw.id || raw.url || '',
  title: raw.title || '',
  url: raw.url || '',
  skills: Array.isArray(raw.skills) ? raw.skills : (raw.skills ? [raw.skills] : []),
  description: raw.description || '',
  clientCountry: raw.clientCountry || '',
  clientRating: raw.clientRating || '',
  applicants: raw.applicants || '',
  contactName: raw.contactName || '',
  contactConfidence: raw.contactConfidence || '',
  applyLink: raw.applyLink || raw.url || '',
});

const matchesKeyword = (job, keyword) => {
  const needle = keyword.toLowerCase();
  const haystack = [job.title, ...(job.skills || [])].join(' ').toLowerCase();
  return haystack.includes(needle);
};

const fetchFromFixtures = (keyword) => {
  // Re-require fresh each call keeps it simple and avoids stale cache surprises.
  const sample = require(path.join(__dirname, '..', 'jobs', 'fixtures', 'jobs.sample.json'));
  return sample
    .map(normalize)
    .filter((job) => matchesKeyword(job, keyword));
};

// Map a raw Apify actor record (neatrat/upwork-job-scraper) to the fetcher's
// pre-normalize shape. Field names verified against live actor output:
// id, title, description, url, tags[], clientLocation, clientRating, proposals.
// The actor exposes no separate apply link or contact fields — leave those blank.
const mapApifyItem = (raw) => ({
  id: raw.id || raw.url || '',
  url: raw.url || '',
  title: raw.title || '',
  description: raw.description || '',
  skills: Array.isArray(raw.tags) ? raw.tags : [],
  clientCountry: raw.clientLocation || '',
  clientRating: (raw.clientRating === 0 || raw.clientRating) ? raw.clientRating : '',
  applicants: (raw.proposals === 0 || raw.proposals) ? raw.proposals : '',
  applyLink: raw.url || '',
});

const fetchFromApify = async (keyword) => {
  if (!config.APIFY_API_TOKEN) throw new Error('APIFY_API_TOKEN missing');

  // Required inside the function so fixtures-only runs never load the SDK.
  const { ApifyClient } = require('apify-client');
  const client = new ApifyClient({ token: config.APIFY_API_TOKEN });

  const input = {
    query: keyword,
    sort: 'newest',
    perPage: config.APIFY_MAX_RESULTS,
    pagesToScrape: 1,
  };

  let items;
  try {
    const run = await client.actor('neatrat/upwork-job-scraper').call(input);
    ({ items } = await client.dataset(run.defaultDatasetId).listItems());
  } catch (err) {
    throw new Error(`Apify fetch failed for "${keyword}": ${err.message}`);
  }

  if (!items || items.length === 0) return [];
  return items.map((raw) => normalize(mapApifyItem(raw)));
};

const fetchJobs = async (keyword) => {
  switch (config.UPWORK_SOURCE) {
    case 'fixtures':
      return fetchFromFixtures(keyword);
    case 'apify':
      return fetchFromApify(keyword);
    default:
      throw new Error(`Unknown UPWORK_SOURCE="${config.UPWORK_SOURCE}"`);
  }
};

module.exports = { fetchJobs };
