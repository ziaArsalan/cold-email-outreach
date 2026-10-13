// Central tunables for the Outreach V2 (MongoDB + queue) stack.
// Read once from env with sane fallbacks. This is a DIFFERENT module from
// server/jobs/config.js (the Upwork monitor config) — do not merge them.

module.exports = {
  mongoUri:
    process.env.MONGODB_URI ||
    'mongodb://localhost:27017/devtronics-outreach',

  queueWorkerEnabled: process.env.QUEUE_WORKER_ENABLED === 'true',

  // Public origin used to build unsubscribe links in outgoing email. MUST be a
  // real, internet-reachable URL in production — a localhost link in a sent
  // email is a dead link, which hurts deliverability and blocks opt-outs.
  publicBaseUrl:
    process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 8080}`,

  sendMode: process.env.SEND_MODE || 'warmup',

  // IANA timezone that defines the "day" for daily send caps + counter resets
  // (mailbox sentToday, campaign daily limit). Default UTC preserves the old
  // server-clock behavior; set e.g. Asia/Karachi so the daily reset lands at
  // local midnight instead of 05:00. See services/dayBoundary.js.
  dailyResetTimezone: process.env.DAILY_RESET_TZ || 'UTC',

  delays: {
    warmup: {
      minMs: Number(process.env.DELAY_WARMUP_MIN_MS) || 240000,
      maxMs: Number(process.env.DELAY_WARMUP_MAX_MS) || 480000,
    },
    production: {
      minMs: Number(process.env.DELAY_PROD_MIN_MS) || 120000,
      maxMs: Number(process.env.DELAY_PROD_MAX_MS) || 300000,
    },
  },

  retry: {
    maxRetries: Number(process.env.QUEUE_MAX_RETRIES) || 3,
    backoffBaseMs: 60000,
  },

  // On worker startup, any item still 'sending' this long is treated as stranded
  // by a crashed/killed process (e.g. laptop shut mid-send) and reclaimed to
  // 'pending'. The margin avoids stealing an item another worker is mid-send on.
  staleSendingMs: Number(process.env.QUEUE_STALE_SENDING_MS) || 300000,

  // Milliseconds per follow-up "day" — the multiplier for a step's delayDays.
  // Real deploys leave this at 1 day; tests shrink it so follow-ups fire fast.
  followupDelayUnitMs: Number(process.env.FOLLOWUP_DELAY_UNIT_MS) || 86400000,

  // 60s (was 30s): normal connects to the SMTP host take ~2s, so a timeout only
  // fires on a real network spike/drop. The extra headroom lets a briefly-slow
  // connection succeed instead of being failed + retried. Override via env.
  smtpTimeoutMs: Number(process.env.SMTP_TIMEOUT_MS) || 60000,
  workerTickGuardMs: Number(process.env.WORKER_TICK_GUARD_MS) || 5000,
  workerIdleMs: Number(process.env.WORKER_IDLE_MS) || 30000,

  warmupWeeks: [
    { week: 1, min: 5, max: 10 },
    { week: 2, min: 10, max: 20 },
    { week: 3, min: 20, max: 30 },
    { week: 4, min: 40, max: 50 },
  ],

  defaults: {
    dailyLimit: 50,
    hourlyLimit: 10,
  },

  // Free pre-send email screening (format/MX/disposable/role-based) — runs at
  // campaign start, before AI generation or enqueue. See emailVerificationService.js.
  emailVerification: {
    checkMX: process.env.EMAIL_VERIFY_CHECK_MX !== 'false',
    blockDisposable: process.env.EMAIL_VERIFY_BLOCK_DISPOSABLE !== 'false',
    blockRoleBased: process.env.EMAIL_VERIFY_BLOCK_ROLE_BASED !== 'false',
  },

  // ── Follow-ups module (member task tracking + WhatsApp reminders) ──
  // Member recurring-task tracking. This is UNRELATED to campaign follow-up
  // sequences (Campaign.steps / followupDelayUnitMs above) despite the name.
  // Admin-togglable runtime bits (kill switch, throttle, schedule, active
  // provider) live in the FollowupSetting singleton; these are the static
  // env-backed defaults it falls through to. See services/followupSettingsService.js.
  followups: {
    // IANA timezone that defines weekly (Mon 00:00) and monthly (1st 00:00)
    // cycle boundaries and the period-key calculation. See periodService.js.
    timezone: process.env.FOLLOWUPS_TZ || 'Asia/Karachi',

    // Phone normalization default country calling code (digits, no +). Bare
    // local numbers (e.g. 03001234567) are promoted to E.164 using this.
    defaultCountryCode: process.env.FOLLOWUPS_DEFAULT_CC || '92', // Pakistan

    // Active reminder channel: 'wa_link' (zero-setup click-to-send queue) or
    // 'whatsapp_cloud' (Meta WhatsApp Business Cloud API). Overridable in the
    // FollowupSetting singleton.
    provider: process.env.REMINDER_PROVIDER || 'wa_link',

    // Don't re-remind the same member within this many hours unless forced.
    throttleHours: Number(process.env.FOLLOWUP_THROTTLE_HOURS) || 24,

    // Kill switch for the scheduled auto-reminder job (manual "Remind" actions
    // in the UI are never gated by this — only the cron is).
    autoRemindersEnabled: process.env.FOLLOWUP_AUTO_REMINDERS === 'true',

    // Scheduled auto-reminder run (local time, in `timezone`). Primary nudge,
    // plus an optional second nudge. Blank disables that nudge.
    schedule: {
      primary: process.env.FOLLOWUP_SCHEDULE_PRIMARY || 'mon 10:00',
      secondary: process.env.FOLLOWUP_SCHEDULE_SECONDARY || '', // e.g. 'thu 10:00'
    },

    // WhatsApp Business Cloud API — secrets/infra, env-ONLY (never in the
    // FollowupSetting singleton or any API response).
    whatsappCloud: {
      token: process.env.WHATSAPP_TOKEN || '',
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
      templateName: process.env.WHATSAPP_TEMPLATE_NAME || '',
      templateLang: process.env.WHATSAPP_TEMPLATE_LANG || 'en',
      graphVersion: process.env.WHATSAPP_GRAPH_VERSION || 'v21.0',
      // Inbound webhook (optional, behind this flag).
      webhookEnabled: process.env.WHATSAPP_WEBHOOK_ENABLED === 'true',
      verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
      appSecret: process.env.WHATSAPP_APP_SECRET || '',
    },
  },
}
