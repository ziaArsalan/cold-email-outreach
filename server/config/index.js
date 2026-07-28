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

  smtpTimeoutMs: Number(process.env.SMTP_TIMEOUT_MS) || 30000,
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
}
