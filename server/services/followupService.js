// Core business logic for the Follow-ups module: lazy per-cycle assignment
// generation, the members board (current-period tags), and mark done/undo/skip.
//
// Assignments are created LAZILY — whenever the current period is accessed
// (board load, reminder run, mark-done, member add) we upsert any missing rows
// for active tasks and their active assignees. No cron pre-creates rows; old
// periods' rows are never touched, so history is preserved and the next period
// naturally starts all-pending.

const mongoose = require('mongoose')
const { Member, Task, TaskAssignment } = require('../models')
const { currentPeriodKey } = require('./periodService')

// ── assignee resolution ──────────────────────────────────────────────────────

// Member ids (as ObjectId) that should hold an assignment for `task` this
// period: every active member for an 'all' task, or the active members named in
// `assignees` for a 'selected' task. Inactive members are never assigned.
const resolveAssigneeIds = (task, activeMemberIds) => {
  if (task.assignTo === 'selected') {
    const picked = new Set((task.assignees || []).map((a) => String(a)))
    return activeMemberIds.filter((id) => picked.has(String(id)))
  }
  return activeMemberIds
}

const upsertOp = (taskId, memberId, periodKey) => ({
  updateOne: {
    filter: { task: taskId, member: memberId, periodKey },
    update: {
      $setOnInsert: {
        task: taskId,
        member: memberId,
        periodKey,
        status: 'pending',
        reminderCount: 0,
      },
    },
    upsert: true,
  },
})

// Create any missing current-period rows for every active task × active
// assignee. Idempotent (the unique index + $setOnInsert make concurrent runs
// safe and never clobber an existing status).
const ensureCurrentAssignments = async (now = new Date()) => {
  const [activeMembers, tasks] = await Promise.all([
    Member.find({ isActive: true }).select('_id').lean(),
    Task.find({ isActive: true }).lean(),
  ])
  const activeIds = activeMembers.map((m) => m._id)
  const ops = []
  for (const task of tasks) {
    const pk = currentPeriodKey(task, now)
    for (const mid of resolveAssigneeIds(task, activeIds)) {
      ops.push(upsertOp(task._id, mid, pk))
    }
  }
  if (ops.length) await TaskAssignment.bulkWrite(ops, { ordered: false })
  return ops.length
}

// A freshly-added (active) member gets current-period rows for every active
// task they qualify for.
const ensureAssignmentsForMember = async (memberId, now = new Date()) => {
  const member = await Member.findById(memberId).select('_id isActive').lean()
  if (!member || !member.isActive) return 0
  const tasks = await Task.find({ isActive: true }).lean()
  const ops = []
  for (const task of tasks) {
    const qualifies =
      task.assignTo === 'all' ||
      (task.assignees || []).some((a) => String(a) === String(memberId))
    if (!qualifies) continue
    ops.push(upsertOp(task._id, member._id, currentPeriodKey(task, now)))
  }
  if (ops.length) await TaskAssignment.bulkWrite(ops, { ordered: false })
  return ops.length
}

// Apply a task's assignee change from the CURRENT period onward: add rows for
// newly-included members, and drop only still-PENDING current-period rows for
// members no longer assigned (done/skipped rows stay as history). Past periods
// are never touched.
const reconcileTaskCurrentPeriod = async (task, now = new Date()) => {
  if (!task.isActive) return
  const activeMembers = await Member.find({ isActive: true }).select('_id').lean()
  const activeIds = activeMembers.map((m) => m._id)
  const pk = currentPeriodKey(task, now)
  const desired = resolveAssigneeIds(task, activeIds)
  const desiredIds = desired.map((id) => new mongoose.Types.ObjectId(id))
  if (desired.length) {
    await TaskAssignment.bulkWrite(
      desired.map((mid) => upsertOp(task._id, mid, pk)),
      { ordered: false },
    )
  }
  await TaskAssignment.deleteMany({
    task: task._id,
    periodKey: pk,
    status: 'pending',
    member: { $nin: desiredIds },
  })
}

// ── board ────────────────────────────────────────────────────────────────────

