const mongoose = require('mongoose')

// Singleton document holding portal-editable Outreach V2 tunables. Every field
// is OPTIONAL — an absent field falls back to env/config (see settingsService).
// NO secrets or infra here (no SMTP creds, API keys, Mongo URI, JWT). The single
// row is pinned by `key: 'outreach'`.
const outreachSettingSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'outreach', unique: true },
    queueWorkerEnabled: Boolean,
    sendMode: { type: String, enum: ['warmup', 'production'] },
    delays: {
      warmup: { minMs: Number, maxMs: Number },
      production: { minMs: Number, maxMs: Number },
    },
    maxRetries: Number,
    workerIdleMs: Number,
    warmupWeeks: [{ week: Number, min: Number, max: Number }],
    emailVerification: {
      checkMX: Boolean,
      blockDisposable: Boolean,
      blockRoleBased: Boolean,
    },
  },
  { timestamps: true },
)

module.exports = mongoose.model('OutreachSetting', outreachSettingSchema)
