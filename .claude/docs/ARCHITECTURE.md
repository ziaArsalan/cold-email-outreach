# Architecture

Reference for how the app is built. Agents should read **only the section** relevant to their task.

## Stack
- **Client:** React 18 (Create React App, `react-scripts`), `axios`. Single-page dashboard.
- **Server:** Node + Express. Integrations: Google Sheets (`googleapis`), SMTP (`nodemailer`), Claude AI (`@anthropic` via `axios`/`node-fetch`).
- **Dev runner:** `concurrently` (`npm run dev` from root).

## Layout
```
client/
  src/
    App.js        # entire UI (dashboard, tabs: campaign + leads, activity log)
    App.css       # styles
    index.js      # React entry
  package.json    # proxy → http://localhost:5000
server/
  index.js        # Express app bootstrap
  routes/
    api.js        # all HTTP endpoints
  services/
    sheetsService.js   # read/write Google Sheet (leads + status)
    aiService.js       # Claude — research site, generate email
    emailService.js    # SMTP send + connection test
  .env            # secrets (gitignored) — see .env.example
```

## Data flow (the core loop)
1. Client calls server endpoints in `routes/api.js`.
2. `sheetsService` reads leads (cols: Email, Name, Business, Website, Status, Reference); only rows with empty Status are pending.
3. For each pending lead, `aiService` researches the website and drafts a personalized email.
4. `emailService` sends via SMTP; `sheetsService` writes Status = `Emailed` / `Failed`.
5. Client shows a live activity log and the Leads table.

## Ports & URLs
- Client: http://localhost:3000
- Server: http://localhost:5000
- Client → server requests are proxied (no CORS issues in dev).

## Conventions
- Keep secrets in `server/.env`; mirror new keys into `server/.env.example` (with placeholder values).
- New endpoints go in `routes/api.js`; new third-party logic goes in a `services/*.js` module, not inline in routes.
- UI is currently one file (`App.js`) — keep additions cohesive; if it grows large, propose a split in the plan.
- Living conventions/gotchas accumulate in [../../MEMORY.md](../../MEMORY.md).
