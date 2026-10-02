const mongoose = require('mongoose')

// A single Upwork proposal and its funnel. This is INTERNAL analytics data,
// entered manually, by CSV import, or via an approved official API — never
// scraped. No Upwork credentials/cookies/tokens are ever stored here.
//
// serviceLane is a string snapshot of a ServiceLane name (not a ref) so analytics
// stay stable when a lane is renamed or deleted.

const PROPOSAL_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'VIEWED',
  'CLIENT_REPLIED',
  'INTERVIEW',
  'OFFER',
  'HIRED',
  'DECLINED',
  'CLIENT_HIRED_OTHER',
  'NO_RESPONSE',
  'WITHDRAWN',
  'ARCHIVED',
]

const proposalSchema = new mongoose.Schema(
  {
    // ── Job ──
    submittedAt: { type: Date, required: true, default: Date.now },
    // Optional: when the job was posted — drives the time-to-apply report.
    jobPostedAt: Date,
    jobUrl: String,
    jobTitle: { type: String, required: true, trim: true },
    jobCategory: String,
    serviceLane: { type: String, required: true, trim: true },
    jobType: String, // free text: ongoing / one-time / etc.
    budgetType: {
      type: String,
      enum: ['FIXED', 'HOURLY', 'UNKNOWN'],
      default: 'UNKNOWN',
    },
    jobBudgetMin: Number,
    jobBudgetMax: Number,
    hourlyRateBid: Number,
    fixedPriceBid: Number,
    requiredSkills: { type: [String], default: [] },

    // ── Client ──
    clientName: String,
    clientCountry: String,
    clientTotalSpent: Number,
    clientHireRate: Number, // 0..100 (percent)
    clientHasVerifiedPayment: Boolean,

    // ── Proposal ──
    proposalType: {
      type: String,
      enum: ['ORGANIC', 'BOOSTED'],
      default: 'ORGANIC',
    },
    connectsUsed: { type: Number, default: 0, min: 0 },
    boostConnects: { type: Number, default: 0, min: 0 },
    profileTitleUsed: String,
    proposalTemplate: String,
    portfolioItemShared: String,
    proposalOpening: String,

    // ── Funnel ──
    proposalStatus: {
      type: String,
      enum: PROPOSAL_STATUSES,
      default: 'SUBMITTED',
    },
    viewedAt: Date,
    repliedAt: Date,
    interviewAt: Date,
    offerAt: Date,
    hiredAt: Date,

    // ── Outcome ──
    contractValue: { type: Number, min: 0 },
    contractCurrency: { type: String, default: 'USD' },
    contractType: String,
    lostReason: String,
    followUpDate: Date,
    notes: String,

    source: {
      type: String,
      enum: ['MANUAL', 'CSV_IMPORT', 'OFFICIAL_API'],
      default: 'MANUAL',
    },
  },
  { timestamps: true },
)

// Duplicate detection on import keys off jobUrl + submittedAt.
proposalSchema.index({ jobUrl: 1, submittedAt: 1 })
proposalSchema.index({ serviceLane: 1 })
proposalSchema.index({ proposalStatus: 1 })
proposalSchema.index({ submittedAt: -1 })

module.exports = mongoose.model('Proposal', proposalSchema)
module.exports.PROPOSAL_STATUSES = PROPOSAL_STATUSES
