# Task Backlog

The queue the `/task` command reads. Add tasks by copying the template. `/task` (no number) picks the **highest-priority** task whose `status: todo` (P0 > P1 > P2 > P3; ties broken by order top-to-bottom).

## Fields

- **id** — stable, e.g. `T-001`. Never reuse.
- **priority** — `P0` (critical) · `P1` (high) · `P2` (normal) · `P3` (low).
- **status** — `todo` · `in-progress` · `qa` · `done` · `blocked`. The workflow updates this.
- **area** — `client` · `server` · `both`.
- **acceptance** — checkboxes the QA agent verifies in the browser. Be concrete (what to click, what should happen).

## Template (copy this)

```
## [T-XXX] Short title
- priority: P2
- status: todo
- area: client
- description: One or two sentences on what to build and why.
- acceptance:
  - [ ] Observable, browser-checkable outcome 1
  - [ ] Observable, browser-checkable outcome 2
```

---

<!-- Add tasks below. Newest priority wins on ties only by being higher in the file. -->

## [T-005] Upwork monitor controls — cron toggle, time-window scheduling, proposal limit, test-query
- priority: P1
- status: done
- area: both
- description: Extend the Upwork settings panel with four new controls: (1) **Cron on/off toggle** — a runtime enable/disable switch; the scheduled task still fires on its interval but `runCycle` skips execution when disabled, and the UI shows current state. (2) **Active time window** — configurable start/end time (HH:MM, 24h) during which the cron is allowed to run; outside the window cycles are silently skipped; the UI shows two time inputs and an "enable schedule" checkbox. (3) **Proposal limit** — max proposals to generate per day (integer); tracked in `server/data/upworkConfig.json` alongside a `dailyCount` + `dailyCountDate` (ISO date string); resets to 0 each new calendar day; when limit is reached the cycle skips `generateProposal` and logs it. (4) **Test query button** — a "Test Query" button in the settings panel that calls `POST /api/upwork/test-query` with the current keyword list (first keyword used, or user-selectable), runs the fetcher only (no Claude, no sheet write, no seen-store update), and displays the raw job list (title, link, skills, country, applicants) in a results panel below the button. New/changed server: `runCycle` reads config live from `upworkConfigStore` each cycle (so toggle/limit/window changes take effect without restart); `server/index.js` cron wiring unchanged (schedule is fixed at boot). Persist all new settings in `upworkConfig.json` alongside existing fields.
- acceptance:
  - [x] Settings panel shows a prominent ON/OFF toggle for the cron; toggling and saving reflects in the UI and persists; when OFF the next cron tick logs "[upworkMonitor] cron disabled — skipping cycle" and does not process jobs
  - [x] Settings panel shows "Active hours" — enable checkbox + Start time + End time inputs (HH:MM). When enabled and current time is outside the window, the cycle logs "[upworkMonitor] outside active window (HH:MM–HH:MM) — skipping" and does not process jobs
  - [x] Settings panel shows "Daily proposal limit" number input. When the day's generated proposal count reaches the limit, `runCycle` logs "[upworkMonitor] daily limit reached (N/N) — skipping proposals" and appends rows with empty cover letters for the rest of that day; count resets to 0 the next calendar day
  - [x] Stats bar shows current daily proposal count vs limit (e.g. "12 / 20 today")
  - [x] "Test Query" button in the settings panel: clicking it calls `POST /api/upwork/test-query` with the first keyword from the settings keyword list, shows a loading state, then renders a results card with a list of jobs returned (title, URL, skills, country, applicants) — no sheet rows written, no cover letters generated, no seen-store updates
  - [x] All five new settings (cronEnabled, scheduleEnabled, scheduleStart, scheduleEnd, dailyLimit) persist to `server/data/upworkConfig.json` and survive a server restart
  - [x] Existing settings (actor ID, keywords, cron interval, auto-cover) continue to work unchanged

