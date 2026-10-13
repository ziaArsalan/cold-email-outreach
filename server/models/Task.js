const mongoose = require('mongoose')

// A recurring (or one-time) task assigned to members (Follow-ups module).
// `title` is what shows as the tag on each member. Assignments are NOT created
// here — they're generated lazily per cycle (see services/followupService.js).
//
// assignTo='all'      → every active member is an assignee.
// assignTo='selected' → only the active members listed in `assignees`.
//
// Editing assignTo/assignees applies from the CURRENT period onward (lazy
// generation + a current-period reconcile); past periods are never rewritten.

const RECURRENCES = ['one_time', 'weekly', 'monthly']

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    recurrence: { type: String, enum: RECURRENCES, required: true },

    // one_time: the date it's due (required for one_time). Recurring tasks may
    // carry an optional target weekday (0=Sun..6=Sat) or day-of-month (1..31)
    // for display/nudge timing — they don't affect the period key.
    dueDate: { type: Date },
    dueWeekday: { type: Number, min: 0, max: 6 },
    dueDayOfMonth: { type: Number, min: 1, max: 31 },

    assignTo: { type: String, enum: ['all', 'selected'], default: 'all' },
    assignees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Member' }],

    // Optional custom reminder body. Supports {{name}}, {{period_label}},
    // {{tasks}} tokens; blank → the default template in reminderService.
    reminderTemplate: { type: String, trim: true },
    tagColor: { type: String, trim: true }, // e.g. '#60a5fa'

    // Pausing a task stops its reminders and its lazy assignment generation.
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
)

taskSchema.index({ isActive: 1, recurrence: 1 })

module.exports = mongoose.model('Task', taskSchema)
module.exports.RECURRENCES = RECURRENCES
