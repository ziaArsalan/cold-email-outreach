# Changelog

Worklog of completed tasks. The `/task` workflow appends an entry here when a task ships. Newest first. Loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### 2026-07-07 — [T-012] Analytics dashboard + queue/mailbox visibility
- **Added:** `GET /api/analytics` — stat cards (Sent/Pending/Failed from queue statuses; Replies from lead statuses), lead-level rates (`replyRate = replied/(contacted+replied)`, `bounceRate = bounced/(delivered+bounced)`, divide-by-zero guarded), per-campaign performance (reuses `countsByCampaign`), sanitized mailboxes with `effectiveDailyCap`. `GET /api/queue?status=&page=&limit=` — paginated, newest-first, lead email + campaign name populated. `POST /api/leads/:id/replied|bounced` — manual reply/bounce marking. Client Dashboard tab rebuilt: 6 stat cards, mailbox health table (health badge, sentToday/cap, pausedUntil, lastError), campaign performance table, live queue view with status filter, pagination, and Mark replied / Mark bounced actions on rows (actions live on queue rows because the Leads tab is Sheets-backed and lacks Mongo ids). New helpers `queueCountsByStatus`/`leadCountsByStatus` in campaignService.
- **Fixed (found in QA):** dashboard now loads once authenticated — the original mount-time fetch fired pre-login, 401'd silently, and left the dashboard empty until a manual refresh; the effect now depends on `authed`.
- **Area:** both
- **QA:** PASS — browser-verified (headless Chrome via playwright-core; Playwright MCP unavailable in that session) against a tagged seed dataset: all 6 cards matched the DB-computed snapshot exactly (Sent 3 / Pending 1 / Failed 1 / Replies 0 / Bounce 2.1% / Reply 0.0%); paused mailbox row showed badge, 7/20, pausedUntil + lastError; Mark replied flipped Reply % to 2.2% with Bounce % unchanged; status filters isolated failed/pending rows with correct columns. Post-fix re-check: dashboard populates immediately after login with zero clicks. No emails sent; all seed data removed after.
- **Commit:** T-012

