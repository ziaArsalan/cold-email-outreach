// Effective Outreach V2 settings = stored (portal) ?? env ?? hardcoded default.
// The DB holds only the fields the operator has actually overridden; everything
// else falls through to server/config. A short-lived in-process cache lets hot
// paths (the worker tick, email verification) read settings SYNCHRONOUSLY via
// get() without awaiting Mongo on every call. NEVER throws — a down/disconnected
// DB simply yields the env-derived defaults so the app keeps running.
//
// UNITS: everything here is ms / integers (the storage+validation contract).
// The client converts minutes/seconds ↔ ms; the wire is always ms.

const config = require('../config')
const { OutreachSetting } = require('../models')

let snapshot = null
let loadedAt = 0
const TTL = 5000

// The full effective object built purely from config (env → hardcoded). Deep
// copies so callers can't mutate config through a returned snapshot.
const defaults = () => ({
  queueWorkerEnabled: config.queueWorkerEnabled,
  sendMode: config.sendMode,
  delays: {
    warmup: {
      minMs: config.delays.warmup.minMs,
      maxMs: config.delays.warmup.maxMs,
    },
    production: {
      minMs: config.delays.production.minMs,
      maxMs: config.delays.production.maxMs,
    },
  },
  maxRetries: config.retry.maxRetries,
  workerIdleMs: config.workerIdleMs,
  warmupWeeks: config.warmupWeeks.map((w) => ({
    week: w.week,
    min: w.min,
    max: w.max,
  })),
  emailVerification: {
    checkMX: config.emailVerification.checkMX,
    blockDisposable: config.emailVerification.blockDisposable,
    blockRoleBased: config.emailVerification.blockRoleBased,
  },
})

// Overlay only the fields the stored doc actually set (defined + non-null) on
// top of the defaults. Nested objects present in the store replace their default
// wholesale — the route validates full nested objects, so a present nested object
// is well-formed; an absent one keeps the default.
const merge = (base, stored) => {
  if (!stored) return base
  const out = base
  if (typeof stored.queueWorkerEnabled === 'boolean')
    out.queueWorkerEnabled = stored.queueWorkerEnabled
  if (stored.sendMode != null) out.sendMode = stored.sendMode
  if (stored.delays != null) {
    if (stored.delays.warmup != null) out.delays.warmup = stored.delays.warmup
    if (stored.delays.production != null)
      out.delays.production = stored.delays.production
  }
  if (stored.maxRetries != null) out.maxRetries = stored.maxRetries
  if (stored.workerIdleMs != null) out.workerIdleMs = stored.workerIdleMs
  if (Array.isArray(stored.warmupWeeks) && stored.warmupWeeks.length)
    out.warmupWeeks = stored.warmupWeeks
  if (stored.emailVerification != null) {
    const ev = stored.emailVerification
    if (typeof ev.checkMX === 'boolean') out.emailVerification.checkMX = ev.checkMX
    if (typeof ev.blockDisposable === 'boolean')
      out.emailVerification.blockDisposable = ev.blockDisposable
    if (typeof ev.blockRoleBased === 'boolean')
      out.emailVerification.blockRoleBased = ev.blockRoleBased
  }
  return out
}

// Reload the snapshot from Mongo, merging over defaults. Never throws — on any
// error (DB down/not connected) it falls back to pure defaults.
const refresh = async () => {
  try {
    const stored = await OutreachSetting.findOne({ key: 'outreach' }).lean()
    snapshot = merge(defaults(), stored)
    loadedAt = Date.now()
    return snapshot
  } catch (_) {
    snapshot = defaults()
    loadedAt = Date.now()
    return snapshot
  }
}

// Synchronous + cheap. Returns the cached snapshot, kicking off a fire-and-forget
// refresh when the cache is empty or stale. Falls back to defaults() until the
// first refresh resolves, so hot paths never block or throw.
const get = () => {
  if (!snapshot || Date.now() - loadedAt > TTL) {
    refresh().catch(() => {})
  }
  return snapshot || defaults()
}

// Await a fresh read (used by GET so the API always reflects the DB immediately).
const getFresh = async () => {
  await refresh()
  return snapshot
}

// Upsert a partial patch, then refresh the cache and return the new snapshot.
const set = async (patch) => {
  await OutreachSetting.findOneAndUpdate(
    { key: 'outreach' },
    { $set: patch },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )
  await refresh()
  return snapshot
}

module.exports = { get, getFresh, set, defaults }
