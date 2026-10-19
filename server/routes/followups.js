// Follow-ups module routes — member recurring-task tracking + WhatsApp
// reminders. Mounted at /api/followups in routes/api.js, BELOW requireAuth, so
// every endpoint here requires the owner JWT. (The inbound WhatsApp webhook is
// a SEPARATE public router — routes/followupsWebhook.js — mounted ABOVE auth.)
const express = require('express')
const mongoose = require('mongoose')
const { parse } = require('csv-parse/sync')
const router = express.Router()

const { Member, Task, TaskAssignment } = require('../models')
const followupService = require('../services/followupService')
const reminderService = require('../services/reminderService')
const settingsService = require('../services/followupSettingsService')
const phone = require('../services/phoneService')
const period = require('../services/periodService')
const config = require('../config')

const dbReady = () => mongoose.connection.readyState === 1
const needDb = (res) => res.status(503).json({ success: false, error: 'Database unavailable' })
const notFound = (res, what) => res.status(404).json({ success: false, error: `${what} not found` })
const isCast = (err) => err && err.name === 'CastError'
const actor = (req) => (req.user && req.user.email) || 'admin'

// '' / whitespace → null (so the partial unique index on registrationId skips it).
const cleanRegId = (v) => {
  if (v == null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

// Explicit uniqueness guards. On a brand-new collection the unique indexes
// aren't built yet (Mongoose builds them async), so a duplicate could slip past
// the index — these existence checks are the real guard (same lesson as the Bid
// Analytics lane check). The unique index is the backstop + catches races.
const phoneTaken = (normalized, exceptId) => {
  const q = { phone: normalized }
  if (exceptId) q._id = { $ne: exceptId }
  return Member.exists(q)
}
const regIdTaken = (regId, exceptId) => {
  if (!regId) return Promise.resolve(false)
  const q = { registrationId: regId }
  if (exceptId) q._id = { $ne: exceptId }
  return Member.exists(q)
}

// ── Members ───────────────────────────────────────────────────────────────

router.get('/members', async (req, res) => {
  if (!dbReady()) return needDb(res)
  try {
    const filter = {}
    if (req.query.active === 'true') filter.isActive = true
    if (req.query.active === 'false') filter.isActive = false
    if (req.query.q && String(req.query.q).trim()) {
      const rx = new RegExp(String(req.query.q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      filter.$or = [{ name: rx }, { phone: rx }, { registrationId: rx }]
    }
    const members = await Member.find(filter).sort({ isActive: -1, name: 1 }).lean()
    res.json({ success: true, members })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.post('/members', async (req, res) => {
  if (!dbReady()) return needDb(res)
  try {
    const b = req.body || {}
    if (!b.name || !String(b.name).trim())
      return res.status(400).json({ success: false, error: 'name is required' })
    const normalized = phone.normalize(b.phone)
    if (!normalized)
      return res.status(400).json({ success: false, error: 'a valid phone number is required' })
    const regId = cleanRegId(b.registrationId)
    if (await phoneTaken(normalized))
      return res.status(400).json({ success: false, error: 'that phone number is already registered' })
    if (await regIdTaken(regId))
      return res.status(400).json({ success: false, error: 'that registration ID is already in use' })
    const member = await Member.create({
      name: String(b.name).trim(),
      phone: normalized,
      registrationId: regId,
      notes: b.notes,
      isActive: b.isActive !== false,
    })
    // Auto-assign current-period rows for every active task they qualify for.
    if (member.isActive) await followupService.ensureAssignmentsForMember(member._id)
    res.status(201).json({ success: true, member })
  } catch (err) {
    if (err.code === 11000)
      return res.status(400).json({
        success: false,
        error: err.keyPattern && err.keyPattern.registrationId
          ? 'that registration ID is already in use'
          : 'that phone number is already registered',
      })
    res.status(400).json({ success: false, error: err.message })
  }
})

router.put('/members/:id', async (req, res) => {
  if (!dbReady()) return needDb(res)
  try {
    const b = req.body || {}
    const updates = {}
    if (b.name !== undefined) {
      if (!String(b.name).trim())
        return res.status(400).json({ success: false, error: 'name must not be empty' })
      updates.name = String(b.name).trim()
    }
    if (b.phone !== undefined) {
      const normalized = phone.normalize(b.phone)
      if (!normalized)
        return res.status(400).json({ success: false, error: 'a valid phone number is required' })
      if (await phoneTaken(normalized, req.params.id))
        return res.status(400).json({ success: false, error: 'that phone number is already registered' })
      updates.phone = normalized
    }
    if (b.registrationId !== undefined) {
      const regId = cleanRegId(b.registrationId)
      if (await regIdTaken(regId, req.params.id))
        return res.status(400).json({ success: false, error: 'that registration ID is already in use' })
      updates.registrationId = regId
    }
    if (b.notes !== undefined) updates.notes = b.notes
    if (b.isActive !== undefined) updates.isActive = !!b.isActive
    const member = await Member.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true })
    if (!member) return notFound(res, 'Member')
    // Reactivating a member re-seeds their current-period assignments.
    if (updates.isActive === true) await followupService.ensureAssignmentsForMember(member._id)
    res.json({ success: true, member })
  } catch (err) {
    if (err.code === 11000)
      return res.status(400).json({
        success: false,
        error: err.keyPattern && err.keyPattern.registrationId
          ? 'that registration ID is already in use'
          : 'that phone number is already registered',
      })
    if (isCast(err)) return notFound(res, 'Member')
    res.status(400).json({ success: false, error: err.message })
  }
})

// DELETE = soft deactivate (inactive members are never reminded/auto-assigned).
router.delete('/members/:id', async (req, res) => {
  if (!dbReady()) return needDb(res)
  try {
    const member = await Member.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true })
    if (!member) return notFound(res, 'Member')
    res.json({ success: true, member })
  } catch (err) {
    if (isCast(err)) return notFound(res, 'Member')
    res.status(500).json({ success: false, error: err.message })
  }
})

// Bulk member actions: { memberIds: [], action: 'deactivate' | 'activate' }.
router.post('/members/bulk', async (req, res) => {
  if (!dbReady()) return needDb(res)
  try {
    const { memberIds, action } = req.body || {}
    if (!Array.isArray(memberIds) || !memberIds.length)
      return res.status(400).json({ success: false, error: 'memberIds is required' })
    if (!['deactivate', 'activate'].includes(action))
      return res.status(400).json({ success: false, error: 'invalid action' })
    const isActive = action === 'activate'
    const r = await Member.updateMany({ _id: { $in: memberIds } }, { isActive })
    if (isActive) {
      for (const id of memberIds) await followupService.ensureAssignmentsForMember(id)
    }
    res.json({ success: true, modified: r.modifiedCount || 0 })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// CSV import: columns name, phone, registration_id. Normalizes + dedupes by
// phone, returns a per-row summary with a duplicate-phone report.
router.post('/members/import', async (req, res) => {
  if (!dbReady()) return needDb(res)
  try {
    const csv = (req.body && req.body.csv) || ''
    if (typeof csv !== 'string' || !csv.trim())
      return res.status(400).json({ success: false, error: 'csv text is required' })
    let records
    try {
      records = parse(csv, { columns: true, skip_empty_lines: true, trim: true })
    } catch (e) {
      return res.status(400).json({ success: false, error: 'Could not parse CSV: ' + e.message })
    }

    const header = (obj) => {
      const map = {}
      for (const k of Object.keys(obj)) map[k.trim().toLowerCase().replace(/[\s_]+/g, '')] = k
      return map
    }

    const existing = await Member.find({}, { phone: 1 }).lean()
    const existingPhones = new Set(existing.map((m) => m.phone))
    const seen = new Set()
    const summary = { total: records.length, inserted: 0, duplicates: [], failed: [] }
    const toInsert = []

    records.forEach((raw, i) => {
      const h = header(raw)
      const name = raw[h.name]
      const rawPhone = raw[h.phone]
      const regId = cleanRegId(raw[h.registrationid])
      const rowNo = i + 2
      if (!name || !String(name).trim()) {
        summary.failed.push({ row: rowNo, error: 'missing name' })
        return
      }
      const normalized = phone.normalize(rawPhone)
      if (!normalized) {
        summary.failed.push({ row: rowNo, error: 'invalid phone: ' + (rawPhone || '') })
        return
      }
      if (existingPhones.has(normalized) || seen.has(normalized)) {
        summary.duplicates.push({ row: rowNo, phone: phone.toE164(normalized), name: String(name).trim() })
        return
      }
      seen.add(normalized)
      toInsert.push({ name: String(name).trim(), phone: normalized, registrationId: regId })
    })

    if (toInsert.length) {
      // ordered:false so one stray duplicate-regId doesn't abort the batch.
      try {
        const docs = await Member.insertMany(toInsert, { ordered: false })
        summary.inserted = docs.length
      } catch (e) {
        summary.inserted = (e.result && e.result.nInserted) || e.insertedDocs?.length || 0
        if (e.writeErrors)
          for (const we of e.writeErrors)
            summary.failed.push({ row: '?', error: we.errmsg || 'insert error' })
      }
      await followupService.ensureCurrentAssignments()
    }
    res.json({ success: true, summary })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── Tasks ─────────────────────────────────────────────────────────────────

const TASK_FIELDS = [
  'title', 'description', 'recurrence', 'dueDate', 'dueWeekday',
  'dueDayOfMonth', 'assignTo', 'assignees', 'reminderTemplate', 'tagColor', 'isActive',
]
const pickTask = (b) => {
  const out = {}
  for (const k of TASK_FIELDS) if (b[k] !== undefined) out[k] = b[k]
  return out
}

router.get('/tasks', async (req, res) => {
  if (!dbReady()) return needDb(res)
  try {
    const filter = {}
    if (req.query.active === 'true') filter.isActive = true
    if (req.query.active === 'false') filter.isActive = false
    const tasks = await Task.find(filter).sort({ isActive: -1, createdAt: -1 }).lean()
    res.json({ success: true, tasks })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.post('/tasks', async (req, res) => {
  if (!dbReady()) return needDb(res)
  try {
    const doc = pickTask(req.body || {})
    if (!doc.title || !String(doc.title).trim())
      return res.status(400).json({ success: false, error: 'title is required' })
    if (!Task.RECURRENCES.includes(doc.recurrence))
      return res.status(400).json({ success: false, error: 'recurrence must be one_time|weekly|monthly' })
    if (doc.recurrence === 'one_time' && !doc.dueDate)
      return res.status(400).json({ success: false, error: 'dueDate is required for a one_time task' })
    if (doc.assignTo === 'selected' && (!Array.isArray(doc.assignees) || !doc.assignees.length))
      return res.status(400).json({ success: false, error: 'selected tasks need at least one assignee' })
    const task = await Task.create(doc)
    if (task.isActive) await followupService.reconcileTaskCurrentPeriod(task)
    res.status(201).json({ success: true, task })
  } catch (err) {
    res.status(400).json({ success: false, error: err.message })
  }
})

router.put('/tasks/:id', async (req, res) => {
  if (!dbReady()) return needDb(res)
  try {
    const updates = pickTask(req.body || {})
    if (updates.recurrence !== undefined && !Task.RECURRENCES.includes(updates.recurrence))
      return res.status(400).json({ success: false, error: 'invalid recurrence' })
    if (updates.assignTo === 'selected' && (!Array.isArray(updates.assignees) || !updates.assignees.length))
      return res.status(400).json({ success: false, error: 'selected tasks need at least one assignee' })
    const task = await Task.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true })
    if (!task) return notFound(res, 'Task')
    // Apply assignee/active changes from the current period onward.
    if (task.isActive) await followupService.reconcileTaskCurrentPeriod(task)
    res.json({ success: true, task })
  } catch (err) {
    if (isCast(err)) return notFound(res, 'Task')
    res.status(400).json({ success: false, error: err.message })
  }
})

// Soft delete (pausing stops reminders + lazy generation; history is kept).
router.delete('/tasks/:id', async (req, res) => {
  if (!dbReady()) return needDb(res)
  try {
    const task = await Task.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true })
    if (!task) return notFound(res, 'Task')
    res.json({ success: true, task })
  } catch (err) {
    if (isCast(err)) return notFound(res, 'Task')
    res.status(500).json({ success: false, error: err.message })
  }
})

// Per-task view: who is pending/done for a period (default current). Supports a
// period switcher via ?periodKey=.
router.get('/tasks/:id([0-9a-fA-F]{24})/assignments', async (req, res) => {
  if (!dbReady()) return needDb(res)
  try {
    const task = await Task.findById(req.params.id).lean()
    if (!task) return notFound(res, 'Task')
    const periodKey = req.query.periodKey || period.currentPeriodKey(task)
    // Ensure the CURRENT period is materialized before reading it.
    if (periodKey === period.currentPeriodKey(task)) await followupService.ensureCurrentAssignments()
    const assignments = await TaskAssignment.find({ task: task._id, periodKey })
      .populate('member', 'name phone registrationId isActive')
      .sort({ status: 1 })
      .lean()
    res.json({ success: true, task, periodKey, assignments })
  } catch (err) {
    if (isCast(err)) return notFound(res, 'Task')
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── Board (main members screen) ─────────────────────────────────────────────

router.get('/board', async (req, res) => {
  if (!dbReady()) return needDb(res)
  try {
    const board = await followupService.getBoard({
      taskId: req.query.task || null,
      status: req.query.status || null, // 'pending' | 'done'
      q: req.query.q || null,
    })
    res.json({ success: true, ...board })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── Assignments (mark done / undo / skip / bulk) ────────────────────────────

const assignmentAction = (fn, verb) => async (req, res) => {
  if (!dbReady()) return needDb(res)
  try {
    const a = await fn(req.params.id, actor(req))
    if (!a) return notFound(res, 'Assignment')
    res.json({ success: true, assignment: a })
  } catch (err) {
    if (isCast(err)) return notFound(res, 'Assignment')
    res.status(500).json({ success: false, error: err.message })
  }
}

router.post('/assignments/:id/complete', assignmentAction(followupService.complete))
router.post('/assignments/:id/undo', assignmentAction((id) => followupService.undo(id)))
router.post('/assignments/:id/skip', assignmentAction(followupService.skip))

router.post('/assignments/bulk-complete', async (req, res) => {
  if (!dbReady()) return needDb(res)
  try {
    const { ids } = req.body || {}
    if (!Array.isArray(ids) || !ids.length)
      return res.status(400).json({ success: false, error: 'ids is required' })
    const modified = await followupService.bulkComplete(ids, actor(req))
    res.json({ success: true, modified })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── Reminders ───────────────────────────────────────────────────────────────

const parseScope = (b) => {
  const scope = (b && b.scope) || {}
  const type = ['all', 'task', 'members'].includes(scope.type) ? scope.type : 'all'
  return {
    type,
    taskId: scope.taskId || null,
    memberIds: Array.isArray(scope.memberIds) ? scope.memberIds : [],
  }
}

router.post('/reminders/preview', async (req, res) => {
  if (!dbReady()) return needDb(res)
  try {
    const result = await reminderService.preview({ scope: parseScope(req.body), force: !!(req.body && req.body.force) })
    res.json({ success: true, ...result })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.post('/reminders/send', async (req, res) => {
  if (!dbReady()) return needDb(res)
  try {
    const result = await reminderService.send({
      scope: parseScope(req.body),
      force: !!(req.body && req.body.force),
      triggeredBy: actor(req),
    })
    res.json({ success: true, ...result })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// wa_link: admin clicked the link → record delivery.
router.post('/reminders/:id/mark-sent', async (req, res) => {
  if (!dbReady()) return needDb(res)
  try {
    const log = await reminderService.markSent(req.params.id)
    if (!log) return notFound(res, 'Reminder')
    res.json({ success: true, log })
  } catch (err) {
    if (isCast(err)) return notFound(res, 'Reminder')
    res.status(500).json({ success: false, error: err.message })
  }
})

router.delete('/reminders/:id', async (req, res) => {
  if (!dbReady()) return needDb(res)
  try {
    const log = await reminderService.remove(req.params.id)
    if (!log) return notFound(res, 'Reminder')
    res.json({ success: true })
  } catch (err) {
    if (isCast(err)) return notFound(res, 'Reminder')
    res.status(500).json({ success: false, error: err.message })
  }
})

router.get('/reminders/log', async (req, res) => {
  if (!dbReady()) return needDb(res)
  try {
    const result = await reminderService.history({
      memberId: req.query.memberId || null,
      since: req.query.since || null,
      page: parseInt(req.query.page, 10) || 1,
      limit: parseInt(req.query.limit, 10) || 100,
    })
    res.json({ success: true, ...result })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── Settings (admin-togglable knobs; NO secrets) ────────────────────────────

router.get('/settings', async (req, res) => {
  try {
    const s = await settingsService.getFresh()
    // timezone is env-only (not editable here) but handy for the UI to display.
    res.json({ success: true, settings: s, timezone: config.followups.timezone })
  } catch (err) {
    res.json({ success: true, settings: settingsService.defaults(), timezone: config.followups.timezone })
  }
})

router.put('/settings', async (req, res) => {
  if (!dbReady()) return needDb(res)
  try {
    const b = req.body || {}
    const patch = {}
    if (b.provider !== undefined) {
      if (!['wa_link', 'whatsapp_cloud'].includes(b.provider))
        return res.status(400).json({ success: false, error: 'invalid provider' })
      patch.provider = b.provider
    }
    if (b.throttleHours !== undefined) {
      const n = Number(b.throttleHours)
      if (!isFinite(n) || n < 0) return res.status(400).json({ success: false, error: 'throttleHours must be ≥ 0' })
      patch.throttleHours = n
    }
    if (b.autoRemindersEnabled !== undefined) patch.autoRemindersEnabled = !!b.autoRemindersEnabled
    if (b.schedulePrimary !== undefined) patch.schedulePrimary = String(b.schedulePrimary || '')
    if (b.scheduleSecondary !== undefined) patch.scheduleSecondary = String(b.scheduleSecondary || '')
    const s = await settingsService.set(patch)
    // Re-register the cron jobs so a schedule change takes effect without a
    // restart (fire-and-forget — never fail the settings save on this).
    if (patch.schedulePrimary !== undefined || patch.scheduleSecondary !== undefined) {
      require('../workers/followupScheduler').reschedule().catch(() => {})
    }
    res.json({ success: true, settings: s })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

module.exports = router
