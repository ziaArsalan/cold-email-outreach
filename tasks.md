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

<!-- ═══ Outreach V2.1 (portal completeness) — do T-014→T-016 in order ═══ -->

## [T-014] Template manager UI — create/edit email copy from the portal
- priority: P1
- status: todo
- area: both
- description: The template API (T-008: `GET/POST/PUT /api/templates`) has no UI — campaigns can only pick from pre-existing templates. Add a **Templates** tab to the client: list (name, subject, active badge, updatedAt) + create/edit form (name, subject, body textarea, signature textarea, active toggle) with a variables hint (`{{first_name}} {{last_name}} {{company}} {{industry}} {{website}} {{ai_intro}}`) and a live preview pane that renders the template with sample values (client-side substitution is fine). Server: add `DELETE /api/templates/:id` — reject with 400 when any campaign references the template (`Campaign.exists({ templateId })`), suggest deactivating instead. The campaign form's template dropdown must reflect newly created templates without a full page reload (refetch on tab entry is fine).
- acceptance:
  - [ ] A "Templates" tab lists existing templates; the seeded Default is visible with its subject
  - [ ] Creating a template in the UI persists it (survives reload) and it immediately appears in the Campaigns form's template dropdown
  - [ ] Editing body/subject/signature saves and the live preview shows all `{{vars}}` substituted with sample values
  - [ ] Deleting an unreferenced template removes it; deleting one referenced by a campaign shows a clear error and does not delete

## [T-015] Follow-up sequences — multi-step campaigns with stop-on-reply
- priority: P1
- status: todo
- area: both
- description: Campaigns are single-touch today. Add sequence steps: Campaign gains `steps: [{ order, templateId, delayDays }]` (step 1 = the initial email; backward compat: campaigns with empty `steps` behave exactly as today using `templateId`). Enqueue-at-send-time design: when the worker marks a step-N item `sent`, it enqueues the step-N+1 item for the same lead with `scheduledAt = sentAt + delayDays` (renders the step's template with the lead's cached `ai_intro`; `QueuedEmail` gains `stepIndex`). **Stop-on-reply/bounce/unsubscribe:** before sending ANY item, the worker checks the lead's current status — `replied`/`bounced`/`unsubscribed` → item flips to `cancelled` (never sent) and no further steps are scheduled. Campaign auto-completion must count future-scheduled follow-ups as open work. Deliverability gate at start validates EVERY step's template, not just the first. Client: campaign form gets a sequence builder — step 1 template + "+ Add follow-up" rows (template dropdown + "wait N days"); campaign list shows the step count; queue view shows the step number per item.
- acceptance:
  - [ ] Creating a campaign with 2 follow-ups (e.g. +3 days, +7 days) and starting it enqueues ONLY step-1 items; step count visible in the campaigns list
  - [ ] After a step-1 item sends, a step-2 item exists for that lead with `scheduledAt` ≈ sentAt + configured delay (test-shortened delays acceptable), and the worker does not send it early
  - [ ] Marking the lead as Replied before the follow-up's time causes the worker to cancel (not send) the pending follow-up
  - [ ] A campaign with no steps behaves exactly as before (single email, regression-safe); existing running campaigns are unaffected
  - [ ] Deliverability validation at start covers every step's template (a 2-link template in step 2 blocks the start)

