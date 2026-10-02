// Bid Analytics module — shared helpers: default lanes + seeding, proposal
// input validation, a CSV-injection-safe cell escaper (used by the export phase),
// and a small audit-log writer. Metrics/analytics live in a later phase.
const { ServiceLane, BidAuditLog } = require('../models')

// The 8 default service lanes seeded on first use. Fully editable afterwards.
const DEFAULT_LANES = [
  'Apple and Google Wallet',
  'AI Agents',
  'GoHighLevel',
  'CRM Automation',
  'SaaS Development',
  'Mobile App Development',
  'General API Integration',
  'Other',
]

// Create the default lanes once, if the collection is empty. Idempotent and
// safe to call on every lanes fetch. Never throws out — a seed failure just
// leaves the list empty for the caller to handle.
const seedDefaultLanes = async () => {
  try {
    const count = await ServiceLane.estimatedDocumentCount()
    if (count > 0) return
    await ServiceLane.insertMany(
      DEFAULT_LANES.map((name, i) => ({ name, isDefault: true, order: i })),
      { ordered: false },
    )
  } catch (err) {
    // A unique-index race (two first-loads at once) is harmless — ignore dupes.
    if (err && err.code !== 11000) console.warn('[bidding] seed lanes:', err.message)
  }
}

const isValidHttpUrl = (s) => {
  try {
    const u = new URL(s)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

const isNonNegativeNumber = (v) => typeof v === 'number' && isFinite(v) && v >= 0

// Validate a proposal create/update payload. `partial` = true for PUT (only
// validate the fields that are present). Returns an error string, or null when
// the input is valid.
const validateProposalInput = (body, { partial = false } = {}) => {
  const b = body || {}
  const has = (k) => b[k] !== undefined && b[k] !== null && b[k] !== ''

  if (!partial || has('jobTitle')) {
    if (typeof b.jobTitle !== 'string' || !b.jobTitle.trim())
      return 'jobTitle is required'
  }
  if (!partial || has('serviceLane')) {
    if (typeof b.serviceLane !== 'string' || !b.serviceLane.trim())
      return 'serviceLane is required'
  }
  // Job URL is optional, but must be a valid URL when provided.
  if (has('jobUrl') && !isValidHttpUrl(String(b.jobUrl)))
    return 'jobUrl must be a valid http(s) URL'

  if (has('proposalType') && !['ORGANIC', 'BOOSTED'].includes(b.proposalType))
    return 'proposalType must be ORGANIC or BOOSTED'

  const connectsUsed = has('connectsUsed') ? Number(b.connectsUsed) : 0
  const boostConnects = has('boostConnects') ? Number(b.boostConnects) : 0
  if (has('connectsUsed') && !isNonNegativeNumber(connectsUsed))
    return 'connectsUsed cannot be negative'
  if (has('boostConnects') && !isNonNegativeNumber(boostConnects))
    return 'boostConnects cannot be negative'
  // Boost Connects cannot exceed total Connects used. On a partial update only
  // enforce when both are known (present in the payload).
  if (has('boostConnects') && has('connectsUsed') && boostConnects > connectsUsed)
    return 'boostConnects cannot exceed connectsUsed'

  if (has('contractValue')) {
    const cv = Number(b.contractValue)
    if (!isNonNegativeNumber(cv)) return 'contractValue cannot be negative'
  }

  // Hired status requires a hired date.
  if (b.proposalStatus === 'HIRED') {
    if (!has('hiredAt')) return 'HIRED status requires a hiredAt date'
  }

  return null
}

// Escape a value destined for a CSV cell so spreadsheet apps don't execute it as
// a formula (CSV/formula injection). Any cell starting with = + - @ (or a
// leading tab/CR, which some apps strip) is prefixed with a single quote.
const csvSafeCell = (value) => {
  if (value === undefined || value === null) return ''
  let s = String(value)
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
  // Standard CSV quoting for commas/quotes/newlines.
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"'
  return s
}

const logAudit = async ({ action, entity, entityId, actor, detail }) => {
  try {
    await BidAuditLog.create({ action, entity, entityId, actor, detail })
  } catch (err) {
    console.warn('[bidding] audit log failed:', err.message)
  }
}

// ── Analytics engine (pure functions over plain proposal objects) ────────────

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v))
// Divide with a zero/!finite guard — returns null so the UI can render "N/A".
const div = (a, b) => (b && b > 0 && isFinite(a) ? a / b : null)
const sum = (list, key) =>
  list.reduce((acc, p) => acc + (Number(p[key]) || 0), 0)

