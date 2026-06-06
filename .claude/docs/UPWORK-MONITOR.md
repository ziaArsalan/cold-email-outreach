# Upwork Job Monitor — Feature Spec

Reference for tasks T-002 / T-003. Adapted from Zia's original spec to **integrate into the existing `server/`** and **reuse** what's already built. Read the section you need; don't inline this into agent context — link to it.

## Goal
A headless pipeline that periodically finds new Upwork jobs matching keyword filters, generates a personalised cover letter via Claude in Zia's brand voice, and appends a row to a Google Sheet. A Zapier zap watches that sheet and pushes a notification to iPhone/Mac. Zia reviews and applies manually. **The code never logs into Upwork and never submits proposals.**

## Decisions (locked)
- **Lives in `server/`**, not a standalone folder. New modules under `server/services/`, a cron runner wired into the server (or a dedicated entry the cron invokes). Shares `server/.env`.
- **Reuse existing infra:**
  - Google Sheets auth → reuse the JWT pattern in [../../server/services/sheetsService.js](../../server/services/sheetsService.js) (`GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_PRIVATE_KEY`). **Do NOT** introduce a `credentials.json` keyFile.
  - Claude calls → mirror the request style in [../../server/services/aiService.js](../../server/services/aiService.js) (axios, `x-api-key`, `anthropic-version: 2023-06-01`). Standardize the model on **`claude-sonnet-4-6`**.
- **Fetch layer is pluggable** behind an interface, shipped with **sample fixtures**, so the dedupe → Claude → Sheets pipeline is fully buildable and testable now. The real Upwork source is wired later (T-003) once a working one is confirmed — public RSS (`/ab/feed/jobs/rss`) is behind a login wall and the `site:upwork.com` Google fallback is CAPTCHA-gated.
- **Verification = live dry-run**, not browser QA. A `--once` (dry-run) mode runs one cycle on demand.
- **Notifications (Zapier → Pushover) are external setup**, out of code scope. Code's only job is to append a well-formed row.

## Pipeline
```
cron (every CRON_INTERVAL) ─▶ for each keyword:
  fetchJobs(keyword)            # pluggable source; fixtures in dev
  ─▶ dedupe against seen-store  # server/data/seenJobs.json (gitignored)
  ─▶ for each NEW job:
        extract structured fields
        generateProposal(job)   # Claude sonnet-4-6, Zia brand voice
        appendJobRow(job, letter)  # Google Sheet, jobs tab
        mark job id as seen
```

## Jobs sheet
- Separate from the leads sheet. Use env `GOOGLE_JOBS_SHEET_ID` (falls back to `GOOGLE_SHEET_ID` if unset) and a dedicated tab, default `Upwork`, range `Upwork!A:K`.
- Column order (A→K), one row per job:

| A | B | C | D | E | F | G | H | I | J | K |
|---|---|---|---|---|---|---|---|---|---|---|
| Job Title | Job Link | Skills Required | Client Country | Client Rating | Applicants | Contact Name | Contact Confidence | Apply Link | Personalised Cover Letter | Date Found |

- Partial data is fine — write whatever the source provides; leave unknown fields blank. `Date Found` = ISO timestamp.

## Keywords (one search per keyword)
`GoHighLevel`, `GHL developer`, `SaaS development`, `AI integration developer`, `loyalty program developer`, `Next.js developer`, `React Node.js SaaS`, `white label SaaS`. Keep them in config (array/env), not hardcoded across files.

## Deduplication
- Local store `server/data/seenJobs.json` (gitignored) of processed job IDs/URLs. Only process jobs not in the set; add after successful processing. Must survive restarts.

## Proposal generation (Claude, Zia brand voice)
- Model `claude-sonnet-4-6`, `max_tokens` ~1000, same auth headers as `aiService.js`.
- System/user prompt must encode Zia's brand voice and portfolio. Seed content:
  > Writing on behalf of **Zia Arsalan Abdullah**, senior full-stack developer & founder of **Devtronics** (devtronics.co), 10+ yrs experience. Key products: **Recrula** (AI recruitment), **LoyalIdeas** (Apple/Google Wallet loyalty SaaS), **Tourdec** (eBike fleet), **Meet Gabbi** (AI support agent), car-rental platforms in 3 countries, 3 published **GoHighLevel** marketplace apps. Target clients US/UK/UAE. Niches: AI products, SaaS, wallet/loyalty, CRM, GHL apps. Contact: zia@devtronics.co · calendly.com/ziaarsalan/let-s-connect.
- Letter rules: **under 200 words**, lead with the client's problem, direct and confident, reference relevant portfolio items when applicable. **Ban** generic filler ("I am hardworking", "I am a great fit", etc.). Inputs: job title, description, skills, client country.
- Keep the prompt in one place (e.g. `server/services/proposalService.js`) so Zia can refine the voice later (he plans to feed in full profile + sample proposals).

## Scheduling
- `node-cron` inside the runner, interval from `CRON_INTERVAL` (default `*/10 * * * *`). 5–10 min for GHL, 15–30 for other niches is the intent — interval is config, not hardcoded.
- Must support a one-shot **`--once` / dry-run** invocation that runs a single cycle and exits (used for verification and for an external crontab if Zia prefers OS-level scheduling).

## New env (add to server/.env.example with placeholders — never real values)
```
GOOGLE_JOBS_SHEET_ID=          # optional; defaults to GOOGLE_SHEET_ID
UPWORK_JOBS_TAB=Upwork
CRON_INTERVAL=*/10 * * * *
UPWORK_KEYWORDS=GoHighLevel,GHL developer,SaaS development,AI integration developer,loyalty program developer,Next.js developer,React Node.js SaaS,white label SaaS
UPWORK_SOURCE=fixtures          # fixtures | rss | google  (T-003 adds real sources)
```
(`ANTHROPIC_API_KEY`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` already exist.)

## Suggested module layout (inside server/)
```
server/
  services/
    upworkFetch.js       # pluggable: fixtures | rss | google → normalized job[]
    proposalService.js   # Claude sonnet-4-6, brand-voice prompt → cover letter
    upworkSheet.js       # append job row to the jobs tab (reuses JWT auth)
  jobs/
    upworkMonitor.js     # pipeline: fetch → dedupe → proposal → append
    fixtures/jobs.sample.json
  data/seenJobs.json     # gitignored dedupe store
  index.js               # wires node-cron + a --once CLI path
```

## Out of scope (document, don't build)
- Zapier zap + Pushover/Pushcut config (external).
- Logging into Upwork or auto-applying (never).
