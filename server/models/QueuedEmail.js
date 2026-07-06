const mongoose = require('mongoose')
const config = require('../config')

const queuedEmailSchema = new mongoose.Schema(
  {
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
    mailboxId: { type: mongoose.Schema.Types.ObjectId, ref: 'Mailbox' },
    subject: String,
    body: String,
    status: {
      type: String,
      enum: ['pending', 'scheduled', 'sending', 'sent', 'failed', 'bounced'],
      default: 'pending',
    },
    scheduledAt: Date,
    sentAt: Date,
    retries: { type: Number, default: 0 },
    maxRetries: { type: Number, default: config.retry.maxRetries },
    smtpResponse: String,
    errorMessage: String,
  },
  { timestamps: true },
)

queuedEmailSchema.index({ status: 1, scheduledAt: 1 })
queuedEmailSchema.index({ mailboxId: 1, status: 1 })
queuedEmailSchema.index({ campaignId: 1 })

module.exports = mongoose.model('QueuedEmail', queuedEmailSchema)