// Positive-progression status ranks. A proposal "reached" a stage if its stage
// timestamp is set OR its status has progressed to/past that stage.
const POS_RANK = {
  SUBMITTED: 1,
  VIEWED: 2,
  CLIENT_REPLIED: 3,
  INTERVIEW: 4,
  OFFER: 5,
  HIRED: 6,
}
const STAGE = {
  viewed: { ts: 'viewedAt', rank: 2 },
  replied: { ts: 'repliedAt', rank: 3 },
  interview: { ts: 'interviewAt', rank: 4 },
  offer: { ts: 'offerAt', rank: 5 },
  hired: { ts: 'hiredAt', rank: 6 },
}
const reached = (p, stage) => {
  const s = STAGE[stage]
  if (s.ts && p[s.ts]) return true
  return (POS_RANK[p.proposalStatus] || 0) >= s.rank
}
const isHired = (p) => reached(p, 'hired')

// The full count/rate/cost block for any list of proposals. Reused for the
// overall KPIs, the boosted/organic split, and every group breakdown.
const metricsFor = (list) => {
  const submitted = list.filter((p) => p.proposalStatus !== 'DRAFT')
  const n = submitted.length
  const views = submitted.filter((p) => reached(p, 'viewed')).length
  const replies = submitted.filter((p) => reached(p, 'replied')).length
  const interviews = submitted.filter((p) => reached(p, 'interview')).length
  const offers = submitted.filter((p) => reached(p, 'offer')).length
  const hires = submitted.filter((p) => reached(p, 'hired')).length
  const connects = sum(submitted, 'connectsUsed')
  const boostConnects = sum(submitted, 'boostConnects')
  const revenue = submitted
    .filter(isHired)
    .reduce((a, p) => a + (Number(p.contractValue) || 0), 0)
  return {
    proposals: n,
    connects,
    boostConnects,
    views,
    replies,
    interviews,
    offers,
    hires,
    revenue,
    avgConnects: div(connects, n),
    viewRate: div(views, n),
    replyRate: div(replies, n),
    interviewRate: div(interviews, n),
    offerRate: div(offers, n),
    hireRate: div(hires, n),
    replyAfterView: div(replies, views),
    hireAfterInterview: div(hires, interviews),
    revenuePerProposal: div(revenue, n),
    revenuePerConnect: div(revenue, connects),
    costPerView: div(connects, views),
    costPerReply: div(connects, replies),
    costPerInterview: div(connects, interviews),
    costPerHire: div(connects, hires),
  }
}

// Group a list by a key function, dropping empties into a shared label, and
// compute metricsFor each group. Sorted by proposal count desc.
const groupMetrics = (list, keyFn, emptyLabel = '(none)') => {
  const groups = new Map()
  for (const p of list) {
    const k = keyFn(p) || emptyLabel
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(p)
  }
  return [...groups.entries()]
    .map(([key, items]) => ({ key, ...metricsFor(items) }))
    .sort((a, b) => b.proposals - a.proposals)
}

// Monday (local) of a date's ISO week, as YYYY-MM-DD.
const weekStart = (d) => {
  const dt = new Date(d)
  const day = (dt.getDay() + 6) % 7 // 0 = Monday
  dt.setHours(0, 0, 0, 0)
  dt.setDate(dt.getDate() - day)
  return dt.toISOString().slice(0, 10)
}

// Per-week series for the charts. Each event counts in the week of its own date:
// proposals + connects by submittedAt, views/replies/hires + revenue by their
// stage timestamps (falling back to submittedAt only when the stage is reached
// but has no explicit timestamp).
const weeklySeries = (list) => {
  const weeks = new Map()
  const bump = (wk, field, by = 1) => {
    if (!wk) return
    if (!weeks.has(wk))
      weeks.set(wk, {
        week: wk,
        proposals: 0,
        connects: 0,
        views: 0,
        replies: 0,
        hires: 0,
        revenue: 0,
      })
    weeks.get(wk)[field] += by
  }
  for (const p of list) {
    if (p.proposalStatus === 'DRAFT') continue
    const sub = p.submittedAt ? weekStart(p.submittedAt) : null
    bump(sub, 'proposals')
    bump(sub, 'connects', Number(p.connectsUsed) || 0)
    if (reached(p, 'viewed')) bump(weekStart(p.viewedAt || p.submittedAt), 'views')
    if (reached(p, 'replied'))
      bump(weekStart(p.repliedAt || p.submittedAt), 'replies')
    if (isHired(p)) {
      const hw = weekStart(p.hiredAt || p.submittedAt)
      bump(hw, 'hires')
      bump(hw, 'revenue', Number(p.contractValue) || 0)
    }
  }
  return [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week))
}

