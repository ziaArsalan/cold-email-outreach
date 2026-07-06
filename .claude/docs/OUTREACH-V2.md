# Outreach V2 — Queue-Based Cold Email Architecture

Spec for the incremental refactor from "sync batch loop over Google Sheets" to a queue-based, multi-mailbox, deliverability-first system. Tasks T-007 → T-013 in [tasks.md](../../tasks.md) implement this in order. Read only the section a task needs.

## Where we are today (baseline)

- **Datastore:** Google Sheets only (`sheetsService.js`, cols A–G). **No MongoDB anywhere** — adopting it is Phase 1, and there is no existing Mongo data to migrate.
- **Sending:** `POST /api/start` runs a synchronous batch loop (fixed `delayMs`, default 3s) with one SMTP account from env vars.
- **AI:** `aiService.generateEmail()` writes the *entire* email (subject + body) per lead via Claude + web search.
- No queue, no scheduler, no mailbox rotation, no warm-up, no campaigns, no templates, no analytics beyond in-memory `jobState`.
- The Upwork monitor (`server/jobs/*`) is a separate module — untouched by this refactor.

## Target flow

```
Lead Import → AI Personalization → Email Queue → Scheduler Worker → SMTP Sender → Tracking → Analytics
```

Emails are **never sent at generation time**. Everything enters the `emailqueue` collection and is drained one-at-a-time by a background worker.

## Decisions (proposed 2026-07-06 — confirm before Phase 1 ships)

1. **MongoDB becomes the system of record.** Google Sheets is demoted to a *lead import source* (alongside CSV/Apollo export). No write-back to Sheets after import.
2. **`MONGODB_URI`** env var supports both local Mongo and Atlas; default `mongodb://localhost:27017/devtronics-outreach`.
3. **Reply/bounce tracking** starts manual + SMTP-error-driven (bounce = permanent SMTP failure or delivery-status message). IMAP inbox polling for auto reply-detection is a later phase, not in T-007–T-013.
4. **Open tracking** (pixel) conflicts with plain-text-first deliverability — implemented as an optional per-campaign flag, **off by default**.
5. Old endpoints keep working during the transition; `POST /api/start` is replaced only when campaigns land (T-011).

## Server layout (target)

```
server/
  index.js                    # bootstrap: express + mongoose connect + start worker
  config/index.js             # ALL tunables in one module (see Configuration)
  models/                     # mongoose schemas: Lead, Mailbox, Template,
                              #   Campaign, QueuedEmail, SendLog
  services/
    aiService.js              # generateIntro(lead, prompt) → { intro, subject? }
    templateService.js        # render(templateBody, vars) — {{var}} substitution
    queueService.js           # enqueue, claimNext, transition statuses
    mailboxService.js         # rotation, limits, health, pause/resume
    leadImportService.js      # Sheets / CSV → Lead docs (dedupe by email)
    smtp/
      SmtpProvider.js         # interface: send(mail), verify()
      NodemailerProvider.js   # Namecheap/any-SMTP impl
      index.js                # factory: providerFor(mailbox)
  workers/
    schedulerWorker.js        # the continuous send loop
  routes/api.js               # thin HTTP layer only — no business logic
```

Rule: services are constructor/parameter-injected where they depend on each other (unit-testable, provider-agnostic). Routes never touch nodemailer/mongoose directly.

## Models

**Lead** — firstName, lastName, company, email (unique, lowercased), website, industry, country, status (`new|queued|contacted|replied|bounced|unsubscribed|failed`), aiIntro, aiSubject, lastContactDate, campaignId, replyStatus, bounceStatus, source (`sheets|csv|apollo|manual`), createdAt/updatedAt.

**Mailbox** — name, email, provider (`smtp` now; `gmail|m365|mailgun|ses|resend` later), host, port, secure, username, password, dailyLimit, hourlyLimit, sentToday, sentThisHour (+ reset timestamps), warmupEnabled, warmupStartDate, healthStatus (`healthy|paused|error`), pausedUntil, lastError, active.

**Template** — name, subject (may contain vars), body (plain text with `{{first_name}} {{company}} {{industry}} {{website}} {{ai_intro}}`), signature, active. Editable via API/UI — never hardcoded.

