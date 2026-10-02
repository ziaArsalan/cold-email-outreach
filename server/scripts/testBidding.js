/*
 * Bid Analytics module test suite.
 *
 *   node scripts/testBidding.js
 *
 * Self-contained: spins up an in-process Express app with the real router behind
 * the real auth middleware, against a THROWAWAY local database, runs unit
 * (analytics math) + integration (endpoint) checks, then drops the database.
 *
 * SAFETY: this never uses the project .env or a remote host. It forces a local
 * mongod and refuses anything else, so it can never touch production data.
 */
const express = require('express')
const mongoose = require('mongoose')

// Force a local, throwaway DB. Refuse a non-local override outright.
const envUri = process.env.MONGODB_URI
if (envUri && !/^mongodb:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(envUri)) {
  console.error('Refusing to run against a non-local MONGODB_URI:', envUri)
  process.exit(1)
}
const DB_URI = 'mongodb://localhost:27017/bidding_test'
process.env.JWT_SECRET = process.env.JWT_SECRET || 'bidding-test-secret'
process.env.AUTH_EMAIL = 'tester@local'
process.env.AUTH_PASSWORD = 'local'

const { requireAuth, signToken } = require('../services/authService')
const biddingRouter = require('../routes/bidding')
const { Proposal } = require('../models')
const svc = require('../services/biddingService')

let passed = 0
let failed = 0
const ok = (name, cond, extra) => {
  if (cond) {
    passed++
    console.log('  ✓', name)
  } else {
    failed++
    console.log('  ✗', name, extra != null ? '→ ' + JSON.stringify(extra) : '')
  }
}
const approx = (a, b, eps = 1e-6) => a != null && Math.abs(a - b) < eps

