const mongoose = require('mongoose')

const templateSchema = new mongoose.Schema(
  {
    name: String,
    subject: String,
    body: String,
    signature: String,
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
)

module.exports = mongoose.model('Template', templateSchema)
