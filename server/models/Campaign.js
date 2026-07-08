const mongoose = require('mongoose')

// A follow-up step: its own template + how long after the previous send to fire.
const stepSchema = new mongoose.Schema(
  {
    order: Number,
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Template' },
    delayDays: Number,
  },
  { _id: false },
)

const campaignSchema = new mongoose.Schema(
  {
    name: String,
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Template' },
    steps: { type: [stepSchema], default: [] },
    aiPrompt: String,
    mailboxIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Mailbox' }],
    dailyLimit: Number,
    listId: { type: mongoose.Schema.Types.ObjectId, ref: 'List', default: null },
    status: {
      type: String,
      enum: ['draft', 'running', 'paused', 'completed', 'stopped'],
      default: 'draft',
    },
    warmupEnabled: { type: Boolean, default: true },
    htmlEnabled: { type: Boolean, default: false },
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
