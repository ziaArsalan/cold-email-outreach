# Changelog

Worklog of completed tasks. The `/task` workflow appends an entry here when a task ships. Newest first. Loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

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
