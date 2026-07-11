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
    // Per-lead full body override — when set, the initial (step 0) email uses
    // these verbatim instead of rendering the template + ai_intro.
    subjectOverride: String,
    bodyOverride: String,
    // Pre-send screening result (format/MX/disposable/role-based) — set at
    // campaign start, before enqueue. Not a paid-verifier mailbox check.
    emailCheckStatus: {
      type: String,
      enum: ['unchecked', 'valid', 'invalid'],
      default: 'unchecked',
    },
    emailCheckReason: String,
    lastContactDate: Date,
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },
    listId: { type: mongoose.Schema.Types.ObjectId, ref: 'List', default: null },
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
leadSchema.index({ listId: 1 })

module.exports = mongoose.model('Lead', leadSchema)