const escapeRx = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// The members board for the current period: each active member with their
// per-task tags, plus a summary bar. Loads members + current-period assignments
// in ONE query each (no N+1).
//
// opts: { now, taskId, status: 'pending'|'done', q }
const getBoard = async (opts = {}) => {
  const now = opts.now || new Date()
  await ensureCurrentAssignments(now)

  const tasks = await Task.find({ isActive: true }).sort({ createdAt: 1 }).lean()
  const taskPeriod = new Map(
    tasks.map((t) => [String(t._id), currentPeriodKey(t, now)]),
  )

  const memberFilter = { isActive: true }
  if (opts.q && String(opts.q).trim()) {
    const rx = new RegExp(escapeRx(String(opts.q).trim()), 'i')
    memberFilter.$or = [{ name: rx }, { phone: rx }, { registrationId: rx }]
  }
  const members = await Member.find(memberFilter).sort({ name: 1 }).lean()
  const memberIds = members.map((m) => m._id)

  const or = tasks.map((t) => ({
    task: t._id,
    periodKey: taskPeriod.get(String(t._id)),
  }))
  const assignments =
    or.length && memberIds.length
      ? await TaskAssignment.find({ member: { $in: memberIds }, $or: or }).lean()
      : []

  // index: memberId → (taskId → assignment)
  const byMember = new Map()
  for (const a of assignments) {
    const mk = String(a.member)
    if (!byMember.has(mk)) byMember.set(mk, new Map())
    byMember.get(mk).set(String(a.task), a)
  }

  const taskFilter = opts.taskId ? String(opts.taskId) : null

  // per-task completion tallies (over all active members with that task)
  const perTask = new Map(
    tasks.map((t) => [
      String(t._id),
      { taskId: String(t._id), title: t.title, tagColor: t.tagColor, done: 0, total: 0 },
    ]),
  )

  let rows = members.map((m) => {
    const taskMap = byMember.get(String(m._id)) || new Map()
    const tags = []
    for (const t of tasks) {
      const a = taskMap.get(String(t._id))
      if (!a) continue // member isn't an assignee of this (selected) task
      const pt = perTask.get(String(t._id))
      pt.total += 1
      if (a.status === 'done') pt.done += 1
      if (taskFilter && String(t._id) !== taskFilter) continue
      tags.push({
        assignmentId: String(a._id),
        taskId: String(t._id),
        title: t.title,
        tagColor: t.tagColor || null,
        status: a.status,
      })
    }
    const pendingCount = tags.filter((x) => x.status === 'pending').length
    return {
      _id: String(m._id),
      name: m.name,
      phone: m.phone,
      registrationId: m.registrationId || null,
      tags,
      pendingCount,
    }
  })

  // status filter operates on the (possibly task-filtered) tag set
  if (opts.status === 'pending') {
    rows = rows.filter((r) => r.pendingCount > 0)
  } else if (opts.status === 'done') {
    rows = rows.filter((r) => r.tags.length > 0 && r.pendingCount === 0)
  }
  // When filtering by task, drop members who have no tag for it.
  if (taskFilter) rows = rows.filter((r) => r.tags.length > 0)

  const summary = {
    totalMembers: members.length,
    membersWithPending: rows.length
      ? members.filter((m) => {
          const tm = byMember.get(String(m._id))
          if (!tm) return false
          for (const a of tm.values()) if (a.status === 'pending') return true
          return false
        }).length
      : 0,
    perTask: tasks.map((t) => perTask.get(String(t._id))),
  }

  return { members: rows, summary, tasks: tasks.map((t) => ({ _id: String(t._id), title: t.title, tagColor: t.tagColor || null })) }
}

// ── mark done / undo / skip ────────────────────────────────────────────────

const setStatus = async (assignmentId, status, by) => {
  const update =
    status === 'pending'
      ? { status, completedAt: null, completedBy: null }
      : { status, completedAt: new Date(), completedBy: by || null }
  const a = await TaskAssignment.findByIdAndUpdate(assignmentId, update, {
    new: true,
  })
  return a
}

const complete = (assignmentId, by) => setStatus(assignmentId, 'done', by)
const undo = (assignmentId) => setStatus(assignmentId, 'pending')
const skip = (assignmentId, by) => setStatus(assignmentId, 'skipped', by)

const bulkComplete = async (assignmentIds, by) => {
  const res = await TaskAssignment.updateMany(
    { _id: { $in: assignmentIds } },
    { status: 'done', completedAt: new Date(), completedBy: by || null },
  )
  return res.modifiedCount || 0
}

// Mark a member's pending tasks done for the current period — used by the
// WhatsApp "DONE" reply handler. With taskId, only that task; otherwise all.
const markMemberDone = async (memberId, { now = new Date(), by = 'member_reply', taskId } = {}) => {
  await ensureCurrentAssignments(now)
  const tasks = await Task.find({ isActive: true }).lean()
  const or = tasks
    .filter((t) => !taskId || String(t._id) === String(taskId))
    .map((t) => ({ task: t._id, periodKey: currentPeriodKey(t, now) }))
  if (!or.length) return 0
  const res = await TaskAssignment.updateMany(
    { member: memberId, status: 'pending', $or: or },
    { status: 'done', completedAt: now, completedBy: by },
  )
  return res.modifiedCount || 0
}

// Pending current-period assignments for the given members, grouped per member
// with task titles — the input the reminder builder turns into one message per
// member. Only active members with ≥1 pending task are returned.
const pendingByMember = async (memberIds, now = new Date()) => {
  await ensureCurrentAssignments(now)
  const tasks = await Task.find({ isActive: true }).lean()
  const taskById = new Map(tasks.map((t) => [String(t._id), t]))
  const or = tasks.map((t) => ({ task: t._id, periodKey: currentPeriodKey(t, now) }))
  if (!or.length) return []

  const memberFilter = { isActive: true }
  if (memberIds && memberIds.length) memberFilter._id = { $in: memberIds }
  const members = await Member.find(memberFilter).lean()
  const mIds = members.map((m) => m._id)
  if (!mIds.length) return []

  const pend = await TaskAssignment.find({
    member: { $in: mIds },
    status: 'pending',
    $or: or,
  }).lean()

  const byMember = new Map()
  for (const a of pend) {
    const k = String(a.member)
    if (!byMember.has(k)) byMember.set(k, [])
    const t = taskById.get(String(a.task))
    byMember.get(k).push({
      assignmentId: a._id,
      taskId: a.task,
      title: t ? t.title : '(task)',
      periodKey: a.periodKey,
      lastRemindedAt: a.lastRemindedAt,
    })
  }

  return members
    .filter((m) => byMember.has(String(m._id)))
    .map((m) => ({ member: m, pending: byMember.get(String(m._id)) }))
}

module.exports = {
  resolveAssigneeIds,
  ensureCurrentAssignments,
  ensureAssignmentsForMember,
  reconcileTaskCurrentPeriod,
  getBoard,
  complete,
  undo,
  skip,
  bulkComplete,
  markMemberDone,
  pendingByMember,
}
