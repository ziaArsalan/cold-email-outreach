// Central tunables for the Outreach V2 (MongoDB + queue) stack.
// Read once from env with sane fallbacks. This is a DIFFERENT module from
// server/jobs/config.js (the Upwork monitor config) — do not merge them.

module.exports = {
  mongoUri:
    process.env.MONGODB_URI ||
    'mongodb://localhost:27017/devtronics-outreach',

  queueWorkerEnabled: process.env.QUEUE_WORKER_ENABLED === 'true',

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
}
