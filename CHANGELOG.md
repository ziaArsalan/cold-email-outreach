# Changelog

Worklog of completed tasks. The `/task` workflow appends an entry here when a task ships. Newest first. Loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### 2026-06-06 — [T-003] Upwork job monitor — wire Apify real job source
- **Added:** `UPWORK_SOURCE=apify` activates the Apify actor `neatrat/upwork-job-scraper` (npm: `apify-client`) behind the existing pluggable fetcher interface. `mapApifyItem()` adapter translates real actor output fields (`tags`→skills, `clientLocation`→country, `proposals`→applicants, `clientRating`, `clientName`/`clientNameConfidence`→contact fields). `APIFY_MAX_RESULTS` config (default 25, min 10). `UPWORK_SOURCE=fixtures` unchanged.
- **Area:** server
- **QA:** Verified via live `--once` dry-run — 10 real GoHighLevel jobs fetched from Upwork via Apify, all 10 processed through dedupe → Claude → sheet with cover letters in Zia's brand voice.
- **Commit:** T-003

### 2026-06-06 — [T-002] Upwork job monitor — core pipeline (fixtures-backed)
- **Added:** Headless Upwork job monitor inside `server/`. Pluggable fetch layer (fixtures-backed, real source deferred to T-003) → dedupe via `server/data/seenJobs.json` → Claude `claude-sonnet-4-6` cover letter in Zia's brand voice → row append to Google Sheet jobs tab (11 columns A→K). node-cron scheduler via `CRON_INTERVAL` env, plus a `--once` / `npm run monitor:once` dry-run mode that bypasses the HTTP server.
- **Area:** server
- **QA:** Verified via live `--once` dry-run — 8 fixture jobs appended to test sheet (all 11 columns), second run produced zero duplicates, cover letters 155–184 words with portfolio references and no generic filler.
- **Commit:** T-002

<!-- Entries are added here automatically. Format:

### YYYY-MM-DD — [T-XXX] Title
- **Added / Changed / Fixed:** what changed, in user terms
- **Area:** client | server | both
- **QA:** passed in browser (or: skipped) — note what was tested
- **Commit:** <short sha>
-->