const timeToApplyReport = (list) => {
  const rows = []
  for (const p of list) {
    if (!p.jobPostedAt || !p.submittedAt) continue
    const hours =
      (new Date(p.submittedAt) - new Date(p.jobPostedAt)) / 3600000
    if (!isFinite(hours) || hours < 0) continue
    rows.push({ hours, hired: isHired(p), replied: reached(p, 'replied') })
  }
  const buckets = [
    { label: 'Under 1h', min: 0, max: 1 },
    { label: '1–6h', min: 1, max: 6 },
    { label: '6–24h', min: 6, max: 24 },
    { label: 'Over 24h', min: 24, max: Infinity },
  ].map((b) => {
    const inB = rows.filter((r) => r.hours >= b.min && r.hours < b.max)
    return {
      label: b.label,
      proposals: inB.length,
      hires: inB.filter((r) => r.hired).length,
      replies: inB.filter((r) => r.replied).length,
      hireRate: div(inB.filter((r) => r.hired).length, inB.length),
      replyRate: div(inB.filter((r) => r.replied).length, inB.length),
    }
  })
  return {
    sampleSize: rows.length,
    avgHours: rows.length ? sum(rows, 'hours') / rows.length : null,
    buckets,
  }
}

// The full analytics payload for a (date-filtered) proposal list.
const computeAnalytics = (list) => {
  const boosted = list.filter((p) => p.proposalType === 'BOOSTED')
  const organic = list.filter((p) => p.proposalType === 'ORGANIC')
  const verifiedLabel = (p) =>
    p.clientHasVerifiedPayment === true
      ? 'Verified'
      : p.clientHasVerifiedPayment === false
        ? 'Unverified'
        : 'Unknown'
  return {
    totalProposals: list.length,
    kpis: metricsFor(list),
    boostedVsOrganic: { boosted: metricsFor(boosted), organic: metricsFor(organic) },
    byLane: groupMetrics(list, (p) => p.serviceLane),
    byProfile: groupMetrics(list, (p) => p.profileTitleUsed),
    byTemplate: groupMetrics(list, (p) => p.proposalTemplate),
    byPortfolio: groupMetrics(list, (p) => p.portfolioItemShared),
    clientQuality: {
      byCountry: groupMetrics(list, (p) => p.clientCountry, 'Unknown'),
      byVerifiedPayment: groupMetrics(list, verifiedLabel),
      byBudgetType: groupMetrics(list, (p) => p.budgetType || 'UNKNOWN'),
      byJobType: groupMetrics(list, (p) => p.jobType, 'Unknown'),
    },
    timeToApply: timeToApplyReport(list),
    weekly: weeklySeries(list),
  }
}

// Data-driven recommendations. Every item carries its sample size, and nothing
// is emitted from a sample below its rule's threshold.
const computeRecommendations = (list) => {
  const recs = []
  const boosted = metricsFor(list.filter((p) => p.proposalType === 'BOOSTED'))
  const organic = metricsFor(list.filter((p) => p.proposalType === 'ORGANIC'))
  const overall = metricsFor(list)

  // 1. Organic view rate beats boosted by >= 20 pts (both samples >= 20).
  if (
    boosted.proposals >= 20 &&
    organic.proposals >= 20 &&
    organic.viewRate != null &&
    boosted.viewRate != null &&
    organic.viewRate - boosted.viewRate >= 0.2
  ) {
    recs.push({
      type: 'reduce-boosting',
      level: 'suggest',
      message:
        'Organic proposals get views at a meaningfully higher rate than boosted ones. Consider reducing boosting.',
      sampleSize: boosted.proposals + organic.proposals,
    })
  }

  // 5 (organic outperforming — overall hire rate too).
  if (
    boosted.proposals >= 20 &&
    organic.proposals >= 20 &&
    organic.hireRate != null &&
    boosted.hireRate != null &&
    organic.hireRate > boosted.hireRate
  ) {
    recs.push({
      type: 'organic-outperforms',
      level: 'info',
      message: 'Organic proposals are outperforming boosted proposals on hire rate.',
      sampleSize: boosted.proposals + organic.proposals,
    })
  }

  // 2 & 3. Lane-level rules.
  for (const lane of groupMetrics(list, (p) => p.serviceLane)) {
    if (lane.proposals >= 20 && lane.replies === 0) {
      recs.push({
        type: 'lane-no-replies',
        level: 'warn',
        message: `Lane "${lane.key}" has ${lane.proposals} proposals and zero replies — review job selection or proposal relevance.`,
        sampleSize: lane.proposals,
      })
    }
    if (lane.hires >= 3) {
      recs.push({
        type: 'proven-lane',
        level: 'good',
        message: `Lane "${lane.key}" is a proven lane (${lane.hires} hires).`,
        sampleSize: lane.proposals,
      })
    }
  }

  // 4. Strong templates: >= 20 uses and reply rate above the overall average.
  if (overall.replyRate != null) {
    for (const t of groupMetrics(list, (p) => p.proposalTemplate)) {
      if (t.key === '(none)') continue
      if (t.proposals >= 20 && t.replyRate != null && t.replyRate > overall.replyRate) {
        recs.push({
          type: 'strong-template',
          level: 'good',
          message: `Template "${t.key}" has a higher reply rate than your average.`,
          sampleSize: t.proposals,
        })
      }
    }
  }

  // 6. Client country: high views but low reply-after-view (>= 20 proposals).
  for (const c of groupMetrics(list, (p) => p.clientCountry, 'Unknown')) {
    if (
      c.proposals >= 20 &&
      c.viewRate != null &&
      c.viewRate >= 0.5 &&
      c.replyAfterView != null &&
      c.replyAfterView < 0.1
    ) {
      recs.push({
        type: 'improve-openings',
        level: 'suggest',
        message: `Clients in "${c.key}" view your proposals but rarely reply — improve your proposal openings for this segment.`,
        sampleSize: c.proposals,
      })
    }
  }

  // 7. Views low across the board.
  if (overall.proposals >= 20 && overall.viewRate != null && overall.viewRate < 0.2) {
    recs.push({
      type: 'low-visibility',
      level: 'warn',
      message:
        'View rate is low across all lanes — review profile visibility and proposal timing.',
      sampleSize: overall.proposals,
    })
  }

  return recs
}

