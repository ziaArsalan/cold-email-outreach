// Reminder orchestration for the Follow-ups module. Turns the current-period
// pending set into ONE message per member (never one per task), applies the
// throttle, dispatches through the active ReminderChannel, and records a
// ReminderLog per message. Provider-agnostic — the channel abstraction
// (services/reminders) hides wa_link vs whatsapp_cloud.

const { Task, TaskAssignment, ReminderLog } = require('../models')
const followupService = require('./followupService')
const settings = require('./followupSettingsService')
const { periodLabel } = require('./periodService')
const { channelFor } = require('./reminders')

const DEFAULT_TEMPLATE =
  'Hi {{name}}, quick reminder. Still pending for {{period_label}}:\n' +
  '{{tasks}}\n' +
  'Reply DONE once completed. Thanks!'

// A single period label for the member's pending set: the shared one if every
// pending task is in the same period, else a neutral "this period".
const labelFor = (pending) => {
  const keys = [...new Set(pending.map((p) => p.periodKey))]
  return keys.length === 1 ? periodLabel(keys[0]) : 'this period'
}

// Render the message text + the structured template params for one member.
const buildMessage = (member, pending, taskTemplateById) => {
  const tasksText = pending.map((p) => '• ' + p.title).join('\n')
  const label = labelFor(pending)
  // Use a task's custom template only when it's the member's sole pending task;
  // a multi-task message can't honor conflicting per-task templates, so it falls
  // back to the default.
  let tpl = DEFAULT_TEMPLATE
  if (pending.length === 1) {
    const custom = taskTemplateById.get(String(pending[0].taskId))
    if (custom) tpl = custom
  }
  const text = tpl
    .replace(/\{\{\s*name\s*\}\}/g, member.name || '')
    .replace(/\{\{\s*period_label\s*\}\}/g, label)
    .replace(/\{\{\s*tasks\s*\}\}/g, tasksText)
  return { text, params: { name: member.name || '', periodLabel: label, tasksText } }
}

// Recipients = active members with ≥1 pending task, narrowed by scope, then by
// the throttle (unless force). scope:
//   { type: 'all' }                     — everyone pending
//   { type: 'task', taskId }            — pending on that task
//   { type: 'members', memberIds: [] }  — those members, if pending
const resolveRecipients = async ({ scope = {}, now, force }) => {
  const s = settings.get()
  const throttleMs = (s.throttleHours || 24) * 3600 * 1000

  const memberIds =
    scope.type === 'members' && Array.isArray(scope.memberIds) ? scope.memberIds : []
  let groups = await followupService.pendingByMember(memberIds, now)

  if (scope.type === 'task' && scope.taskId) {
    groups = groups
      .map((g) => ({
        ...g,
        pending: g.pending, // message still lists ALL pending tasks
        matchesTask: g.pending.some((p) => String(p.taskId) === String(scope.taskId)),
      }))
      .filter((g) => g.matchesTask)
  }

  const kept = []
  const throttled = []
  for (const g of groups) {
    const last = g.pending.reduce(
      (acc, p) => (p.lastRemindedAt && (!acc || p.lastRemindedAt > acc) ? p.lastRemindedAt : acc),
      null,
    )
    if (!force && last && now - new Date(last) < throttleMs) throttled.push(g)
    else kept.push(g)
  }
  return { kept, throttled }
}

// Load custom per-task reminder templates once (for the sole-pending-task case).
const loadTaskTemplates = async () => {
  const tasks = await Task.find({ isActive: true, reminderTemplate: { $nin: [null, ''] } })
    .select('reminderTemplate')
    .lean()
  return new Map(tasks.map((t) => [String(t._id), t.reminderTemplate]))
}

// Preview: who would be reminded + a sample message, WITHOUT sending.
const preview = async ({ scope, force } = {}) => {
  const now = new Date()
  const { kept, throttled } = await resolveRecipients({ scope, now, force })
  const taskTemplates = await loadTaskTemplates()
  const sample = kept.length ? buildMessage(kept[0].member, kept[0].pending, taskTemplates).text : null
  return {
    provider: settings.get().provider,
    recipientCount: kept.length,
    throttledCount: throttled.length,
    sample,
    recipients: kept.map((g) => ({
      memberId: String(g.member._id),
      name: g.member.name,
      phone: g.member.phone,
      pendingCount: g.pending.length,
    })),
  }
}

// Send (or, for wa_link, queue) one message per kept recipient. One member's
// failure never aborts the batch. Returns a per-recipient summary; wa_link rows
// carry a wa.me `link` + the ReminderLog id so the UI can later markSent.
const send = async ({ scope, force, triggeredBy } = {}) => {
  const now = new Date()
  const s = settings.get()
  const channel = channelFor(s.provider)
  const { kept, throttled } = await resolveRecipients({ scope, now, force })
  const taskTemplates = await loadTaskTemplates()

  const out = { provider: s.provider, sent: 0, queued: 0, failed: 0, throttled: throttled.length, items: [] }

  for (const g of kept) {
    const message = buildMessage(g.member, g.pending, taskTemplates)
    const assignmentIds = g.pending.map((p) => p.assignmentId)
    let result
    try {
      result = await channel.send(g.member, message)
    } catch (err) {
      result = { status: 'failed', providerMessageId: null, error: err.message }
    }

    const logDoc = await ReminderLog.create({
      member: g.member._id,
      assignmentIds,
      channel: channel.name,
      message: message.text,
      status: result.status,
      providerMessageId: result.providerMessageId || null,
      error: result.error || null,
      triggeredBy: triggeredBy || 'manual',
    })

    // A delivered message (whatsapp_cloud 'sent') stamps the covered assignments
    // so the throttle counts from actual delivery. wa_link stays 'queued' until
    // the admin clicks "Mark sent" (markSent below).
    if (result.status === 'sent') await stampReminded(assignmentIds, now)

    if (result.status === 'sent') out.sent++
    else if (result.status === 'queued') out.queued++
    else out.failed++

    out.items.push({
      logId: String(logDoc._id),
      memberId: String(g.member._id),
      name: g.member.name,
      phone: g.member.phone,
      status: result.status,
      link: result.link || null,
      error: result.error || null,
    })
  }
  return out
}

const stampReminded = (assignmentIds, when) =>
  TaskAssignment.updateMany(
    { _id: { $in: assignmentIds } },
    { $set: { lastRemindedAt: when }, $inc: { reminderCount: 1 } },
  )

// wa_link manual completion: the admin clicked the link, so mark the log sent
// and stamp its assignments (this is what the throttle reads).
const markSent = async (logId) => {
  const log = await ReminderLog.findById(logId)
  if (!log) return null
  log.status = 'sent'
  await log.save()
  await stampReminded(log.assignmentIds, new Date())
  return log
}

const history = async ({ memberId, since, limit = 100, page = 1 } = {}) => {
  const filter = {}
  if (memberId) filter.member = memberId
  if (since) {
    const d = new Date(since)
    if (!isNaN(d.getTime())) filter.createdAt = { $gte: d }
  }
  const lim = Math.min(500, Math.max(1, limit))
  const [items, total] = await Promise.all([
    ReminderLog.find(filter)
      .populate('member', 'name phone')
      .sort({ createdAt: -1 })
      .skip((Math.max(1, page) - 1) * lim)
      .limit(lim)
      .lean(),
    ReminderLog.countDocuments(filter),
  ])
  return { items, total, page: Math.max(1, page), pages: Math.max(1, Math.ceil(total / lim)) }
}

module.exports = { preview, send, markSent, history, buildMessage, DEFAULT_TEMPLATE }
