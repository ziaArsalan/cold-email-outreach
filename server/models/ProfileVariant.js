const mongoose = require('mongoose')

// A profile title / description version the owner A/B-tests on Upwork. Proposals
// reference the title used via Proposal.profileTitleUsed (a string snapshot).
const profileVariantSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    descriptionVersion: String,
    activeFrom: Date,
    activeTo: Date,
    notes: String,
  },
  { timestamps: true },
)

profileVariantSchema.index({ title: 1 })

module.exports = mongoose.model('ProfileVariant', profileVariantSchema)