// Connects ledger balance from a list of transactions.
const CONNECTS_SIGN = {
  PURCHASE: 1,
  MONTHLY_ALLOCATION: 1,
  BONUS: 1,
  REFUND: 1,
  SPENT: -1,
  ADJUSTMENT: 1, // amount is signed as entered
}
const connectsBalance = (txns) => {
  let balance = 0
  let purchased = 0
  let spent = 0
  let amountPaid = 0
  for (const t of txns) {
    const sign = CONNECTS_SIGN[t.transactionType] ?? 1
    const amt = (Number(t.connectsAmount) || 0) * sign
    balance += amt
    if (t.transactionType === 'SPENT') spent += Number(t.connectsAmount) || 0
    else if (amt > 0) purchased += amt
    amountPaid += Number(t.amountPaid) || 0
  }
  return { balance, purchased, spent, amountPaid }
}

// Monthly budget report + warnings for a given (year, month), the matching
// Budget doc (or null), the month's proposals, and the previous month's
// proposals (for the "cost-per-hire increasing" trend).
const budgetReport = ({ budget, monthProposals, prevMonthProposals = [] }) => {
  const m = metricsFor(monthProposals)
  const organicUsed = sum(
    monthProposals.filter((p) => p.proposalType === 'ORGANIC'),
    'connectsUsed',
  )
  const boostedUsed = sum(
    monthProposals.filter((p) => p.proposalType === 'BOOSTED'),
    'connectsUsed',
  )
  const total = budget ? Number(budget.totalConnectsBudget) || 0 : 0
  const utilization = div(m.connects, total)
  const warnings = []

  if (utilization != null && utilization >= 0.8)
    warnings.push(
      `You have used ${Math.round(utilization * 100)}% of your monthly Connects budget.`,
    )
  if (
    budget &&
    Number(budget.boostedConnectsBudget) > 0 &&
    boostedUsed > Number(budget.boostedConnectsBudget)
  )
    warnings.push('Boosted spending is above your configured limit.')

  const prevCostPerHire = metricsFor(prevMonthProposals).costPerHire
  if (
    m.costPerHire != null &&
    prevCostPerHire != null &&
    m.costPerHire > prevCostPerHire
  )
    warnings.push('Your average Connects per hire is increasing.')

  return {
    totalConnectsBudget: total,
    connectsUsed: m.connects,
    remaining: total - m.connects,
    organicConnectsUsed: organicUsed,
    boostedConnectsUsed: boostedUsed,
    utilization,
    revenue: m.revenue,
    hires: m.hires,
    costPerHire: m.costPerHire,
    onTrack: total === 0 ? null : m.connects <= total,
    targets: budget
      ? {
          proposals: budget.targetProposals,
          interviews: budget.targetInterviews,
          hires: budget.targetHires,
          revenue: budget.targetRevenue,
        }
      : null,
    progress: { proposals: m.proposals, interviews: m.interviews, hires: m.hires, revenue: m.revenue },
    warnings,
  }
}

module.exports = {
  DEFAULT_LANES,
  seedDefaultLanes,
  isValidHttpUrl,
  validateProposalInput,
  csvSafeCell,
  logAudit,
  // analytics
  metricsFor,
  computeAnalytics,
  computeRecommendations,
  connectsBalance,
  budgetReport,
  reached,
  isHired,
}
