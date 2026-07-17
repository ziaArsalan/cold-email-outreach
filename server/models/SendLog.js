const mongoose = require('mongoose')

const sendLogSchema = new mongoose.Schema(
  {
    timestamp: { type: Date, default: Date.now },
    level: String,
    category: {
      type: String,
      enum: ['smtp', 'queue', 'campaign', 'ai', 'rotation', 'retry', 'error'],
    },
    // True for template test sends (not part of a real campaign) — surfaced as a
    // "TEST" label in the Logs view and the per-template test history.
    test: { type: Boolean, default: false },
    message: String,
    refs: {
      queueId: { type: mongoose.Schema.Types.ObjectId },
      mailboxId: { type: mongoose.Schema.Types.ObjectId },
      campaignId: { type: mongoose.Schema.Types.ObjectId },
      templateId: { type: mongoose.Schema.Types.ObjectId },
      leadId: { type: mongoose.Schema.Types.ObjectId },
    },
    meta: mongoose.Schema.Types.Mixed,
  },
  { timestamps: false },
)

module.exports = mongoose.model('SendLog', sendLogSchema)
