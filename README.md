# Devtronics Outreach Automation

A MERN app to automate personalized cold email outreach using Claude AI, Google Sheets, and SMTP.

## How It Works

1. Reads leads from Google Sheets (Email, Name, Business, Website, Status, Reference)
2. For each pending lead, Claude AI visits their website and writes a personalized email
3. Sends the email via SMTP from zia@devtronics.co
4. Updates the Status column to "Emailed" in the sheet

---

## Setup

### 1. Clone and Install

```bash
npm run install-all
```

### 2. Google Cloud Setup

1. Go to https://console.cloud.google.com
2. Create a new project (or use existing)
3. Enable the **Google Sheets API**
4. Go to **IAM & Admin > Service Accounts**
5. Create a service account, download the JSON key
6. Copy `client_email` and `private_key` from the JSON

### 3. Share Your Google Sheet

- Open your Google Sheet
- Click **Share**
- Add your service account email with **Editor** access

### 4. Configure Environment

```bash
cd server
cp .env.example .env
# Fill in all values in .env
```

Required variables:
```
GOOGLE_SHEET_ID         → From your sheet URL: .../spreadsheets/d/THIS_PART/edit
GOOGLE_SERVICE_ACCOUNT_EMAIL
GOOGLE_PRIVATE_KEY

ANTHROPIC_API_KEY       → From console.anthropic.com

SMTP_HOST               → mail.devtronics.co
SMTP_PORT               → 465
SMTP_SECURE             → true
SMTP_USER               → zia@devtronics.co
SMTP_PASS               → your password
```

### 5. Google Sheet Columns

Make sure your sheet has this exact column order in Row 1:

| A     | B    | C        | D       | E      | F         |
|-------|------|----------|---------|--------|-----------|
| Email | Name | Business | Website | Status | Reference |

### 6. Run the App

```bash
# From root directory
npm run dev
```

- Frontend: http://localhost:3000
- Backend: http://localhost:5000

---

## Usage

1. Open the dashboard at http://localhost:3000
2. Click **Test SMTP** to verify your email connection
3. Set your **Batch Size** (how many emails per run)
4. Set **Delay** between emails (3000ms recommended to avoid spam filters)
5. Click **Start Campaign**
6. Watch the live activity log
7. Check the **Leads** tab to see status updates

### Preview Before Sending
- Go to **Leads** tab
- Click **Preview** next to any pending lead
- AI will research the website and show you the generated email before it sends

---

## Notes

- Only rows with empty Status column are processed
- Failed sends are marked as "Failed" in the sheet
- Recommended: 3-5 second delay between emails
- For 1000 emails at 3s delay = ~50 mins per full run
- Run in batches of 50-100 for safety

## Follow-ups module (member task tracking + WhatsApp reminders)

A separate module (sidebar → **Follow-ups**) for tracking recurring member tasks
and reminding only the people who still have something pending. It is unrelated
to campaign follow-up email *sequences* despite the shared word.

- **Members** — the roster, with pending-task tags per member. Click a tag to
  mark it done (click again to undo); Shift+click to skip. Add/edit/deactivate,
  bulk actions, and CSV import (`name, phone, registration_id`) with a
  duplicate-phone report.
- **Tasks** — one-time / weekly / monthly tasks, assigned to **all** members or a
  **selected** list. Per-task view with a period switcher.
- **Reminders** — preview and send one message per pending member (never one per
  task, never to anyone with nothing pending), the send queue, the log, and the
  module settings.

**Cycles** roll over at local **Monday 00:00** (weekly) and the **1st 00:00**
(monthly) in `FOLLOWUPS_TZ` (default `Asia/Karachi`). Assignment rows are created
lazily when a period is first accessed — marking done only affects the current
period; the next period starts fresh as pending and old periods stay as history.

### Environment variables

All optional — they are *fallback defaults*. The provider, throttle, kill switch
and schedule are also editable live in the **Reminders → Settings** screen
(stored in Mongo); a stored value wins over the env var. Timezone, country code,
and all WhatsApp secrets are env-only.