**Campaign** — name, templateId, aiPrompt, mailboxIds[], dailyLimit, status (`draft|running|paused|completed|stopped`), warmupEnabled, schedule { days[], startTime, endTime, timezone }, stats cache.

**QueuedEmail** — campaignId, leadId, mailboxId, subject, body, status (`pending|scheduled|sending|sent|failed|bounced`), scheduledAt, sentAt, retries, maxRetries, smtpResponse, errorMessage, createdAt. Indexes: `{status, scheduledAt}`, `{mailboxId, status}`, `{campaignId}`.

**SendLog** — append-only: timestamp, level, category (`smtp|queue|campaign|ai|rotation|retry|error`), message, refs (queueId/mailboxId/campaignId), meta.

## AI personalization (new strategy)

AI generates **only** `ai_intro` (< 50 words) and optionally a subject — never the whole email. The rest comes from the campaign's template. Prompt requirements: natural writing, no marketing buzzwords, no AI-sounding language, must mention something specific about the company (web search stays enabled for research). Keep returning strict JSON `{ "intro": "...", "subject": "..." }` and reuse the existing extraction/caching pattern (generate once, store on the Lead, never regenerate).

## Scheduler worker

Single continuous loop (setTimeout-chained, not cron, so delays can be random):

1. Skip if outside the campaign schedule window or campaign not `running`.
2. Claim the oldest `pending` queue item atomically (`findOneAndUpdate` → `sending`) — one email per tick, **never batches**.
3. Pick the next mailbox **round-robin** among the campaign's mailboxes, skipping any that is paused, unhealthy, or at its daily/hourly limit. If none available → item back to `pending`, wait.
4. Send via the mailbox's provider. Log every attempt to SendLog.
5. Success → `sent`, stamp sentAt + smtpResponse, bump mailbox counters, update Lead.
   Failure → classify (below), `retries++`; past maxRetries → `failed`.
6. Sleep a **random** delay, then loop:
   - Warm-up mode: 4–8 min. Production: 2–5 min. Never fixed — uniform random in range, per-send.

### SMTP error handling / rate limiting

On errors like `554 5.7.1` / "too many messages" / 4xx throttling: pause **that mailbox** (`healthStatus=paused`, `pausedUntil = now + backoff`), reschedule the item on another mailbox or later, and double the backoff on repeat. Never hot-retry in a loop. Auth/connection errors → mailbox `error` + lastError; content rejections → item `failed` (no retry).

### Warm-up schedule (per mailbox, from warmupStartDate — all configurable)

| Week | Emails/day |
|------|-----------|
| 1 | 5–10 |
| 2 | 10–20 |
| 3 | 20–30 |
| 4 | 40–50 |

Effective mailbox daily cap = min(warmup cap for current week, mailbox.dailyLimit, campaign.dailyLimit share).

## Configuration (`server/config/index.js`)

Everything tunable lives here, env-overridable: delay ranges (warmup + production), retry count + backoff base, SMTP timeout, warm-up week table, default limits, worker tick guard, Mongo URI. No magic numbers inside services.

## Deliverability rules (enforced at compose time)

Plain text by default; max **one** link; no images/attachments; human-like line breaks; signature from template. SPF/DKIM/DMARC are DNS-side — documented per sending domain in the deliverability guide (T-013), with a startup check that warns if `FROM` domain ≠ mailbox domain.

## Sheets → Mongo import (one-time, T-007)

Script `server/scripts/importFromSheets.js`: reads `Sheet1!A:G` via the existing `sheetsService`, maps Email/Name/Business/Website/Reference → Lead fields (name split into first/last on first space), Status `''`→`new`, `Emailed`→`contacted`, `Failed`→`failed`; col G `generatedEmail` JSON → stored as legacy aiIntro/aiSubject. Dedupes by email. Idempotent (upsert). Also seeds: one Mailbox from current `SMTP_*` env vars, one default Template from the example in the brief.

## New env vars (mirror into `.env.example` with placeholders)

`MONGODB_URI`, `QUEUE_WORKER_ENABLED`, `SEND_MODE` (`warmup|production`), plus optional overrides for delay ranges / retry counts. Existing `SMTP_*` vars remain as the seed for the first mailbox.
