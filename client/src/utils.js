// Pure, presentation-layer helpers and constants shared across the app.

export const EMAIL_SIGNATURE = ``

export const statusColor = (s) => {
  if (!s) return 'status-pending'
  if (s === 'Emailed') return 'status-emailed'
  if (s === 'Failed') return 'status-failed'
  return 'status-pending'
}

// Default value pre-filled into a new campaign's "AI Prompt" field. These are
// extra instructions appended to the server-side intro prompt (aiService).
export const DEFAULT_AI_PROMPT = `You are an experienced B2B Sales Development Representative (SDR).

Your task is to write only the opening of a cold email after spending about 60 seconds researching a company.

## Objective

Write an opening that feels like it was written by a real person, not AI.

## Rules

* Write only 1–2 short sentences.
* Maximum 35 words.
* Mention one specific observation about the company, website, Google Business Profile, LinkedIn, menu, services, products, or recent activity.
* Sound casual, direct, and conversational.
* Write at a Grade 6–8 reading level.
* Vary sentence structure so every opening feels different.
* Avoid sounding polished or overly professional.

## Never use

* Em dashes (—)
* Double dashes (--)
* Semicolons (;)
* Colons (:)
* Bullet points
* Quotes
* Exclamation marks
* Parentheses unless absolutely necessary

## Never start with

* I noticed...
* I came across...
* I found...
* I was looking at...
* I saw...
* It's impressive...
* Congratulations on...
* Hope you're doing well...
* I hope this email finds you well...

## Avoid these words

impressive

amazing

exciting

innovative

remarkable

incredible

fantastic

leading

world-class

best-in-class

great

awesome

## Don't

* Compliment the company just to be polite.
* Pitch your service.
* Mention Devtronics.
* Mention LoyalIdeas.
* Mention AI.
* Mention that you researched them.

## Good examples

Your seasonal menu changes caught my attention. It looks like you regularly give returning customers something new to try.

Your restaurant has several locations across Riyadh. Keeping customers coming back consistently becomes even more important as you grow.

The online ordering experience is straightforward, and your seafood platters seem to be one of the main attractions.

Your Google reviews mention the family atmosphere quite a bit. That's something many restaurants struggle to build consistently.

## Output

Return only the personalized opening paragraph.

No greeting.

No signature.

No explanation.

No markdown.`

// Default state for the "New Campaign" form.
export const BLANK_CAMPAIGN = {
  name: '',
  templateId: '',
  listId: '',
  steps: [],
  aiPrompt: DEFAULT_AI_PROMPT,
  mailboxIds: [],
  dailyLimit: 20,
  warmupEnabled: true,
  days: ['mon', 'tue', 'wed', 'thu', 'fri'],
  startTime: '09:00',
  endTime: '17:00',
  // Send-window timezone. Defaults to the browser's zone so the schedule the
  // user picks means THEIR local time, not the server's (which is UTC in prod).
  timezone:
    (typeof Intl !== 'undefined' &&
      Intl.DateTimeFormat().resolvedOptions().timeZone) ||
    'UTC',
}

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

// Sample values used to render the live template preview.
export const SAMPLE_VARS = {
  first_name: 'Jane',
  last_name: 'Doe',
  company: 'Acme Co',
  industry: 'SaaS',
  website: 'acme.co',
  ai_intro: 'I noticed Acme just shipped a new dashboard, clean work.',
}

// Replace {{var}} tokens with the provided values (blank for unknown keys).
export const substitute = (text, vars) =>
  String(text ?? '').replace(/{{\s*(\w+)\s*}}/g, (_, k) => vars[k] ?? '')

// Summarize a campaign's schedule for the list row.
export const scheduleSummary = (schedule) => {
  if (!schedule) return 'Any time'
  const days = Array.isArray(schedule.days) ? schedule.days : []
  const dayPart = days.length ? days.join(', ') : 'every day'
  const timePart =
    schedule.startTime && schedule.endTime
      ? `${schedule.startTime}–${schedule.endTime}`
      : 'any time'
  const tzPart = schedule.timezone ? ` ${schedule.timezone}` : ''
  return `${dayPart} · ${timePart}${tzPart}`
}

// Compact local date-time for queue/mailbox tables; em dash when absent.
export const fmtDate = (d) => (d ? new Date(d).toLocaleString() : '—')

// ── Bid Analytics (Upwork proposal tracking) ──

