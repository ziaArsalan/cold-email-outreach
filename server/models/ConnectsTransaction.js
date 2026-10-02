const mongoose = require('mongoose')

// A Connects ledger entry — purchases, monthly allocations, refunds, bonuses,
// spends, and manual adjustments. Internal analytics data, entered by the owner.
const connectsTransactionSchema = new mongoose.Schema(
  {
    transactionDate: { type: Date, required: true, default: Date.now },
    transactionType: {
      type: String,
      enum: [
        'PURCHASE',
        'MONTHLY_ALLOCATION',
        'REFUND',
        'BONUS',
        'SPENT',
        'ADJUSTMENT',
      ],
      required: true,
    },
    connectsAmount: { type: Number, required: true },
    amountPaid: Number,
    currency: { type: String, default: 'USD' },
    source: String,
    notes: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

connectsTransactionSchema.index({ transactionDate: -1 })

module.exports = mongoose.model('ConnectsTransaction', connectsTransactionSchema)
