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
# cold-email-outreach
