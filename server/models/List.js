const mongoose = require('mongoose')

const listSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: String,
    source: {
      type: String,
      enum: ['csv', 'sheets', 'manual', 'mixed'],
      default: 'manual',
    },
  },
  { timestamps: true },
)

module.exports = mongoose.model('List', listSchema)
