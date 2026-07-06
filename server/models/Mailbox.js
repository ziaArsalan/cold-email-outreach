const mongoose = require('mongoose')
const config = require('../config')

const mailboxSchema = new mongoose.Schema(
  {
    name: String,
    email: String,
    provider: {
      type: String,
      enum: ['smtp', 'gmail', 'm365', 'mailgun', 'ses', 'resend'],
      default: 'smtp',
    },
    host: String,
    port: Number,
    secure: Boolean,
    username: String,
    password: { type: String, select: false },
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