async function main() {
  await mongoose.connect(DB_URI, { serverSelectionTimeoutMS: 5000 })
  // Start from a clean slate every run.
  await mongoose.connection.dropDatabase()

  const now = new Date()

  console.log('\n[unit] metricsFor')
  const L = [
    { proposalStatus: 'HIRED', viewedAt: now, repliedAt: now, interviewAt: now, hiredAt: now, connectsUsed: 10, contractValue: 1000, proposalType: 'ORGANIC' },
    { proposalStatus: 'VIEWED', viewedAt: now, connectsUsed: 6, boostConnects: 4, proposalType: 'BOOSTED' },
    { proposalStatus: 'SUBMITTED', connectsUsed: 4, proposalType: 'ORGANIC' },
    { proposalStatus: 'DRAFT', connectsUsed: 100, proposalType: 'ORGANIC' },
  ]
  const m = svc.metricsFor(L)
  ok('drafts excluded (proposals=3)', m.proposals === 3, m.proposals)
  ok('views=2, replies=1, hires=1', m.views === 2 && m.replies === 1 && m.hires === 1)
  ok('connects=20', m.connects === 20, m.connects)
  ok('viewRate=2/3', approx(m.viewRate, 2 / 3))
  ok('revenuePerConnect=50', m.revenuePerConnect === 50)
  ok('costPerHire=20', m.costPerHire === 20)

  console.log('\n[unit] zero-denominator → N/A (null)')
  const z = svc.metricsFor([])
  ok('viewRate null', z.viewRate === null)
  ok('revenuePerConnect null', z.revenuePerConnect === null)
  ok('costPerHire null', z.costPerHire === null)

  console.log('\n[unit] recommendations (sample thresholds)')
  const recL = []
  for (let i = 0; i < 20; i++) recL.push({ proposalStatus: 'SUBMITTED', serviceLane: 'DeadLane', connectsUsed: 2, proposalType: 'ORGANIC' })
  for (let i = 0; i < 3; i++) recL.push({ proposalStatus: 'HIRED', hiredAt: now, serviceLane: 'WinLane', connectsUsed: 5, proposalType: 'ORGANIC' })
  const recs = svc.computeRecommendations(recL)
  ok('lane with 20 proposals & 0 replies warned', recs.some((r) => r.type === 'lane-no-replies'))
  ok('lane with 3 hires marked proven', recs.some((r) => r.type === 'proven-lane'))
  ok('all recs carry sampleSize', recs.every((r) => typeof r.sampleSize === 'number'))

  console.log('\n[unit] connectsBalance + budgetReport')
  const bal = svc.connectsBalance([
    { transactionType: 'PURCHASE', connectsAmount: 100 },
    { transactionType: 'SPENT', connectsAmount: 30 },
    { transactionType: 'REFUND', connectsAmount: 5 },
  ])
  ok('balance=75', bal.balance === 75, bal.balance)
  const br = svc.budgetReport({
    budget: { totalConnectsBudget: 100, boostedConnectsBudget: 10 },
    monthProposals: [
      { proposalStatus: 'SUBMITTED', connectsUsed: 85, proposalType: 'ORGANIC' },
      { proposalStatus: 'SUBMITTED', connectsUsed: 15, proposalType: 'BOOSTED' },
    ],
  })
  ok('utilization=1.0', br.utilization === 1)
  ok('warns 80% + boosted-over-limit', br.warnings.length >= 2, br.warnings)

  // ── integration ──
  const app = express()
  app.use(express.json({ limit: '25mb' }))
  app.use('/api/bidding', requireAuth, biddingRouter)
  const server = app.listen(0)
  const base = `http://localhost:${server.address().port}/api/bidding`
  const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + signToken('tester@local') }
  const call = async (method, path, body) => {
    const res = await fetch(base + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined })
    const ct = res.headers.get('content-type') || ''
    return { status: res.status, data: ct.includes('json') ? await res.json() : await res.text() }
  }

  console.log('\n[integration] auth + lanes + proposal CRUD')
  const noAuth = await fetch(base + '/lanes')
  ok('unauthenticated → 401', noAuth.status === 401)
  const lanes = await call('GET', '/lanes')
  ok('lanes seed 8 defaults', lanes.data.lanes.length === 8, lanes.data.lanes.length)
  const dupLane = await call('POST', '/lanes', { name: 'ai agents' })
  ok('duplicate lane (case-insensitive) rejected', dupLane.status === 400)
  const badBoost = await call('POST', '/proposals', { jobTitle: 'X', serviceLane: 'AI Agents', connectsUsed: 5, boostConnects: 9 })
  ok('boost>used rejected', badBoost.status === 400)
  const created = await call('POST', '/proposals', { jobTitle: 'Job', serviceLane: 'AI Agents', connectsUsed: 8, proposalType: 'BOOSTED' })
  ok('create proposal 201 + source MANUAL', created.status === 201 && created.data.proposal.source === 'MANUAL')
  const pid = created.data.proposal._id
  const st = await call('POST', `/proposals/${pid}/status`, { status: 'VIEWED' })
  ok('status→VIEWED stamps viewedAt', !!st.data.proposal.viewedAt)

  console.log('\n[integration] analytics + CSV + connects + budget')
  const an = await call('GET', '/analytics')
  ok('analytics payload shape', !!an.data.analytics.kpis && !!an.data.analytics.byLane)
  await Proposal.create({ jobTitle: '=danger()', serviceLane: 'Other', connectsUsed: 1, proposalStatus: 'SUBMITTED', submittedAt: now })
  const exp = await call('GET', '/proposals/export.csv')
  ok('CSV export escapes formula cell', typeof exp.data === 'string' && exp.data.includes("'=danger()"))
  const conn = await call('POST', '/connects', { transactionType: 'PURCHASE', connectsAmount: 50, amountPaid: 5 })
  ok('connects create 201', conn.status === 201)
  const mo = now.getMonth() + 1
  const bud = await call('POST', '/budgets', { month: mo, year: now.getFullYear(), totalConnectsBudget: 100 })
  ok('budget create 201', bud.status === 201)
  const rep = await call('GET', `/budgets/${bud.data.budget._id}/report`)
  ok('budget report returns warnings array', Array.isArray(rep.data.report.warnings))

  server.close()
  await mongoose.connection.dropDatabase()
  await mongoose.disconnect()
  console.log(`\nRESULT: ${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
