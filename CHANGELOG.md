# Changelog

Worklog of completed tasks. The `/task` workflow appends an entry here when a task ships. Newest first. Loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### 2026-06-08 — [T-005] Upwork monitor controls — cron toggle, time-window, daily limit, test-query
- **Added:** Cron ON/OFF toggle (runtime, no restart needed); Active Hours scheduling (enable checkbox + start/end HH:MM time inputs, overnight windows supported); Daily Job Limit (counts every appended job, resets each calendar day, persisted in `upworkConfig.json`); "🔍 Test Query" button (runs fetcher only — no Claude, no sheet write, no seen-store update — returns job list in UI). Stats bar 4th tile: "Today's Jobs (count / limit)". `runCycle` now reads config live from `upworkConfigStore` each cycle so all new controls take effect without a server restart.
- **Area:** both
- **QA:** PASS — browser-verified via Playwright MCP: toggle persists OFF after reload, active-hours times persist, daily limit tile shows "0/5", Test Query returned 50 live GoHighLevel jobs with no sheet rows written, all existing settings unchanged.
- **Commit:** T-005

### 2026-06-06 — [T-004] Upwork dashboard — frontend module
- **Added:** "Upwork" sidebar tab with: stats bar (Total Jobs, Cover Letters, Active Actor), settings panel (Actor ID, Keywords, Cron Interval with restart note, Auto-generate toggle) persisted to `server/data/upworkConfig.json`, jobs table with all 11 columns sourced from the jobs Google Sheet, truncated cover letter previews with click-to-expand modal, "Generate Cover" action button per row (shown only when auto-cover is OFF and row has no letter), ↻ Refresh. Server: 4 new `/api/upwork/*` routes, `upworkConfigStore.js`, `fetchJobRows`/`updateCoverLetter` in `upworkSheet.js`, AUTO_COVER wired into `upworkMonitor.js`.
- **Area:** both
- **QA:** PASS — browser-verified via Playwright MCP: all 8 criteria confirmed including live sheet data (17 jobs), settings save/persist, modal open/close, auto-cover column toggle.
- **Commit:** T-004

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
