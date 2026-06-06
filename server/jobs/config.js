// Central config for the Upwork monitor. Nothing related to the monitor
// should be hardcoded outside this module.
//
// Precedence for each value: env var → stored UI config → hardcoded default.

const stored = require('../services/upworkConfigStore').readConfig();

const DEFAULT_KEYWORDS = [
  'GoHighLevel',
  'GHL developer',
  'SaaS development',
  'AI integration developer',
  'loyalty program developer',
  'Next.js developer',
  'React Node.js SaaS',
  'white label SaaS',
];

const KEYWORDS = (
  process.env.UPWORK_KEYWORDS ||
  stored.keywords ||
  DEFAULT_KEYWORDS.join(',')
)
  .split(',')
  .map((k) => k.trim())
  .filter(Boolean);

module.exports = {
  KEYWORDS,
  CRON_INTERVAL: process.env.CRON_INTERVAL || stored.cronInterval || '*/10 * * * *',
  ACTOR_ID: process.env.APIFY_ACTOR_ID || stored.actorId || 'neatrat/upwork-job-scraper',
  AUTO_COVER: process.env.UPWORK_AUTO_COVER
    ? process.env.UPWORK_AUTO_COVER === 'true'
    : (stored.autoCover ?? true),
  UPWORK_SOURCE: process.env.UPWORK_SOURCE || 'fixtures',
  APIFY_API_TOKEN: process.env.APIFY_API_TOKEN,
  APIFY_MAX_RESULTS: Number(process.env.APIFY_MAX_RESULTS) || 25,
  // Jobs sheet is separate from the leads sheet; falls back to the leads sheet id.
  JOBS_SHEET_ID: process.env.GOOGLE_JOBS_SHEET_ID || process.env.GOOGLE_SHEET_ID,
  JOBS_TAB: process.env.UPWORK_JOBS_TAB || 'Upwork',
};
