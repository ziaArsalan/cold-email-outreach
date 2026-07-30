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
  return `${dayPart} · ${timePart}`
}

// Compact local date-time for queue/mailbox tables; em dash when absent.
export const fmtDate = (d) => (d ? new Date(d).toLocaleString() : '—')

// Truncate long strings for table cells (full value shown via title attr).
export const trunc = (s, n = 40) =>
  s && s.length > n ? s.slice(0, n) + '…' : s || ''
