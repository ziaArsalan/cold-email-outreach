const mongoose = require('mongoose')

// One row per reminder MESSAGE (not per task) — each member gets a single
// message covering all their pending tasks, so the row records which assignment
// rows it covered. Powers the reminder history view and the throttle check.
const reminderLogSchema = new mongoose.Schema(
  {
    member: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true, index: true },
    // The TaskAssignment ids this message covered (the member's pending set at
    // send time).
    assignmentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'TaskAssignment' }],

    channel: { type: String }, // 'wa_link' | 'whatsapp_cloud' | ...
    message: { type: String }, // the rendered text that was sent
    status: {
      type: String,
      enum: ['queued', 'sent', 'failed'],
      default: 'queued',
    },
    providerMessageId: { type: String },
    error: { type: String },
    // Who/what triggered it: an admin email, 'scheduler', etc.
    triggeredBy: { type: String },
  },
  { timestamps: true },
)

reminderLogSchema.index({ createdAt: -1 })
reminderLogSchema.index({ member: 1, createdAt: -1 })

module.exports = mongoose.model('ReminderLog', reminderLogSchema)
