const mongoose = require('mongoose')

// Singleton holding the admin-editable runtime knobs for the Follow-ups module.
// Every field is OPTIONAL — an absent field falls back to config.followups (env
// → hardcoded). See services/followupSettingsService.js. The single row is
// pinned by `key: 'followups'`.
//
// NO secrets/infra here (WhatsApp token/appSecret/phoneNumberId stay env-only).
const followupSettingSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'followups', unique: true },

    // Active reminder channel.
    provider: { type: String, enum: ['wa_link', 'whatsapp_cloud'] },

    // Don't re-remind the same member within this many hours (unless forced).
    throttleHours: Number,

    // Kill switch: pause ALL scheduled auto-reminders (manual sends still work).
    autoRemindersEnabled: Boolean,

    // Scheduled nudges, local time in config.followups.timezone. 'mon 10:00'
    // format; '' / null disables that nudge.
    schedulePrimary: { type: String },
    scheduleSecondary: { type: String },
  },
  { timestamps: true },
)

module.exports = mongoose.model('FollowupSetting', followupSettingSchema)
