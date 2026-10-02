const mongoose = require('mongoose')

// A monthly Connects + target budget. One document per (month, year).
const budgetSchema = new mongoose.Schema(
  {
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true },
    totalConnectsBudget: { type: Number, default: 0 },
    monetaryBudget: Number,
    organicConnectsBudget: { type: Number, default: 0 },
    boostedConnectsBudget: { type: Number, default: 0 },
    // Per-proposal caps (surfaced as budget warnings).
    maxConnectsPerProposal: Number,
    maxBoostConnectsPerProposal: Number,
    targetProposals: { type: Number, default: 0 },
    targetInterviews: { type: Number, default: 0 },
    targetHires: { type: Number, default: 0 },
    targetRevenue: Number,
    notes: String,
  },
  { timestamps: true },
)

budgetSchema.index({ year: 1, month: 1 }, { unique: true })

module.exports = mongoose.model('Budget', budgetSchema)
