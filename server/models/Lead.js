const mongoose = require('mongoose')

const leadSchema = new mongoose.Schema(
  {
    firstName: String,
    lastName: String,
    company: String,
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    website: String,
    industry: String,
    country: String,
    status: {
      type: String,
      enum: [
        'new',
        'queued',
        'contacted',
        'replied',
        'bounced',
        'unsubscribed',
        'failed',
      ],
      default: 'new',
    },
    aiIntro: String,
    aiSubject: String,
    lastContactDate: Date,
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },
    replyStatus: String,
    bounceStatus: String,
    source: {
      type: String,
      enum: ['sheets', 'csv', 'apollo', 'manual'],
      default: 'manual',
    },
  },
  { timestamps: true },
)

leadSchema.index({ email: 1 }, { unique: true })

module.exports = mongoose.model('Lead', leadSchema)
