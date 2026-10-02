# Bid Analytics module

Internal Upwork **proposal funnel analytics**. One sidebar entry (**Bid Analytics**,
`/bid-analytics`) hosting all sub-views via internal tabs. Entirely separate from
the existing **Upwork** tab (the Apify job monitor + AI cover letters).

## Compliance (by design)
- **Manual / CSV / official-API data entry only.** No scraping, no automation of
  Upwork login, browsing, bidding, boosting or messaging, no browser extension.
- **No Upwork credentials, cookies or session tokens are ever stored.**
- Owner-only: every route sits behind the existing JWT `requireAuth`.
- CSV exports escape cells starting with `= + - @` (formula-injection safe).
- Deletes/imports/exports are recorded in a `BidAuditLog`.
- All data is labelled internal analytics; imports never pull from Upwork.

## Stack fit
Built on the project's actual stack (not the Postgres/Prisma/TS the original brief
assumed): **Mongoose models + Express routes + React (CRA, JS) + Recharts**. Single
-owner auth, so there is no `userId` multi-tenancy — records are the owner's and
protected by authentication.

## Data model (`server/models/`)
| Model | Purpose |
|-------|---------|
| `Proposal` | one proposal + its funnel (status enum, stage timestamps, connects, client, outcome). `serviceLane` is a **string snapshot** so renaming/deleting a lane never rewrites history. |
| `ServiceLane` | the bidding lanes; 8 defaults seeded on first `GET /lanes`. |
| `ConnectsTransaction` | Connects ledger (PURCHASE/MONTHLY_ALLOCATION/REFUND/BONUS/SPENT/ADJUSTMENT). |
| `Budget` | one monthly budget per `(year, month)` + targets. |
| `BidTemplate` | reusable proposal templates (named to avoid the email `Template` model). |
| `ProfileVariant` | profile title/description versions. |
| `BidAuditLog` | append-only audit trail (delete/archive/import/export). |

## API (all under `/api/bidding`, behind `requireAuth`)
- Lanes: `GET/POST /lanes`, `PUT/DELETE /lanes/:id`
- Proposals: `GET /proposals` (q/status/lane/type/sort/dir/page), `POST /proposals`,
  `GET/PUT/DELETE /proposals/:id`, `POST /proposals/:id/status`
- Analytics: `GET /analytics?from&to`, `GET /recommendations`
- Connects: `GET/POST /connects`, `PUT/DELETE /connects/:id`
- Budgets: `GET/POST /budgets`, `PUT/DELETE /budgets/:id`,
  `GET /budgets/:id/report`, `POST /budgets/:id/copy-next`
- Templates / variants: `GET/POST/PUT/DELETE /bid-templates`, `/profile-variants`
- CSV: `GET /proposals/export.csv`, `GET /proposals/import-template.csv`,
  `POST /proposals/import`

The analytics math lives in pure functions in
`server/services/biddingService.js` (`metricsFor`, `computeAnalytics`,
`computeRecommendations`, `connectsBalance`, `budgetReport`). Every rate/cost
returns `null` on a zero denominator; the UI renders that as **N/A**.

### Funnel definitions
A proposal has "reached" a stage if its stage timestamp is set **or** its status
has progressed to/past that stage. `submitted` excludes `DRAFT`. Rates use
`submitted` as the denominator; revenue sums `contractValue` of hired proposals.

## UI (`client/src/pages/bidding/`)
`BidAnalyticsPage` (shell) → sub-views: `DashboardView` (KPIs + charts +
recommendations + boosted/organic + lane tables), `ProposalsView`, `ConnectsView`,
`BudgetsView`, `ReportsView` (breakdowns + time-to-apply + CSV), `SettingsView`
(lanes + templates + variants). `ProposalForm` and `ProposalDetail` are separate
routes. Charts use Recharts via `charts.js`; `Kpi.js` holds the KPI card +
breakdown table. Context state/handlers live in `AppContext` (keys prefixed
`proposal*`, `bid*`, `connects`, `budgets`, `analyticsRange`, etc.).

## Tests
`cd server && npm run test:bidding` — unit (analytics math, zero-guards,
recommendations, connects balance, budget warnings) + integration (auth, lane
dedupe, proposal CRUD, validation, analytics, CSV injection-safe export, connects,
budget report). Uses a throwaway local DB (`bidding_test`) and **refuses a
non-local `MONGODB_URI`**.

## Backup recommendation
This module's data lives only in MongoDB. Back it up regularly:
```bash
mongodump --uri "$MONGODB_URI" --out backup/$(date +%F)
# restore:  mongorestore --uri "$MONGODB_URI" backup/<date>
```
(Atlas also offers automated snapshots — enable them for the production cluster.)
