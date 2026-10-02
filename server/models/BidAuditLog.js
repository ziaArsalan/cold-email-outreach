const mongoose = require('mongoose')

// Audit trail for the Bid Analytics module — records deletes, archives, imports
// and exports (a privacy/security requirement). Append-only; never updated.
const bidAuditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: ['delete', 'archive', 'import', 'export'],
      required: true,
    },
    entity: String, // 'proposal' | 'lane' | 'connects' | 'budget' | ...
    entityId: String,
    actor: String, // the owner email from the JWT
    detail: mongoose.Schema.Types.Mixed, // small summary, never secrets
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

bidAuditLogSchema.index({ createdAt: -1 })

module.exports = mongoose.model('BidAuditLog', bidAuditLogSchema)
