const mongoose = require('mongoose')

// A service lane the owner bids in (e.g. "AI Agents", "GoHighLevel"). Proposals
// store the lane by NAME (a string snapshot), so renaming a lane here does not
// rewrite history — analytics group by the stored name. Lanes can be archived
// (hidden from the Add-Proposal dropdown) or deleted outright.
const serviceLaneSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    archived: { type: Boolean, default: false },
    // true for the 8 seeded defaults — informational only (defaults are still
    // fully editable / deletable by the owner).
    isDefault: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
)

serviceLaneSchema.index({ name: 1 }, { unique: true })

module.exports = mongoose.model('ServiceLane', serviceLaneSchema)
