const mongoose = require('mongoose')

const sendLogSchema = new mongoose.Schema(
  {
    timestamp: { type: Date, default: Date.now },
    level: String,
    category: {
      type: String,
      enum: ['smtp', 'queue', 'campaign', 'ai', 'rotation', 'retry', 'error'],
    },
    message: String,
    refs: {
      queueId: { type: mongoose.Schema.Types.ObjectId },
      mailboxId: { type: mongoose.Schema.Types.ObjectId },
      campaignId: { type: mongoose.Schema.Types.ObjectId },
    },
    meta: mongoose.Schema.Types.Mixed,
  },
  { timestamps: false },
)

module.exports = mongoose.model('SendLog', sendLogSchema)