## [T-016] Outreach settings portal — move runtime tunables out of .env
- priority: P2
- status: todo
- area: both
- description: Most V2 env vars are runtime tunables, not secrets — manage them from the portal (same live-read pattern as the Upwork monitor's `upworkConfigStore`, but Mongo-backed). Server: an `OutreachSetting` singleton doc + `settingsService.get()` with precedence stored-value → env → default, read **live** where it matters (worker tick reads sendMode/delays/enabled each cycle — the worker loop keeps running and checks an `enabled` flag per tick instead of only at boot; verification toggles read per start; retry/idle values per use). Manageable settings: queue worker enabled, send mode (warmup/production), warm-up + production delay ranges (minutes in the UI, ms in storage), max retries, worker idle seconds, warm-up week table (4 rows), email-verification toggles (MX / disposable / role-based). Secrets and infra (SMTP_*, ANTHROPIC_API_KEY, GOOGLE_*, MONGODB_URI, JWT/AUTH, APIFY_*) stay env-only — never shown in the portal. Endpoints: `GET/PUT /api/outreach-settings` (validated). Client: an "Outreach Settings" card (grouped: Worker, Delays, Warm-up, Verification) in the Settings/Dashboard area with Save + saved-state feedback. `.env.example` gains a comment noting these vars are now fallbacks for the portal settings.
- acceptance:
  - [ ] Settings card loads current effective values (stored ?? env ?? default) and saves changes that persist across a server restart
  - [ ] Toggling "queue worker enabled" OFF in the portal stops sends within one worker tick (no server restart); ON resumes them
  - [ ] Switching send mode warmup→production changes the delay range used for the next send (observable with test-shortened ranges)
  - [ ] Toggling an email-verification check (e.g. role-based) in the portal changes campaign-start behavior on the next start without restart
  - [ ] No secret (SMTP password, API keys, Mongo URI, JWT) appears anywhere in the settings UI or its API responses

<!-- ═══ Outreach V2 (queue-based sending) — spec: .claude/docs/OUTREACH-V2.md — do T-007→T-013 in order ═══ -->

## [T-007] Outreach V2 foundation — MongoDB, config module, models, Sheets import
- priority: P1
- status: done
- area: server
- description: Phase 1 of [OUTREACH-V2.md](.claude/docs/OUTREACH-V2.md) (§Models, §Configuration, §Sheets → Mongo import). Add `mongoose`, connect via `MONGODB_URI` at boot (server still starts with a warning if Mongo is down — existing Sheets/Upwork features must not break). Create `server/config/index.js` (all tunables) and models: Lead, Mailbox, Template, Campaign, QueuedEmail, SendLog. Write idempotent `server/scripts/importFromSheets.js` (maps Sheet cols per spec, dedupes by email, seeds one Mailbox from `SMTP_*` env vars + one default Template). Add new env vars to `.env.example` with placeholders. QA via API/script (skip browser QA).
- acceptance:
  - [x] `npm run server` connects to Mongo and logs it; with Mongo down the server still boots and existing `/api/leads` + Upwork routes work
  - [x] Running the import script twice produces no duplicate Leads; statuses map `''→new`, `Emailed→contacted`, `Failed→failed`; col G JSON lands in aiIntro/aiSubject
  - [x] After import: one Mailbox seeded from env SMTP vars, one default Template exists
  - [x] `.env.example` gains `MONGODB_URI`, `QUEUE_WORKER_ENABLED`, `SEND_MODE` (placeholders only)

## [T-008] Templates + AI intro-only personalization
- priority: P1
- status: done
- area: server
- description: Phase 2 of [OUTREACH-V2.md](.claude/docs/OUTREACH-V2.md) (§AI personalization, §Models→Template). `templateService.render(body, vars)` substituting `{{first_name}} {{company}} {{industry}} {{website}} {{ai_intro}}`. Rework `aiService`: new `generateIntro(lead, aiPrompt)` returning `{ intro, subject }` — intro < 50 words, natural, no buzzwords, mentions something specific about the company (keep web search + JSON-extraction + generate-once caching on the Lead). Template CRUD endpoints (`GET/POST/PUT /api/templates`) and `POST /api/leads/:id/preview` composing template + ai_intro. Keep old `generateEmail` working until T-011 removes its caller.
- acceptance:
  - [x] Template CRUD persists to Mongo; templates are editable without code changes
  - [x] Preview endpoint returns a fully rendered email: template body with all vars substituted and the AI intro inline
  - [x] Generated intros are < 50 words and stored on the Lead (second preview call makes no AI request)
  - [x] Existing `/api/preview` (Sheets flow) still works unchanged

## [T-009] Provider-agnostic SMTP layer + mailbox management
- priority: P1
- status: done
- area: server
- description: Phase 3 of [OUTREACH-V2.md](.claude/docs/OUTREACH-V2.md) (§Server layout→smtp/, §Models→Mailbox). `SmtpProvider` interface + `NodemailerProvider` + factory keyed on `mailbox.provider` (only `smtp` implemented now — Gmail/M365/Mailgun/SES/Resend slot in later without touching callers). `mailboxService`: round-robin `pickNext(mailboxIds)` skipping paused/limit-reached boxes, counter bump + daily/hourly reset, pause/resume, effective-cap calc incl. warm-up week table from config. Mailbox CRUD + `POST /api/mailboxes/:id/test` (provider verify). Refactor `emailService.sendEmail` to delegate to the provider layer (existing routes keep working).
- acceptance:
  - [x] Mailbox CRUD works; passwords never returned by the API
  - [x] Test endpoint verifies a mailbox connection and updates healthStatus/lastError
  - [x] Unit-style check: rotation across 3 mailboxes yields 1→2→3→1; a paused or at-limit box is skipped
  - [x] Existing `/api/test-smtp` and single-send flow still work via the new provider layer

## [T-010] Email queue + scheduler worker (random delays, rotation, retries, rate-limit pause)
- priority: P1
- status: done
- area: server
- description: Phase 4 of [OUTREACH-V2.md](.claude/docs/OUTREACH-V2.md) (§Scheduler worker, §SMTP error handling, §Warm-up). `queueService` (enqueue, atomic claimNext via findOneAndUpdate, status transitions) + `workers/schedulerWorker.js`: continuous setTimeout-chained loop, one email per tick, random uniform delay (warm-up 4–8 min / production 2–5 min per `SEND_MODE`, never fixed), mailbox rotation via T-009, retries with backoff to maxRetries, SMTP rate-limit classification (554/too-many → pause mailbox + reschedule, never hot-retry), every attempt logged to SendLog. Worker gated by `QUEUE_WORKER_ENABLED`. Emails are NEVER sent at generation time and NEVER batched.
- acceptance:
  - [x] Enqueued emails sit in `pending`; nothing sends when the worker is disabled
  - [x] With worker on (test-shortened delays via config): items go pending→sending→sent one at a time, with visibly different gaps between sends
  - [x] Two mailboxes alternate sends; forcing a 554-style error pauses that mailbox, reschedules the item, and the other mailbox continues
  - [x] A failing item retries up to maxRetries with growing backoff then lands in `failed` with errorMessage + smtpResponse populated
  - [x] SendLog has one entry per attempt with category + refs

## [T-011] Campaigns — CRUD, states, enqueue flow (replaces batch /start)
- priority: P1
- status: done
- area: both
- description: Phase 5 of [OUTREACH-V2.md](.claude/docs/OUTREACH-V2.md) (§Models→Campaign). Campaign CRUD + state machine (draft/running/paused/completed/stopped) + `POST /api/campaigns/:id/start`: for each targeted Lead, generate ai_intro (T-008), render template, enqueue (T-010) — sending is then entirely the worker's job, respecting campaign dailyLimit, schedule window, and warmupEnabled. Pausing a campaign halts its queue items; stopping cancels pending ones. Minimal client UI: campaigns list + create form (name, template, AI prompt, mailboxes, daily limit, warm-up toggle, schedule) + start/pause/stop buttons. Deprecate the old `/api/start` batch loop (keep endpoint returning a pointer to campaigns, or remove from UI).
- acceptance:
  - [x] Creating a campaign in the UI and clicking Start enqueues one QueuedEmail per pending lead and flips status to Running — no email sends immediately
  - [x] Pause stops further sends within one worker tick; Resume continues; Stop cancels remaining pending items
  - [x] Campaign respects its schedule window (outside hours: worker skips, logs it)
  - [x] Old batch send button is gone from the UI; leads flow only through campaigns

## [T-012] Analytics dashboard + queue/mailbox visibility
- priority: P2
- status: done
- area: both
- description: Phase 6 of [OUTREACH-V2.md](.claude/docs/OUTREACH-V2.md) (§Analytics). Server: `GET /api/analytics` (sent/pending/failed counts, reply + bounce rates, per-campaign performance, per-mailbox health + today's counts vs limits), `GET /api/queue` (paginated queue with status filter), endpoints to mark a lead replied/bounced manually. Client: dashboard cards (Sent, Pending, Failed, Replies, Bounce %, Reply %), mailbox health table, campaign performance table, live queue view.
- acceptance:
  - [x] Dashboard shows accurate counts matching Mongo state after a test campaign run
  - [x] Mailbox table shows each box's health, sentToday vs dailyLimit, and pausedUntil when paused
  - [x] Marking a lead as Replied updates reply rate; a bounced send updates bounce rate
  - [x] Queue view filters by status and shows scheduledAt/sentAt/error per item

## [T-013] Deliverability polish + sending-domain guide
- priority: P2
- status: done
- area: server
- description: Phase 7 of [OUTREACH-V2.md](.claude/docs/OUTREACH-V2.md) (§Deliverability). Compose-time enforcement: plain-text by default (HTML only if campaign opts in), warn/block when body has >1 link, images, or attachments; signature appended from template; human-like formatting preserved. Startup/mailbox-test warning when FROM domain ≠ mailbox domain. Write `.claude/docs/DELIVERABILITY.md`: SPF/DKIM/DMARC DNS records for Namecheap Private Email (meetdevtronics.com / devtronics.co), warm-up guidance, unsubscribe-handling note.
- acceptance:
  - [x] Sending a template with 2 links is rejected at enqueue with a clear error
  - [x] Sent emails are plain text (no HTML part) unless the campaign explicitly enables HTML
  - [x] Mailbox test warns on FROM/domain mismatch
  - [x] DELIVERABILITY.md exists with copy-pasteable SPF/DKIM/DMARC record examples

## [T-006] Login screen + Monitor Settings UI polish
- priority: P0
- status: done
- area: both
- description: Two go-live requirements. (1) **Login screen** — a full-page login form (email + password) that gates the entire app. Server: `POST /api/auth/login` validates against `AUTH_EMAIL` + `AUTH_PASSWORD` env vars and returns a signed JWT (`JWT_SECRET` env var, 8h expiry). Client: stores token in `localStorage`, attaches it as `Authorization: Bearer <token>` on every API call, redirects to login on 401. No signup — single-user only. All `/api/*` routes except `/api/auth/login` require a valid token via Express middleware. (2) **Monitor Settings UI polish** — reorganise the settings card into a clean 2-column grid layout with logical grouping: a "Cron Control" section (toggle + interval), a "Schedule" section (active hours), a "Limits" section (daily limit), a "Source" section (actor ID + keywords), and an "Options" section (auto-cover). Fix the cramped/misaligned layout visible in current UI. Credentials live only in `server/.env` — never committed.
- acceptance:
  - [x] Visiting the app when not logged in shows a full-page login screen (Devtronics branding, email + password fields, Login button)
  - [x] Correct credentials log in and show the main app; incorrect credentials show an error message
  - [x] After login, refreshing the page keeps the user logged in (token persists in localStorage)
  - [x] A "Logout" button in the app header/nav clears the token and returns to the login screen
  - [x] All API calls include the JWT; a direct API call without a token returns 401
  - [x] Monitor Settings card has a clean 2-column grid layout with clearly grouped sections; fields are not cramped or misaligned; the cron toggle is prominently styled at the top
  - [x] All existing Upwork settings (actor ID, keywords, cron interval, auto-cover, schedule, daily limit, cron toggle) still load, edit, and save correctly after the layout change

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
