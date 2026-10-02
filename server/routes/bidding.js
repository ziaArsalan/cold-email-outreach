// Bid Analytics module routes — Upwork proposal funnel tracking (internal
// analytics). Mounted at /api/bidding in routes/api.js, BELOW requireAuth, so
// every endpoint here requires the owner JWT. No Upwork credentials or scraping
// are involved anywhere — all data is manual / CSV / official-API entry.
const express = require('express')
const mongoose = require('mongoose')
const { parse } = require('csv-parse/sync')
const router = express.Router()
const {
  Proposal,
  ServiceLane,
  ConnectsTransaction,
  Budget,
  BidTemplate,
  ProfileVariant,
} = require('../models')
const {
  seedDefaultLanes,
  validateProposalInput,
  logAudit,
  computeAnalytics,
  computeRecommendations,
  connectsBalance,
  budgetReport,
  csvSafeCell,
} = require('../services/biddingService')

const dbReady = () => mongoose.connection.readyState === 1
const needDb = (res) =>
  res.status(503).json({ success: false, error: 'Database unavailable' })

// Case-insensitive exact-name lookup for a lane, optionally excluding one id.
// A guard that doesn't depend on the unique index being built yet (indexes are
// created asynchronously, so a brand-new collection could otherwise accept a
// duplicate before the index lands).
const laneNameTaken = async (name, exceptId) => {
  const rx = new RegExp(
    '^' + String(name).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$',
    'i',
  )
  const q = { name: rx }
  if (exceptId) q._id = { $ne: exceptId }
  return ServiceLane.exists(q)
}

// Whitelist of proposal fields a client may set (keeps unknown keys out).
const PROPOSAL_FIELDS = [
  'submittedAt', 'jobPostedAt', 'jobUrl', 'jobTitle', 'jobCategory',
  'serviceLane', 'jobType', 'budgetType', 'jobBudgetMin', 'jobBudgetMax',
  'hourlyRateBid', 'fixedPriceBid', 'requiredSkills', 'clientName',
  'clientCountry', 'clientTotalSpent', 'clientHireRate',
  'clientHasVerifiedPayment', 'proposalType', 'connectsUsed', 'boostConnects',
  'profileTitleUsed', 'proposalTemplate', 'portfolioItemShared',
  'proposalOpening', 'proposalStatus', 'viewedAt', 'repliedAt', 'interviewAt',
  'offerAt', 'hiredAt', 'contractValue', 'contractCurrency', 'contractType',
  'lostReason', 'followUpDate', 'notes',
]

const pick = (body) => {
  const out = {}
  for (const k of PROPOSAL_FIELDS) if (body[k] !== undefined) out[k] = body[k]
  return out
}

// Funnel status → the timestamp it should stamp (if not already set).
const STATUS_STAMP = {
  VIEWED: 'viewedAt',
  CLIENT_REPLIED: 'repliedAt',
  INTERVIEW: 'interviewAt',
  OFFER: 'offerAt',
  HIRED: 'hiredAt',
}

// ── Service lanes ───────────────────────────────────────────────────────────

// GET /api/bidding/lanes — seeds the 8 defaults on first use, returns all.
router.get('/lanes', async (req, res) => {
  if (!dbReady()) return needDb(res)
  try {
    await seedDefaultLanes()
    const lanes = await ServiceLane.find().sort({ archived: 1, order: 1, name: 1 })
    res.json({ success: true, lanes })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.post('/lanes', async (req, res) => {
  if (!dbReady()) return needDb(res)
  try {
    const { name } = req.body || {}
    if (typeof name !== 'string' || !name.trim())
      return res.status(400).json({ success: false, error: 'name is required' })
    if (await laneNameTaken(name))
      return res
        .status(400)
        .json({ success: false, error: 'A lane with that name already exists' })
    const lane = await ServiceLane.create({ name: name.trim() })
    res.status(201).json({ success: true, lane })
  } catch (err) {
    if (err.code === 11000)
      return res
        .status(400)
        .json({ success: false, error: 'A lane with that name already exists' })
    res.status(500).json({ success: false, error: err.message })
  }
})

router.put('/lanes/:id', async (req, res) => {
  if (!dbReady()) return needDb(res)
  try {
    const { name, archived } = req.body || {}
    const updates = {}
    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim())
        return res
          .status(400)
          .json({ success: false, error: 'name must be a non-empty string' })
      if (await laneNameTaken(name, req.params.id))
        return res
          .status(400)
          .json({ success: false, error: 'A lane with that name already exists' })
      updates.name = name.trim()
    }
    if (archived !== undefined) updates.archived = !!archived
    const lane = await ServiceLane.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    })
    if (!lane)
      return res.status(404).json({ success: false, error: 'Lane not found' })
    res.json({ success: true, lane })
  } catch (err) {
    if (err.code === 11000)
      return res
        .status(400)
        .json({ success: false, error: 'A lane with that name already exists' })
    if (err.name === 'CastError')
      return res.status(404).json({ success: false, error: 'Lane not found' })
    res.status(500).json({ success: false, error: err.message })
  }
})