### 2026-07-06 — [T-011] Campaigns — CRUD, states, enqueue flow (replaces batch /start)
- **Added:** `server/services/campaignService.js` — state machine (`draft→running→paused/resumed→stopped`, terminal `stopped`/`completed`), `start()` (targets `status:'new'` leads or an explicit `leadIds` override; generates missing AI intros synchronously with cached-intro reuse; renders template subject+body; enqueues one QueuedEmail per lead with no mailboxId so the worker rotates over `campaign.mailboxIds`; leads flip to `queued`), `isWithinWindow` (server-local, overnight windows supported), `sentTodayCount`, per-campaign queue counts aggregate. Worker gating in `processOne`: campaign not `running` → skip within one tick (pause semantics); outside schedule window or over campaign dailyLimit → reschedule + `campaign` SendLog entry; auto-`completed` when nothing pending remains. `QueuedEmail` enum gains `cancelled` (used by Stop's bulk-cancel). New routes: `GET/POST /api/campaigns`, `PUT /api/campaigns/:id` (draft-only), `POST /api/campaigns/:id/start|pause|resume|stop`. Client: new **Campaigns** tab (list with status badges, pending/sent counts, per-state Start/Pause/Resume/Stop; New Campaign form with template dropdown, AI prompt, mailbox multi-select, daily limit, warm-up toggle, day/time schedule).
- **Changed:** old batch `POST /api/start` now returns **410 Deprecated**; the Dashboard batch-send controls are removed — leads flow only through campaigns. `/api/send-email` + `/api/preview` (single-lead, Sheets flow) remain.
- **Area:** both
- **QA:** PASS — browser-verified via Playwright MCP with 3 QA leads (own aliases; real leads parked): Start enqueued 3 pending with zero immediate sends (worker off); with worker on all 3 sent via real SMTP; Pause froze sends within a tick (`skip — campaign not running` logged), Resume/Stop verified, Stop flipped remaining items to `cancelled`; past-window campaign logged `skip — outside schedule window` and sent nothing; `/api/start` → 410; no batch button in UI. 3 emails total, all to the user's own aliases.
- **Commit:** T-011

### 2026-07-06 — [T-010] Email queue + scheduler worker
- **Added:** `server/services/queueService.js` — `enqueue`, atomic `claimNext` (findOneAndUpdate pending→sending, oldest-first), `markSent`/`reschedule`/`markFailed`/`markBounced`, SendLog `log()` helper, and `classifySendError` (rate-limit / auth-or-connection / permanent / unknown). `server/workers/schedulerWorker.js` — dependency-injectable `processOne(deps)` single-tick + setTimeout-chained `start()` loop: one email per tick (never batched), uniform-random delay per send (warm-up 4–8 min / production 2–5 min via `SEND_MODE`; idle poll capped at `workerIdleMs`), mailbox rotation via T-009 `pickNext`. Failure dispatch: rate-limit (554/too-many) → pause that mailbox with escalating backoff + reschedule the item (retries NOT burned — box's fault); auth/connection → mailbox `error` + reschedule; permanent 5xx → item `bounced` + lead flagged; unknown → retry with 2^n backoff to `maxRetries` then `failed`. Worker gated by `QUEUE_WORKER_ENABLED`, started after Mongo connect, never in the `--once` path, tick-level try/catch so it can never crash the server. `server/scripts/testQueueWorker.js` in-process acceptance suite (fake providers, `__QTEST__` fixtures).
- **Area:** server
- **QA:** PASS — `QUEUE PASS` (all 5 scripted criteria: pending-when-disabled, one-at-a-time with differing gaps, A/B alternation + 554 pause/reschedule/continue, growing-backoff retries → failed with errorMessage+smtpResponse, SendLog per attempt with category+refs) + real end-to-end smoke: 2 emails to the user's own address through the live worker + Namecheap SMTP, both `250 2.0.0 Ok`, one SendLog entry each. Known gap (out of scope, noted in MEMORY): an item orphaned in `sending` by a hard crash needs a manual requeue — stale-claim sweeper deferred.
- **Commit:** T-010

### 2026-07-06 — [T-009] Provider-agnostic SMTP layer + mailbox management
- **Added:** `server/services/smtp/` — `NodemailerProvider` (send/verify from a Mailbox doc, connection/greeting/socket timeouts from `config.smtpTimeoutMs` so bad hosts fail in ~5s instead of hanging) + `providerFor(mailbox)` factory (only `smtp` implemented; Gmail/M365/Mailgun/SES/Resend throw "not implemented yet" and slot in later without touching callers). `server/services/mailboxService.js` — LRU rotation via persisted `lastUsedAt` (`pickNext` skips paused/error/at-limit boxes, auto-unpauses when `pausedUntil` elapses), daily/hourly counter rollover, warm-up week cap (`effectiveDailyCap`), `recordSend`, `pause`/`resume`, `sanitize`. New auth-gated routes: `GET/POST /api/mailboxes`, `PUT /api/mailboxes/:id` (password only overwritten when non-empty; never returned — `select:false` on the schema + sanitize), `POST /api/mailboxes/:id/test|pause|resume`. `server/scripts/testRotation.js` for the rotation acceptance check.
- **Changed:** `emailService.sendEmail`/`verifyConnection` now delegate to the provider layer via a transient env-based mailbox — same signatures, zero caller changes. `Mailbox` model: `password` is `select:false`, new `lastUsedAt`.
- **Area:** server
- **QA:** PASS (API/script): `ROTATION PASS` (1→2→3→1, paused + at-limit skipped); CRUD 200/201/400 with zero password leakage in any response; bad-host test → `healthStatus:error` + lastError in 5.0s (no hang), seeded box → healthy; `/api/test-smtp` OK; one real email sent through the new layer (`250 2.0.0 Ok: queued`).
- **Commit:** T-009

### 2026-07-06 — [T-008] Templates + AI intro-only personalization
- **Added:** `server/services/templateService.js` — pure `render(body, vars)` for `{{first_name}} {{last_name}} {{company}} {{industry}} {{website}} {{ai_intro}}` (missing vars → empty string) + `extractVars()`. `aiService.generateIntro(lead, aiPrompt)` — AI now writes only a <50-word personalized opener (+ stored-but-unused subject; the **rendered template subject** drives previews per user decision) with natural-writing/no-buzzword/specific-company-detail rules; web search + JSON extraction + `claude-sonnet-4-6` reused from `generateEmail` (which stays untouched for the legacy flow until T-011). New auth-gated routes: `GET/POST /api/templates`, `PUT /api/templates/:id`, `POST /api/leads/:id/preview` (generates + caches intro on the Lead only when `aiIntro` empty; legacy imported intros count as cache). Mongo-down → clean 503 via readyState guard.
- **Area:** server
- **QA:** PASS (API/script): CRUD 200/201/200 + 400/404 validation, persisted to Mongo; live preview on a fresh lead rendered all vars with a genuinely specific 33-word intro (referenced the lead's real app launch); second call `cached:true` in 8ms (no AI); legacy `/api/preview` shape unchanged.
- **Commit:** T-008

### 2026-07-06 — [T-007] Outreach V2 foundation — MongoDB, config module, models, Sheets import
- **Added:** MongoDB (mongoose ^8) foundation for the queue-based Outreach V2 architecture (spec: `.claude/docs/OUTREACH-V2.md`). New `server/config/index.js` (all V2 tunables: Mongo URI, send mode, delay ranges, retry, warm-up week table — distinct from the Upwork `server/jobs/config.js`), `server/db.js` (non-blocking connect, `bufferCommands=false`, 5s timeout), six models (`Lead`, `Mailbox`, `Template`, `Campaign`, `QueuedEmail`, `SendLog`) with spec enums + indexes, and idempotent `npm run import:sheets` (Sheets → Lead upserts by email, status mapping, col-G cached emails → aiIntro/aiSubject, seeds one Mailbox from `SMTP_*` env + one Default template). Server boots and serves all existing Sheets/Upwork routes even when Mongo is down. `.env.example`: `MONGODB_URI` (Atlas SRV placeholder), `QUEUE_WORKER_ENABLED`, `SEND_MODE`.
- **Area:** server
- **QA:** PASS (script/API per task — no browser): boot logs `[mongo] connected`; bogus-URI boot still serves `/api/leads` (46 leads) + Upwork settings; double import → 0 duplicates (45 unique leads, statuses `43 contacted / 2 new`, 43 with aiIntro); Mailbox + Default template seeded once.
- **Commit:** T-007

### 2026-06-08 — [T-006] Login screen + Monitor Settings UI polish
- **Added:** Full-page login screen (Devtronics branded, dark theme) gating the entire app — email/password form, JWT auth (8h expiry), token persisted in `localStorage`, auto-redirect to login on 401. New `server/services/authService.js` reads credentials from `AUTH_EMAIL`/`AUTH_PASSWORD`/`JWT_SECRET` env vars only — no hardcoded secrets. All `/api/*` routes except `/api/auth/login` now require a valid Bearer token. Logout button in sidebar footer clears token.
- **Changed:** Monitor Settings card restructured into a prominent `.cron-control-row` (toggle highlighted at top) + `.settings-fields-grid` 2-column grid (Actor ID, Cron Interval, Daily Limit, Active Hours, Auto-cover, full-width Keywords). All existing settings bindings unchanged.
- **Area:** both
- **QA:** PASS — browser-verified: unauthenticated shows login, wrong creds show error, correct creds load dashboard, refresh keeps session, logout clears token, settings card 2-col grid layout confirmed, Save works.
- **Commit:** T-006

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
