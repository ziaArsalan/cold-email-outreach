const mongoose = require('mongoose')
const config = require('../config')

const mailboxSchema = new mongoose.Schema(
  {
    name: String,
    email: String,
    // Per-mailbox email signature. When set, it's appended to sends FROM this
    // mailbox instead of the template's signature (see campaignService.renderStep),
    // so each sender can have its own sign-off. Falls back to the template's when blank.
    signature: String,
    provider: {
      type: String,
      enum: ['smtp', 'brevo', 'gmail', 'm365', 'mailgun', 'ses', 'resend'],
      default: 'smtp',
    },
    host: String,
    port: Number,
    secure: Boolean,
    username: String,
    password: { type: String, select: false },
    // For HTTP-API providers (e.g. Brevo). Falls back to an env key when unset.
    apiKey: { type: String, select: false },
    dailyLimit: { type: Number, default: config.defaults.dailyLimit },
    hourlyLimit: { type: Number, default: config.defaults.hourlyLimit },
    sentToday: { type: Number, default: 0 },
    sentThisHour: { type: Number, default: 0 },
    dayResetAt: Date,
    hourResetAt: Date,
    warmupEnabled: { type: Boolean, default: true },
    warmupStartDate: Date,
    healthStatus: {
      type: String,
      enum: ['healthy', 'paused', 'error'],
      default: 'healthy',
    },
    pausedUntil: Date,
    lastError: String,
    lastUsedAt: Date,
    active: { type: Boolean, default: true },

    // ── Reply detection (IMAP) ───────────────────────────────────────────────
    // Read-only inbox polling so a lead's reply auto-marks them 'replied' (which
    // stops their follow-ups). Separate from the send path (SMTP/Brevo) because
    // replies always land in the real mailbox, and Brevo mailboxes have no SMTP
    // creds. Falls back to sensible privateemail defaults when host/port blank.
    imapEnabled: { type: Boolean, default: false },
    imapHost: String,
    imapPort: Number,
    imapUser: String,
    imapPassword: { type: String, select: false },
    imapLastUid: { type: Number, default: 0 }, // highest INBOX UID processed
    imapLastError: String,
    imapLastCheckedAt: Date,
  },
  { timestamps: true },
)

module.exports = mongoose.model('Mailbox', mailboxSchema)