router.delete('/lanes/:id', async (req, res) => {
  if (!dbReady()) return needDb(res)
  try {
    const lane = await ServiceLane.findByIdAndDelete(req.params.id)
    if (!lane)
      return res.status(404).json({ success: false, error: 'Lane not found' })
    await logAudit({
      action: 'delete',
      entity: 'lane',
      entityId: String(lane._id),
      actor: req.user && req.user.email,
      detail: { name: lane.name },
    })
    res.json({ success: true })
  } catch (err) {
    if (err.name === 'CastError')
      return res.status(404).json({ success: false, error: 'Lane not found' })
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── Proposals ───────────────────────────────────────────────────────────────

// GET /api/bidding/proposals — paginated list with search / filter / sort.
// Query: q, status, lane, type, sort (field), dir (asc|desc), page, limit.
router.get('/proposals', async (req, res) => {
  if (!dbReady()) return needDb(res)
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25))
    const filter = {}
    if (req.query.status) filter.proposalStatus = req.query.status
    if (req.query.lane) filter.serviceLane = req.query.lane
    if (req.query.type) filter.proposalType = req.query.type
    if (req.query.q) {
      const rx = new RegExp(
        String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'i',
      )
      filter.$or = [
        { jobTitle: rx },
        { clientName: rx },
        { jobCategory: rx },
        { profileTitleUsed: rx },
      ]
    }
    const SORTABLE = [
      'submittedAt', 'proposalStatus', 'connectsUsed', 'serviceLane',
      'contractValue', 'createdAt',
    ]
    const field = SORTABLE.includes(req.query.sort) ? req.query.sort : 'submittedAt'
    const dir = req.query.dir === 'asc' ? 1 : -1
    const [items, total] = await Promise.all([
      Proposal.find(filter)
        .sort({ [field]: dir })
        .skip((page - 1) * limit)
        .limit(limit),
      Proposal.countDocuments(filter),
    ])
    res.json({
      success: true,
      items,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
    })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.post('/proposals', async (req, res) => {
  if (!dbReady()) return needDb(res)
  try {
    const err = validateProposalInput(req.body)
    if (err) return res.status(400).json({ success: false, error: err })
    const doc = pick(req.body || {})
    doc.source = 'MANUAL'
    const proposal = await Proposal.create(doc)
    res.status(201).json({ success: true, proposal })
  } catch (e) {
    res.status(500).json({ success: false, error: e.message })
  }
})

// :id constrained to a 24-hex ObjectId so static routes like
// /proposals/export.csv and /proposals/import-template.csv don't match here.
router.get('/proposals/:id([0-9a-fA-F]{24})', async (req, res) => {
  if (!dbReady()) return needDb(res)
  try {
    const proposal = await Proposal.findById(req.params.id)
    if (!proposal)
      return res
        .status(404)
        .json({ success: false, error: 'Proposal not found' })
    res.json({ success: true, proposal })
  } catch (err) {
    if (err.name === 'CastError')
      return res
        .status(404)
        .json({ success: false, error: 'Proposal not found' })
    res.status(500).json({ success: false, error: err.message })
  }
})

router.put('/proposals/:id', async (req, res) => {
  if (!dbReady()) return needDb(res)
  try {
    const err = validateProposalInput(req.body, { partial: true })
    if (err) return res.status(400).json({ success: false, error: err })
    const updates = pick(req.body || {})
    const proposal = await Proposal.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    })
    if (!proposal)
      return res
        .status(404)
        .json({ success: false, error: 'Proposal not found' })
    res.json({ success: true, proposal })
  } catch (e) {
    if (e.name === 'CastError')
      return res
        .status(404)
        .json({ success: false, error: 'Proposal not found' })
    res.status(500).json({ success: false, error: e.message })
  }
})

// POST /api/bidding/proposals/:id/status — one-click funnel transition.
// Body: { status }. Stamps the matching funnel date if it isn't already set.
router.post('/proposals/:id/status', async (req, res) => {
  if (!dbReady()) return needDb(res)
  try {
    const { status } = req.body || {}
    if (!Proposal.PROPOSAL_STATUSES.includes(status))
      return res.status(400).json({ success: false, error: 'Invalid status' })
    const proposal = await Proposal.findById(req.params.id)
    if (!proposal)
      return res
        .status(404)
        .json({ success: false, error: 'Proposal not found' })
    proposal.proposalStatus = status
    const stampField = STATUS_STAMP[status]
    if (stampField && !proposal[stampField]) proposal[stampField] = new Date()
    await proposal.save()
    res.json({ success: true, proposal })
  } catch (err) {
    if (err.name === 'CastError')
      return res
        .status(404)
        .json({ success: false, error: 'Proposal not found' })
    res.status(500).json({ success: false, error: err.message })
  }
})

router.delete('/proposals/:id', async (req, res) => {
  if (!dbReady()) return needDb(res)
  try {
    const proposal = await Proposal.findByIdAndDelete(req.params.id)
    if (!proposal)
      return res
        .status(404)
        .json({ success: false, error: 'Proposal not found' })
    await logAudit({
      action: 'delete',
      entity: 'proposal',
      entityId: String(proposal._id),
      actor: req.user && req.user.email,
      detail: { jobTitle: proposal.jobTitle, serviceLane: proposal.serviceLane },
    })
    res.json({ success: true })
  } catch (err) {
    if (err.name === 'CastError')
      return res
        .status(404)
        .json({ success: false, error: 'Proposal not found' })
    res.status(500).json({ success: false, error: err.message })
  }
})

// A submittedAt range filter from ?from&?to (inclusive day bounds).
const dateRangeFilter = (q) => {
  const range = {}
  if (q.from) {
    const d = new Date(q.from)
    if (!isNaN(d.getTime())) range.$gte = d
  }
  if (q.to) {
    const d = new Date(q.to)
    if (!isNaN(d.getTime())) {
      d.setHours(23, 59, 59, 999)
      range.$lte = d
    }
  }
  return range.$gte || range.$lte ? { submittedAt: range } : {}
}

// ── Analytics & recommendations ─────────────────────────────────────────────

router.get('/analytics', async (req, res) => {
  if (!dbReady()) return needDb(res)
  try {
    const list = await Proposal.find(dateRangeFilter(req.query)).lean()
    res.json({ success: true, analytics: computeAnalytics(list) })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// Recommendations are computed over the WHOLE dataset (sample-size stability),
// not the dashboard's date filter.
router.get('/recommendations', async (req, res) => {
  if (!dbReady()) return needDb(res)
  try {
    const list = await Proposal.find().lean()
    res.json({ success: true, recommendations: computeRecommendations(list) })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── Connects ledger ─────────────────────────────────────────────────────────

const CONNECTS_TYPES = [
  'PURCHASE', 'MONTHLY_ALLOCATION', 'REFUND', 'BONUS', 'SPENT', 'ADJUSTMENT',
]

router.get('/connects', async (req, res) => {
  if (!dbReady()) return needDb(res)
  try {
    const txns = await ConnectsTransaction.find(
      dateRangeFilter(req.query).submittedAt
        ? { transactionDate: dateRangeFilter(req.query).submittedAt }
        : {},
    ).sort({ transactionDate: -1 })
    const all = await ConnectsTransaction.find().lean()
    res.json({ success: true, items: txns, balance: connectsBalance(all) })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.post('/connects', async (req, res) => {
  if (!dbReady()) return needDb(res)
  try {
    const b = req.body || {}
    if (!CONNECTS_TYPES.includes(b.transactionType))
      return res
        .status(400)
        .json({ success: false, error: 'Invalid transactionType' })
    if (typeof b.connectsAmount !== 'number' || !isFinite(b.connectsAmount))
      return res
        .status(400)
        .json({ success: false, error: 'connectsAmount must be a number' })
    const txn = await ConnectsTransaction.create({
      transactionDate: b.transactionDate || Date.now(),
      transactionType: b.transactionType,
      connectsAmount: b.connectsAmount,
      amountPaid: b.amountPaid,
      currency: b.currency || 'USD',
      source: b.source,
      notes: b.notes,
    })
    res.status(201).json({ success: true, txn })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.put('/connects/:id', async (req, res) => {
  if (!dbReady()) return needDb(res)
  try {
    const b = req.body || {}
    if (b.transactionType !== undefined && !CONNECTS_TYPES.includes(b.transactionType))
      return res
        .status(400)
        .json({ success: false, error: 'Invalid transactionType' })
    const updates = {}
    for (const k of [
      'transactionDate', 'transactionType', 'connectsAmount', 'amountPaid',
      'currency', 'source', 'notes',
    ])
      if (b[k] !== undefined) updates[k] = b[k]
    const txn = await ConnectsTransaction.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    })
    if (!txn)
      return res.status(404).json({ success: false, error: 'Transaction not found' })
    res.json({ success: true, txn })
  } catch (err) {
    if (err.name === 'CastError')
      return res.status(404).json({ success: false, error: 'Transaction not found' })
    res.status(500).json({ success: false, error: err.message })
  }
})

router.delete('/connects/:id', async (req, res) => {
  if (!dbReady()) return needDb(res)
  try {
    const txn = await ConnectsTransaction.findByIdAndDelete(req.params.id)
    if (!txn)
      return res.status(404).json({ success: false, error: 'Transaction not found' })
    await logAudit({
      action: 'delete',
      entity: 'connects',
      entityId: String(txn._id),
      actor: req.user && req.user.email,
      detail: { type: txn.transactionType, amount: txn.connectsAmount },
    })
    res.json({ success: true })
  } catch (err) {
    if (err.name === 'CastError')
      return res.status(404).json({ success: false, error: 'Transaction not found' })
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── Budgets ─────────────────────────────────────────────────────────────────

const BUDGET_FIELDS = [
  'month', 'year', 'totalConnectsBudget', 'monetaryBudget',
  'organicConnectsBudget', 'boostedConnectsBudget', 'maxConnectsPerProposal',
  'maxBoostConnectsPerProposal', 'targetProposals', 'targetInterviews',
  'targetHires', 'targetRevenue', 'notes',
]
const pickBudget = (b) => {
  const out = {}
  for (const k of BUDGET_FIELDS) if (b[k] !== undefined) out[k] = b[k]
  return out
}

router.get('/budgets', async (req, res) => {
  if (!dbReady()) return needDb(res)
  try {
    const budgets = await Budget.find().sort({ year: -1, month: -1 })
    res.json({ success: true, budgets })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.post('/budgets', async (req, res) => {
  if (!dbReady()) return needDb(res)
  try {
    const b = req.body || {}
    const month = Number(b.month)
    const year = Number(b.year)
    if (!(month >= 1 && month <= 12))
      return res.status(400).json({ success: false, error: 'month must be 1–12' })
    if (!(year >= 2000 && year <= 2100))
      return res.status(400).json({ success: false, error: 'year is invalid' })
    if (await Budget.exists({ month, year }))
      return res.status(400).json({
        success: false,
        error: 'A budget for that month already exists — edit it instead',
      })
    const budget = await Budget.create(pickBudget({ ...b, month, year }))
    res.status(201).json({ success: true, budget })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.put('/budgets/:id', async (req, res) => {
  if (!dbReady()) return needDb(res)
  try {
    // month/year are immutable after creation (they're the unique key).
    const updates = pickBudget(req.body || {})
    delete updates.month
    delete updates.year
    const budget = await Budget.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    })
    if (!budget)
      return res.status(404).json({ success: false, error: 'Budget not found' })
    res.json({ success: true, budget })
  } catch (err) {
    if (err.name === 'CastError')
      return res.status(404).json({ success: false, error: 'Budget not found' })
    res.status(500).json({ success: false, error: err.message })
  }
})

router.delete('/budgets/:id', async (req, res) => {
  if (!dbReady()) return needDb(res)
  try {
    const budget = await Budget.findByIdAndDelete(req.params.id)
    if (!budget)
      return res.status(404).json({ success: false, error: 'Budget not found' })
    await logAudit({
      action: 'delete',
      entity: 'budget',
      entityId: String(budget._id),
      actor: req.user && req.user.email,
      detail: { month: budget.month, year: budget.year },
    })
    res.json({ success: true })
  } catch (err) {
    if (err.name === 'CastError')
      return res.status(404).json({ success: false, error: 'Budget not found' })
    res.status(500).json({ success: false, error: err.message })
  }
})

// Month proposals = submittedAt within [year-month-01, next month).
const monthRange = (year, month) => {
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 1)
  return { submittedAt: { $gte: start, $lt: end } }
}

router.get('/budgets/:id/report', async (req, res) => {
  if (!dbReady()) return needDb(res)
  try {
    const budget = await Budget.findById(req.params.id)
    if (!budget)
      return res.status(404).json({ success: false, error: 'Budget not found' })
    const prevMonth = budget.month === 1 ? 12 : budget.month - 1
    const prevYear = budget.month === 1 ? budget.year - 1 : budget.year
    const [monthProposals, prevMonthProposals] = await Promise.all([
      Proposal.find(monthRange(budget.year, budget.month)).lean(),
      Proposal.find(monthRange(prevYear, prevMonth)).lean(),
    ])
    res.json({
      success: true,
      report: budgetReport({ budget, monthProposals, prevMonthProposals }),
    })
  } catch (err) {
    if (err.name === 'CastError')
      return res.status(404).json({ success: false, error: 'Budget not found' })
    res.status(500).json({ success: false, error: err.message })
  }
})

// Copy a budget's figures into the following month (fails if it already exists).
router.post('/budgets/:id/copy-next', async (req, res) => {
  if (!dbReady()) return needDb(res)
  try {
    const src = await Budget.findById(req.params.id)
    if (!src)
      return res.status(404).json({ success: false, error: 'Budget not found' })
    const month = src.month === 12 ? 1 : src.month + 1
    const year = src.month === 12 ? src.year + 1 : src.year
    if (await Budget.exists({ month, year }))
      return res
        .status(400)
        .json({ success: false, error: 'Next month already has a budget' })
    const copy = pickBudget(src.toObject())
    copy.month = month
    copy.year = year
    const budget = await Budget.create(copy)
    res.status(201).json({ success: true, budget })
  } catch (err) {
    if (err.name === 'CastError')
      return res.status(404).json({ success: false, error: 'Budget not found' })
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── Bid templates & profile variants (simple owner-scoped CRUD) ──────────────

const simpleCrud = (model, label, fields) => {
  const r = express.Router()
  const pickFields = (b) => {
    const out = {}
    for (const k of fields) if (b[k] !== undefined) out[k] = b[k]
    return out
  }
  r.get('/', async (req, res) => {
    if (!dbReady()) return needDb(res)
    try {
      const items = await model.find().sort({ createdAt: -1 })
      res.json({ success: true, items })
    } catch (err) {
      res.status(500).json({ success: false, error: err.message })
    }
  })
  r.post('/', async (req, res) => {
    if (!dbReady()) return needDb(res)
    try {
      const item = await model.create(pickFields(req.body || {}))
      res.status(201).json({ success: true, item })
    } catch (err) {
      res.status(400).json({ success: false, error: err.message })
    }
  })
  r.put('/:id', async (req, res) => {
    if (!dbReady()) return needDb(res)
    try {
      const item = await model.findByIdAndUpdate(
        req.params.id,
        pickFields(req.body || {}),
        { new: true, runValidators: true },
      )
      if (!item)
        return res.status(404).json({ success: false, error: `${label} not found` })
      res.json({ success: true, item })
    } catch (err) {
      if (err.name === 'CastError')
        return res.status(404).json({ success: false, error: `${label} not found` })
      res.status(400).json({ success: false, error: err.message })
    }
  })
  r.delete('/:id', async (req, res) => {
    if (!dbReady()) return needDb(res)
    try {
      const item = await model.findByIdAndDelete(req.params.id)
      if (!item)
        return res.status(404).json({ success: false, error: `${label} not found` })
      res.json({ success: true })
    } catch (err) {
      if (err.name === 'CastError')
        return res.status(404).json({ success: false, error: `${label} not found` })
      res.status(500).json({ success: false, error: err.message })
    }
  })
  return r
}

router.use(
  '/bid-templates',
  simpleCrud(BidTemplate, 'Template', [
    'name', 'lane', 'openingText', 'fullTemplate', 'active',
  ]),
)
router.use(
  '/profile-variants',
  simpleCrud(ProfileVariant, 'Profile variant', [
    'title', 'descriptionVersion', 'activeFrom', 'activeTo', 'notes',
  ]),
)

// ── CSV import / export ──────────────────────────────────────────────────────

// Canonical columns: [field, header label].
const CSV_COLUMNS = [
  ['submittedAt', 'Submitted At'],
  ['jobPostedAt', 'Job Posted At'],
  ['jobTitle', 'Job Title'],
  ['jobUrl', 'Job URL'],
  ['jobCategory', 'Job Category'],
  ['serviceLane', 'Service Lane'],
  ['jobType', 'Job Type'],
  ['budgetType', 'Budget Type'],
  ['jobBudgetMin', 'Job Budget Min'],
  ['jobBudgetMax', 'Job Budget Max'],
  ['hourlyRateBid', 'Hourly Rate Bid'],
  ['fixedPriceBid', 'Fixed Price Bid'],
  ['requiredSkills', 'Required Skills'],
  ['proposalType', 'Proposal Type'],
  ['connectsUsed', 'Connects Used'],
  ['boostConnects', 'Boost Connects'],
  ['profileTitleUsed', 'Profile Title Used'],
  ['proposalTemplate', 'Proposal Template'],
  ['portfolioItemShared', 'Portfolio Item'],
  ['proposalStatus', 'Status'],
  ['clientName', 'Client Name'],
  ['clientCountry', 'Client Country'],
  ['clientTotalSpent', 'Client Total Spent'],
  ['clientHireRate', 'Client Hire Rate'],
  ['clientHasVerifiedPayment', 'Client Verified Payment'],
  ['contractValue', 'Contract Value'],
  ['contractCurrency', 'Contract Currency'],
  ['viewedAt', 'Viewed At'],
  ['repliedAt', 'Replied At'],
  ['interviewAt', 'Interview At'],
  ['offerAt', 'Offer At'],
  ['hiredAt', 'Hired At'],
  ['notes', 'Notes'],
]
const NUMERIC = new Set([
  'jobBudgetMin', 'jobBudgetMax', 'hourlyRateBid', 'fixedPriceBid',
  'connectsUsed', 'boostConnects', 'clientTotalSpent', 'clientHireRate',
  'contractValue',
])
const DATE_FIELDS = new Set([
  'submittedAt', 'jobPostedAt', 'viewedAt', 'repliedAt', 'interviewAt',
  'offerAt', 'hiredAt',
])

const fmtCsvValue = (field, value) => {
  if (value === undefined || value === null) return ''
  if (field === 'requiredSkills' && Array.isArray(value)) return value.join('; ')
  if (field === 'clientHasVerifiedPayment')
    return value === true ? 'yes' : value === false ? 'no' : ''
  if (DATE_FIELDS.has(field) && value) return new Date(value).toISOString().slice(0, 10)
  return value
}

// GET /proposals/export.csv — filtered export with CSV-injection-safe cells.
router.get('/proposals/export.csv', async (req, res) => {
  if (!dbReady()) return needDb(res)
  try {
    const filter = dateRangeFilter(req.query)
    if (req.query.status) filter.proposalStatus = req.query.status
    if (req.query.lane) filter.serviceLane = req.query.lane
    if (req.query.type) filter.proposalType = req.query.type
    const rows = await Proposal.find(filter).sort({ submittedAt: -1 }).lean()
    const header = CSV_COLUMNS.map(([, label]) => csvSafeCell(label)).join(',')
    const lines = rows.map((r) =>
      CSV_COLUMNS.map(([field]) => csvSafeCell(fmtCsvValue(field, r[field]))).join(','),
    )
    const csv = [header, ...lines].join('\r\n')
    await logAudit({
      action: 'export',
      entity: 'proposal',
      actor: req.user && req.user.email,
      detail: { count: rows.length, filter: req.query },
    })
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="proposals-export.csv"',
    )
    res.send(csv)
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// GET /proposals/import-template.csv — header-only template.
router.get('/proposals/import-template.csv', (req, res) => {
  const header = CSV_COLUMNS.map(([, label]) => csvSafeCell(label)).join(',')
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="proposals-import-template.csv"',
  )
  res.send(header + '\r\n')
})

const coerceImportRow = (raw) => {
  const byLabel = new Map(CSV_COLUMNS.map(([f, l]) => [l.toLowerCase(), f]))
  const out = {}
  for (const [key, val] of Object.entries(raw)) {
    const field = byLabel.get(String(key).trim().toLowerCase())
    if (!field) continue
    let v = typeof val === 'string' ? val.trim() : val
    if (v === '') continue
    if (NUMERIC.has(field)) {
      const n = Number(v)
      if (isFinite(n)) out[field] = n
    } else if (field === 'requiredSkills') {
      out[field] = String(v).split(/[;,]/).map((s) => s.trim()).filter(Boolean)
    } else if (field === 'clientHasVerifiedPayment') {
      const s = String(v).toLowerCase()
      if (['yes', 'true', '1'].includes(s)) out[field] = true
      else if (['no', 'false', '0'].includes(s)) out[field] = false
    } else if (DATE_FIELDS.has(field)) {
      const d = new Date(v)
      if (!isNaN(d.getTime())) out[field] = d
    } else {
      out[field] = v
    }
  }
  return out
}

// POST /proposals/import { csv } — validate, dedupe (jobUrl + submittedAt day),
// insert valid rows. Returns a per-row summary. Values are sanitized on export,
// not stored with formulas; import stores raw text.
router.post('/proposals/import', async (req, res) => {
  if (!dbReady()) return needDb(res)
  try {
    const csv = (req.body && req.body.csv) || ''
    if (typeof csv !== 'string' || !csv.trim())
      return res.status(400).json({ success: false, error: 'csv text is required' })
    let records
    try {
      records = parse(csv, { columns: true, skip_empty_lines: true, trim: true })
    } catch (e) {
      return res
        .status(400)
        .json({ success: false, error: 'Could not parse CSV: ' + e.message })
    }

    const dayKey = (url, date) =>
      `${String(url).trim()}|${new Date(date).toISOString().slice(0, 10)}`

    // Existing keys for duplicate detection (only rows that carry a jobUrl).
    const existing = await Proposal.find(
      { jobUrl: { $nin: [null, ''] } },
      { jobUrl: 1, submittedAt: 1 },
    ).lean()
    const existingKeys = new Set(
      existing.map((p) => dayKey(p.jobUrl, p.submittedAt)),
    )
    const seenInFile = new Set()

    const summary = { total: records.length, inserted: 0, duplicates: 0, failed: 0, errors: [] }
    const toInsert = []
    records.forEach((raw, i) => {
      const row = coerceImportRow(raw)
      row.source = 'CSV_IMPORT'
      const err = validateProposalInput(row)
      if (err) {
        summary.failed++
        summary.errors.push({ row: i + 2, error: err })
        return
      }
      if (row.jobUrl && row.submittedAt) {
        const k = dayKey(row.jobUrl, row.submittedAt)
        if (existingKeys.has(k) || seenInFile.has(k)) {
          summary.duplicates++
          return
        }
        seenInFile.add(k)
      }
      toInsert.push(row)
    })

    if (toInsert.length) {
      const docs = await Proposal.insertMany(toInsert, { ordered: false })
      summary.inserted = docs.length
    }
    await logAudit({
      action: 'import',
      entity: 'proposal',
      actor: req.user && req.user.email,
      detail: { inserted: summary.inserted, duplicates: summary.duplicates, failed: summary.failed },
    })
    res.json({ success: true, summary })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

module.exports = router