export const PROPOSAL_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'VIEWED',
  'CLIENT_REPLIED',
  'INTERVIEW',
  'OFFER',
  'HIRED',
  'DECLINED',
  'CLIENT_HIRED_OTHER',
  'NO_RESPONSE',
  'WITHDRAWN',
  'ARCHIVED',
]

// Human labels for the status enum (used in dropdowns / badges).
export const PROPOSAL_STATUS_LABELS = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  VIEWED: 'Viewed',
  CLIENT_REPLIED: 'Client replied',
  INTERVIEW: 'Interview',
  OFFER: 'Offer',
  HIRED: 'Hired',
  DECLINED: 'Declined',
  CLIENT_HIRED_OTHER: 'Client hired other',
  NO_RESPONSE: 'No response',
  WITHDRAWN: 'Withdrawn',
  ARCHIVED: 'Archived',
}

// Format any date value for an <input type="date"> (YYYY-MM-DD), or '' if absent.
export const toDateInput = (d) => {
  if (!d) return ''
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return ''
  return dt.toISOString().slice(0, 10)
}

// Compact local date (no time) for proposal tables; em dash when absent.
export const fmtDay = (d) => (d ? new Date(d).toLocaleDateString() : '—')

// Format a 0..1 rate as a percentage, or 'N/A' when null/undefined (the server
// returns null for any metric whose denominator was zero).
export const pct = (v) =>
  v === null || v === undefined || isNaN(v) ? 'N/A' : `${(v * 100).toFixed(1)}%`

// Format a numeric metric, or 'N/A' when null (zero-denominator). Rounds to at
// most `dp` decimals.
export const numOrNA = (v, dp = 2) =>
  v === null || v === undefined || isNaN(v)
    ? 'N/A'
    : Number(v).toLocaleString(undefined, { maximumFractionDigits: dp })

// Format a money amount with a currency code, or 'N/A' when null.
export const money = (v, ccy = 'USD') =>
  v === null || v === undefined || isNaN(v)
    ? 'N/A'
    : `${ccy} ${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`

// Date-range presets for the dashboard filter → { from, to } as YYYY-MM-DD.
export const DATE_PRESETS = [
  'This month',
  'Last 30 days',
  'Last 90 days',
  'This year',
  'All time',
  'Custom',
]
export const presetRange = (preset) => {
  const today = new Date()
  const iso = (d) => d.toISOString().slice(0, 10)
  const start = new Date(today)
  switch (preset) {
    case 'This month':
      return { from: iso(new Date(today.getFullYear(), today.getMonth(), 1)), to: iso(today) }
    case 'Last 30 days':
      start.setDate(start.getDate() - 30)
      return { from: iso(start), to: iso(today) }
    case 'Last 90 days':
      start.setDate(start.getDate() - 90)
      return { from: iso(start), to: iso(today) }
    case 'This year':
      return { from: iso(new Date(today.getFullYear(), 0, 1)), to: iso(today) }
    case 'All time':
    default:
      return { from: '', to: '' }
  }
}

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// Default state for the Add Proposal form. Numbers are strings here (controlled
// inputs); the save handler coerces them. requiredSkills is a comma string.
export const BLANK_PROPOSAL = {
  submittedAt: new Date().toISOString().slice(0, 10),
  jobPostedAt: '',
  jobUrl: '',
  jobTitle: '',
  jobCategory: '',
  serviceLane: '',
  jobType: '',
  budgetType: 'UNKNOWN',
  jobBudgetMin: '',
  jobBudgetMax: '',
  hourlyRateBid: '',
  fixedPriceBid: '',
  requiredSkills: '',
  proposalType: 'ORGANIC',
  connectsUsed: '',
  boostConnects: '',
  profileTitleUsed: '',
  proposalTemplate: '',
  portfolioItemShared: '',
  proposalOpening: '',
  proposalStatus: 'SUBMITTED',
  clientName: '',
  clientCountry: '',
  clientTotalSpent: '',
  clientHireRate: '',
  clientHasVerifiedPayment: false,
  contractValue: '',
  contractCurrency: 'USD',
  contractType: '',
  followUpDate: '',
  notes: '',
}

// Truncate long strings for table cells (full value shown via title attr).
export const trunc = (s, n = 40) =>
  s && s.length > n ? s.slice(0, n) + '…' : s || ''
