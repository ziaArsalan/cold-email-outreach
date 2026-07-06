# Project Memory

Durable, machine-independent knowledge for this project. Committed to the repo so it travels across machines. Read this before planning any task; append to it whenever a decision is made or a non-obvious lesson is learned.

> This is **project** memory (shared, in-repo). It is separate from Claude's private per-user memory.

## How to use
- **Before planning:** skim Decisions + Gotchas below.
- **After finishing a task:** if you learned something that would change how a future task is built (a convention, a trap, a "we decided X over Y"), add a bullet here in the same commit.
- Keep entries short and factual. Date them.

---

## Decisions
- **2026-06-06** — Automated workflow uses the `/task` command + three subagents (planner, developer, qa-tester). See [.claude/docs/WORKFLOW.md](.claude/docs/WORKFLOW.md).
- **2026-06-06** — QA is done with a **real browser** via the Playwright MCP server (`.mcp.json`), not just unit tests.
- **2026-06-06** — Tasks live in a single [tasks.md](tasks.md), prioritized P0 (highest) → P3.
- **2026-06-06** — Ship strategy: **direct commit to `main`** then `git push`. No PR per task (yet).
- **2026-06-06** — Approval gates are **ON**: human approves the plan, and approves bug-fixes before they're applied.
- **2026-06-06** — Upwork job monitor (T-002/T-003) lives **inside `server/`** and **reuses** existing infra: JWT Sheets auth (`sheetsService.js` pattern, not a `credentials.json` keyFile) and the Claude call style in `aiService.js`. Standard Claude model for new work: **`claude-sonnet-4-6`**. Real Upwork jobs sourced via **Apify actor `neatrat/upwork-job-scraper`** (`UPWORK_SOURCE=apify`). Full spec: [.claude/docs/UPWORK-MONITOR.md](.claude/docs/UPWORK-MONITOR.md).
- **2026-06-06** — Apify actor `neatrat/upwork-job-scraper` real output field names (differ from docs): `tags`→skills, `clientLocation`→country, `proposals`→applicants, `clientName`/`clientNameConfidence`→contact, `url`→both url+applyLink (no separate apply-link field). `perPage` minimum is 10 (actor rejects lower). Free tier: 100 results / 10 runs total.
- **2026-07-06** — **Outreach V2**: MongoDB is the system of record for the cold-email side (**Atlas** is the production target; localhost works for dev — code falls back to `mongodb://localhost:27017/devtronics-outreach` when `MONGODB_URI` unset). Google Sheets demoted to a lead-import source, no write-back. Spec: [.claude/docs/OUTREACH-V2.md](.claude/docs/OUTREACH-V2.md); tasks T-007→T-013 in order. `server/config/index.js` = V2 tunables; do not confuse with the Upwork `server/jobs/config.js`.
- **2026-07-06** — **Email subject source (T-008)**: the rendered **template subject** drives previews/sends; the AI-generated subject is stored on the Lead (`aiSubject`, only when empty) but unused. Any non-empty `lead.aiIntro` counts as cache — including the 43 legacy full-email bodies imported by T-007 — so preview never regenerates or re-bills.

## Approval automation (grows over time)
When a class of decision has been approved enough times that it's safe to auto-approve, record the rule here and the workflow will stop asking for it.
- _(none yet — all gates currently ask the human)_

## Conventions
- Frontend is a single `client/src/App.js` (Create React App). Styles in `App.css`.
- Backend routes in `server/routes/api.js`; integrations in `server/services/*`.
- _(add naming / structure conventions as they emerge)_

## Conventions
- Upwork settings persisted in `server/data/upworkConfig.json` (gitignored) via `upworkConfigStore.js`. Config fallback order: env var → stored JSON → hardcoded default.
- Cron schedule is registered once at boot — **interval** changes still require a server restart. All other runtime settings (cronEnabled, autoCover, keywords, scheduleEnabled/Start/End, dailyLimit) are read live from `upworkConfigStore.readConfig()` at the start of each `runCycle` — changes take effect on the next tick without restart.
- The React client API base is hardcoded to `http://localhost:8080/api` (not the proxy). The proxy in `client/package.json` is stale (`localhost:5000`) — do not rely on it.

## Gotchas
- Client proxies API calls to `http://localhost:5000` (see `client/package.json` `proxy`). The server must be running for the UI to work.
- Server needs `server/.env` populated (see `server/.env.example`) or Sheets/SMTP/AI calls fail.
- **Port mismatch (pre-existing):** `server/.env.example` sets `PORT=8082`, but README/CLAUDE.md and the client proxy (`client/package.json`) expect the server on `5000`. If the UI can't reach the API, this is why. Confirm the real `server/.env` PORT matches the client proxy before QA.
- **Google Sheets tab name is literal:** `UPWORK_JOBS_TAB` (or the default `Upwork`) must match the exact tab name in the spreadsheet. `Unable to parse range` = tab doesn't exist — create it first or set the env var to the real tab name (e.g. `Sheet1`).
- **New Google Sheets must be explicitly shared** with the service account (`GOOGLE_SERVICE_ACCOUNT_EMAIL`) as Editor, even if another sheet in the same Drive is already shared. Permissions are per-file, not per-account.
- **Local `mongosh` is broken** on this machine (Homebrew icu4c version mismatch — dylib load error). `mongod` itself runs fine via `brew services`. Inspect the DB with a Node one-liner using `server/models` + mongoose instead of mongosh.
- _(add traps as you hit them)_
