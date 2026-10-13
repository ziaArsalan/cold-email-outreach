const mongoose = require('mongoose')

// A person who must complete recurring tasks (Follow-ups module). Single-owner
// app, so no userId / tenant scoping — every member belongs to the owner.
//
// `phone` is stored as DIGITS ONLY in E.164 form (country code + number, no '+',
// no spaces) and is unique. Normalization happens in services/phoneService.js
// before save; the unique index enforces no duplicate numbers.
const memberSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true, unique: true },
    // Optional external id (e.g. a gym/registration number). Unique ONLY when
    // present — a sparse index so many members can omit it.
    registrationId: { type: String, trim: true, default: null },
    notes: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
)

// Unique only among members that actually carry a registration id. A PARTIAL
// index (not sparse) because empties are stored as null, and a plain sparse
// unique index still treats multiple nulls as a collision — the partial filter
// restricts uniqueness to real string values. The route coerces '' → null so an
// empty id is never indexed.
memberSchema.index(
  { registrationId: 1 },
  { unique: true, partialFilterExpression: { registrationId: { $type: 'string' } } },
)
memberSchema.index({ isActive: 1, name: 1 })

module.exports = mongoose.model('Member', memberSchema)
