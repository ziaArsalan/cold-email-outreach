const mongoose = require('mongoose')

// A reusable Upwork proposal template, tracked for performance analytics.
// Named BidTemplate to avoid colliding with the email `Template` model.
const bidTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    lane: String, // service lane this template targets (string snapshot)
    openingText: String,
    fullTemplate: String,
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
)

bidTemplateSchema.index({ name: 1 })

module.exports = mongoose.model('BidTemplate', bidTemplateSchema)
