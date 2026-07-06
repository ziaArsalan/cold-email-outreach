const mongoose = require('mongoose')

const campaignSchema = new mongoose.Schema(
  {
    name: String,
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Template' },
    aiPrompt: String,
    mailboxIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Mailbox' }],
    dailyLimit: Number,
    status: {
      type: String,
      enum: ['draft', 'running', 'paused', 'completed', 'stopped'],
      default: 'draft',
    },
    warmupEnabled: { type: Boolean, default: true },
    schedule: {
      days: [String],
      startTime: String,
      endTime: String,
      timezone: String,
    },
    stats: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true },
)

module.exports = mongoose.model('Campaign', campaignSchema)
