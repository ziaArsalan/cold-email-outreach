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

## [T-003] Upwork job monitor — wire a real job source

- priority: P2
- status: blocked
- area: server
- description: Replace the fixtures source with a real Upwork feed behind the same fetcher interface from T-002. BLOCKED until a working source is confirmed — public RSS is login-walled and the Google `site:upwork.com` fallback is CAPTCHA-gated. Unblock once Zia provides a working RSS URL/token, an Upwork API credential, or a 3rd-party jobs API. **Spec:** [.claude/docs/UPWORK-MONITOR.md](.claude/docs/UPWORK-MONITOR.md).
- acceptance:
  - [ ] `UPWORK_SOURCE` can select the real source; it returns normalized jobs matching the fetcher interface
  - [ ] A real keyword search returns at least one live job that flows through dedupe → Claude → sheet
  - [ ] Failures (rate limit / login wall / empty feed) are caught and logged without crashing the cron loop
