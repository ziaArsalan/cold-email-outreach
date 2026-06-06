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

const fetchJobs = async (keyword) => {
  switch (config.UPWORK_SOURCE) {
    case 'fixtures':
      return fetchFromFixtures(keyword);
    case 'rss':
    case 'google':
      throw new Error(
        `UPWORK_SOURCE="${config.UPWORK_SOURCE}" not implemented — deferred to T-003`,
      );
    default:
      throw new Error(`Unknown UPWORK_SOURCE="${config.UPWORK_SOURCE}"`);
  }
};

module.exports = { fetchJobs };