| Var | Default | Purpose |
|-----|---------|---------|
| `FOLLOWUPS_TZ` | `Asia/Karachi` | Timezone for weekly/monthly cycle boundaries |
| `FOLLOWUPS_DEFAULT_CC` | `92` | Country calling code for normalizing bare local phone numbers to E.164 |
| `REMINDER_PROVIDER` | `wa_link` | Active channel: `wa_link` or `whatsapp_cloud` |
| `FOLLOWUP_THROTTLE_HOURS` | `24` | Don't re-remind the same member within N hours |
| `FOLLOWUP_AUTO_REMINDERS` | `false` | Master kill switch for the *scheduled* job (manual sends always work) |
| `FOLLOWUP_SCHEDULE_PRIMARY` | `mon 10:00` | Scheduled nudge, `day HH:MM` local time; blank disables |
| `FOLLOWUP_SCHEDULE_SECONDARY` | *(blank)* | Optional second nudge, e.g. `thu 10:00` |
| `WHATSAPP_TOKEN` | — | WhatsApp Cloud permanent access token (secret) |
| `WHATSAPP_PHONE_NUMBER_ID` | — | Cloud API phone-number id |
| `WHATSAPP_TEMPLATE_NAME` | — | Approved template name used for reminders |
| `WHATSAPP_TEMPLATE_LANG` | `en` | Template language code |
| `WHATSAPP_GRAPH_VERSION` | `v21.0` | Graph API version |
| `WHATSAPP_WEBHOOK_ENABLED` | `false` | Enable the inbound "DONE" webhook |
| `WHATSAPP_VERIFY_TOKEN` | — | Webhook verification token (also entered in Meta) |
| `WHATSAPP_APP_SECRET` | — | Meta app secret, used to verify `X-Hub-Signature-256` |

### Switching the reminder provider

Set it in **Reminders → Settings** (recommended, live) or via `REMINDER_PROVIDER`:

- **`wa_link` (default, zero setup):** builds `https://wa.me/<phone>?text=…` links.
  Sending is manual — the Reminders screen shows a *send queue*; click each link
  (WhatsApp opens prefilled), then **Mark sent** to log it. The scheduled job only
  *builds* the queue; it can't auto-deliver.
- **`whatsapp_cloud`:** delivers automatically through the WhatsApp Business Cloud
  API. Requires the `WHATSAPP_*` secrets and an approved template (below).

The provider boundary is generic (`ReminderChannel.send(member, message)`), so SMS
/ email / GoHighLevel channels can be added later without touching the business
logic.

### Approving the WhatsApp template (for `whatsapp_cloud`)

Business-initiated messages outside the 24-hour customer-service window must use a
template **approved by Meta**, so reminders are always sent as a template:

1. In **Meta Business Manager → WhatsApp Manager → Message templates**, create a
   template (category *Utility*). Give its body two variables, e.g.:
   > Hi {{1}}, quick reminder. Still pending: {{2}}. Reply DONE once completed.
   The app fills `{{1}}` = member name and `{{2}}` = the pending-task list.
2. Submit it and wait for **Approved** status.
3. Put the template name in `WHATSAPP_TEMPLATE_NAME` (and language in
   `WHATSAPP_TEMPLATE_LANG`), and set `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID`.

**Inbound "DONE" webhook (optional):** set `WHATSAPP_WEBHOOK_ENABLED=true`,
`WHATSAPP_VERIFY_TOKEN`, and `WHATSAPP_APP_SECRET`. In the Meta app's webhook
config, point the callback URL at `https://<your-host>/api/followups/webhooks/whatsapp`
and use the same verify token. A member replying **DONE** clears all their pending
tasks for the current period; **DONE 2** or **DONE <task name>** clears just one.

### Quick start / testing

```bash
cd server
npm run seed:followups     # 5 demo members + 2 tasks (local DB only; --force for remote)
npm run test:followups     # unit + integration suite (throwaway local DB)
```
# cold-email-outreach
