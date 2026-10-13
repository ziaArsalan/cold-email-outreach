const mongoose = require('mongoose')

// The core table: one row per (member, task, cycle). Rows are generated LAZILY
// — the first time a period is accessed (board view, reminder run, mark-done) —
// never pre-created by a cron. Old periods' rows stay untouched as history.
//
// periodKey identifies the cycle in the configured timezone (Asia/Karachi):
//   one_time → 'once'
//   weekly   → ISO week, e.g. '2026-W42'   (week starts Monday)
//   monthly  → 'YYYY-MM', e.g. '2026-10'
// See services/periodService.js.

const STATUSES = ['pending', 'done', 'skipped']

const taskAssignmentSchema = new mongoose.Schema(
  {
    task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true, index: true },
    member: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true, index: true },
    periodKey: { type: String, required: true },

    status: { type: String, enum: STATUSES, default: 'pending' },
    completedAt: { type: Date },
    // Who closed it: an admin user's email/id, or the literal 'member_reply'
    // when a WhatsApp "DONE" reply did it.
    completedBy: { type: String },

    // Reminder bookkeeping (for throttling + history).
    lastRemindedAt: { type: Date },
    reminderCount: { type: Number, default: 0 },
  },
  { timestamps: true },
)

// One row per member, per task, per cycle — the uniqueness that makes lazy
// generation idempotent (concurrent upserts race into one row, not many).
taskAssignmentSchema.index({ task: 1, member: 1, periodKey: 1 }, { unique: true })
// Board query filters by (task, periodKey) across many members.
taskAssignmentSchema.index({ periodKey: 1, status: 1 })

module.exports = mongoose.model('TaskAssignment', taskAssignmentSchema)
module.exports.STATUSES = STATUSES
