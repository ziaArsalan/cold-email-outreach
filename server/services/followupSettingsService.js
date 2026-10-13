// Effective Follow-ups settings = stored (admin singleton) ?? env ?? hardcoded
// default. Mirrors settingsService.js (the Outreach V2 pattern): a short-lived
// in-process cache lets callers read synchronously via get(); NEVER throws — a
// down/disconnected DB simply yields the env-derived defaults.
//
// Only the admin-togglable knobs live here. The timezone, default country code,
// and WhatsApp secrets stay in config.followups (env-only).

const config = require('../config')
const { FollowupSetting } = require('../models')

let snapshot = null
let loadedAt = 0
const TTL = 5000

const defaults = () => ({
  provider: config.followups.provider,
  throttleHours: config.followups.throttleHours,
  autoRemindersEnabled: config.followups.autoRemindersEnabled,
  schedulePrimary: config.followups.schedule.primary,
  scheduleSecondary: config.followups.schedule.secondary,
})

const merge = (base, stored) => {
  if (!stored) return base
  const out = base
  if (stored.provider != null) out.provider = stored.provider
  if (stored.throttleHours != null) out.throttleHours = stored.throttleHours
  if (typeof stored.autoRemindersEnabled === 'boolean')
    out.autoRemindersEnabled = stored.autoRemindersEnabled
  if (stored.schedulePrimary != null) out.schedulePrimary = stored.schedulePrimary
  if (stored.scheduleSecondary != null)
    out.scheduleSecondary = stored.scheduleSecondary
  return out
}

const refresh = async () => {
  try {
    const stored = await FollowupSetting.findOne({ key: 'followups' }).lean()
    snapshot = merge(defaults(), stored)
    loadedAt = Date.now()
    return snapshot
  } catch (_) {
    snapshot = defaults()
    loadedAt = Date.now()
    return snapshot
  }
}

const get = () => {
  if (!snapshot || Date.now() - loadedAt > TTL) refresh().catch(() => {})
  return snapshot || defaults()
}

const getFresh = async () => {
  await refresh()
  return snapshot
}

const set = async (patch) => {
  await FollowupSetting.findOneAndUpdate(
    { key: 'followups' },
    { $set: patch },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )
  await refresh()
  return snapshot
}

module.exports = { get, getFresh, set, defaults }
