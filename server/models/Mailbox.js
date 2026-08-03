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
  },
  { timestamps: true },
)

module.exports = mongoose.model('Mailbox', mailboxSchema)