## [T-004] Upwork dashboard — frontend module (stats, settings, jobs table, cover letter actions)
- priority: P1
- status: done
- area: both
- description: Add an "Upwork" sidebar tab to the React client. Inside: a stats bar (total jobs fetched, cover letters generated, active actor), a settings panel (actor ID, keywords, cron interval, auto-cover toggle), and a jobs table sourced from the jobs Google Sheet with per-row "Generate Cover" action (only shown/enabled when auto-cover is off and that row has no cover letter yet). Settings persist server-side in `server/data/upworkConfig.json` (gitignored). New server endpoints: `GET/POST /api/upwork/settings`, `GET /api/upwork/jobs`, `GET /api/upwork/stats`, `POST /api/upwork/generate-cover` (body: `{ rowIndex }`). The existing `server/jobs/config.js` must fall back gracefully to `upworkConfig.json` values when env vars are absent so settings saved in the UI take effect on the next cron cycle.
- acceptance:
  - [x] An "Upwork" tab is visible in the sidebar and clicking it shows the Upwork module (no other tabs break)
  - [x] Stats bar shows: total rows in the jobs sheet, how many have a non-empty cover letter (col J), and the active actor ID read from settings
  - [x] Settings panel fields: Actor ID (text), Keywords (textarea, comma-separated), Cron Interval (text, cron expression), Auto-generate cover letter (checkbox). Saving persists to `server/data/upworkConfig.json` and a success confirmation is shown
  - [x] Jobs table loads rows from the jobs Google Sheet (all 11 columns) with column headers; shows a loading state while fetching
  - [x] When auto-cover is OFF: each row without a cover letter (col J empty) shows a "Generate Cover" button; clicking it calls `POST /api/upwork/generate-cover`, shows a loading spinner on that row, and populates the cover letter cell when done
  - [x] When auto-cover is ON: the "Generate Cover" action button column is hidden (cover letters are generated automatically by the cron)
  - [x] Cover letter cell shows a truncated preview (first 80 chars + "…") with a click-to-expand modal or tooltip to read the full text
  - [x] The jobs table has a "Refresh" button that re-fetches from the sheet

## [T-002] Upwork job monitor — core pipeline (fixtures-backed)

- priority: P1
- status: done
- area: server
- description: Build the headless Upwork monitor inside `server/` per the spec. Pluggable fetch layer running on sample fixtures → dedupe → Claude cover letter (Zia's brand voice) → append a row to the jobs Google Sheet. node-cron scheduler + a `--once` dry-run mode. Reuse existing JWT Sheets auth and the Claude call style; do NOT add a credentials.json or duplicate infra. **Full spec:** [.claude/docs/UPWORK-MONITOR.md](.claude/docs/UPWORK-MONITOR.md). Verify with a live dry-run (run with `skip-qa`).
- acceptance:
  - [x] `--once` dry-run reads sample fixtures, generates one cover letter per job via Claude `claude-sonnet-4-6`, and appends one row per NEW job to the jobs sheet/tab with all 11 columns (A→K) in the spec's order
  - [x] Running the dry-run twice does not create duplicate rows (seen-store in `server/data/seenJobs.json` works and persists)
  - [x] Generated cover letters are under 200 words, reference Zia's portfolio where relevant, and avoid the banned generic phrases
  - [x] New env vars are added to `server/.env.example` with placeholders only (no secrets); keywords, interval, source, and jobs-sheet are config-driven, not hardcoded
  - [x] node-cron is wired in `server/index.js` using `CRON_INTERVAL` but does not block the existing server or the `--once` path
  - [x] `server/data/seenJobs.json` and any `credentials.json` are gitignored

## [T-003] Upwork job monitor — wire Apify real job source

- priority: P2
- status: done
- area: server
- description: Replace the fixtures source with real Upwork jobs via the Apify actor `neatrat/upwork-job-scraper` (npm: `apify-client`). Wire it behind the existing `upworkFetch.js` pluggable interface so `UPWORK_SOURCE=apify` activates it. Add `APIFY_API_TOKEN` to env. **Spec:** [.claude/docs/UPWORK-MONITOR.md](.claude/docs/UPWORK-MONITOR.md).
- acceptance:
  - [x] `UPWORK_SOURCE=apify` triggers the Apify actor `neatrat/upwork-job-scraper` per keyword and returns normalized jobs matching the existing fetcher interface
  - [x] At least one live job per keyword flows through dedupe → Claude → sheet on a real run
  - [x] Apify rate errors, empty results, and actor failures are caught per-keyword and logged without crashing the cron loop
  - [x] `APIFY_API_TOKEN` added to `server/.env.example` as a placeholder; never committed with a real value
  - [x] `UPWORK_SOURCE=fixtures` still works unchanged (no regression)
