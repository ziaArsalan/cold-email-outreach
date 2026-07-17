const express = require('express')
const router = express.Router()
const {
  fetchPendingLeads,
  fetchAllLeads,
  updateLeadStatus,
  saveGeneratedEmail,
} = require('../services/sheetsService')
const { generateEmail, generateIntro } = require('../services/aiService')
const { sendEmail, verifyConnection } = require('../services/emailService')
const { fetchJobRows, updateCoverLetter } = require('../services/upworkSheet')
const { generateProposal } = require('../services/proposalService')
const {
  readConfig,
  writeConfig,
  readDailyCount,
} = require('../services/upworkConfigStore')
const { fetchJobs } = require('../services/upworkFetch')
const {
  verifyCredentials,
  signToken,
  requireAuth,
} = require('../services/authService')
const config = require('../jobs/config')
const mongoose = require('mongoose')
const { Lead, List, Template, Mailbox, Campaign, QueuedEmail, SendLog } = require('../models')
const { upsertLeadsIntoList } = require('../services/leadImportService')
const sheetsService = require('../services/sheetsService')
const { parse } = require('csv-parse/sync')
const { render } = require('../services/templateService')
const campaignService = require('../services/campaignService')
const settingsService = require('../services/settingsService')
const {
  sanitize,
  pause,
  resume,
  effectiveDailyCap,
} = require('../services/mailboxService')
const { providerFor } = require('../services/smtp')
const { domainMismatch } = require('../services/deliverabilityService')

// Public login route — issues a JWT for valid credentials
router.post('/auth/login', (req, res) => {
  const { email, password } = req.body || {}
  if (!email || !password || !verifyCredentials(email, password))
    return res
      .status(401)
      .json({ success: false, error: 'Invalid credentials' })
  res.json({ success: true, token: signToken(email) })
})

// All routes below this line require a valid token
router.use(requireAuth)

// Global job state
let jobState = {
  running: false,
  total: 0,
  processed: 0,
  success: 0,
  failed: 0,
  skipped: 0,
  logs: [],
  startedAt: null,
  finishedAt: null,
}

const addLog = (type, message) => {
  const entry = { type, message, time: new Date().toISOString() }
  jobState.logs.unshift(entry) // newest first
  if (jobState.logs.length > 200) jobState.logs.pop() // cap at 200
  console.log(`[${type.toUpperCase()}] ${message}`)
}

// GET /api/leads — fetch all leads for dashboard
router.get('/leads', async (req, res) => {
  try {
    const leads = await fetchAllLeads()
    res.json({ success: true, leads })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// GET /api/status — current job state
router.get('/status', (req, res) => {
  res.json(jobState)
})

// POST /api/preview — return cached email if exists, otherwise generate and save
router.post('/preview', async (req, res) => {
  const { lead } = req.body
  if (!lead)
    return res.status(400).json({ success: false, error: 'Lead data required' })
  try {
    // Return cached version if already generated — no AI call needed
    if (lead.generatedEmail) {
      return res.json({
        success: true,
        email: lead.generatedEmail,
        cached: true,
      })
    }
    // Generate fresh email via AI
    const email = await generateEmail(lead)
    // console.log('EMAIL', email)
    // Save to sheet column G so it is never regenerated
    await saveGeneratedEmail(lead.rowIndex, email)
    res.json({ success: true, email, cached: false })
  } catch (err) {
    console.log('Error Message', err)
    res.status(500).json({ success: false, error: err.message })
  }
})

// POST /api/test-smtp — verify SMTP connection
router.post('/test-smtp', async (req, res) => {
  try {
    await verifyConnection()
    res.json({ success: true, message: 'SMTP connection verified' })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// POST /api/start — DEPRECATED. Leads now flow through campaigns (/api/campaigns).
router.post('/start', (req, res) => {
  res
    .status(410)
    .json({ success: false, error: 'Deprecated — use campaigns (/api/campaigns)' })
})

// POST /api/send-email — send email for a single lead
router.post('/send-email', async (req, res) => {
  const { lead } = req.body
  if (!lead)
    return res.status(400).json({ success: false, error: 'Lead data required' })

  try {
    // Get email (cached or generate)
    let subject, body
    if (lead.generatedEmail) {
      ;({ subject, body } = lead.generatedEmail)
      addLog('info', `Using cached email for ${lead.name}`)
    } else {
      addLog('info', `Generating email for ${lead.name}...`)
      ;({ subject, body } = await generateEmail(lead))
      // Save to sheet so it is never regenerated
      await saveGeneratedEmail(lead.rowIndex, { subject, body })
    }

    // Send email
    addLog('info', `Sending email to ${lead.email}...`)
    await sendEmail({ to: lead.email, subject, body })

    // Update sheet status
    await updateLeadStatus(lead.rowIndex, 'Emailed')

    addLog(
      'success',
      `Emailed ${lead.name} at ${lead.email} — Subject: "${subject}"`,
    )

    res.json({
      success: true,
      message: `Email sent to ${lead.email}`,
      email: { subject, body },
    })
  } catch (err) {
    addLog('error', `Failed to send email to ${lead.email}: ${err.message}`)
    res.status(500).json({ success: false, error: err.message })
  }
})

// POST /api/stop — stop the job (sets flag; graceful stop after current lead)
router.post('/stop', (req, res) => {
  jobState.running = false
  addLog('info', 'Job manually stopped.')
  res.json({ success: true, message: 'Job stop requested' })
})

// ── Upwork dashboard routes ──

// GET /api/upwork/settings — current effective settings (stored ?? live config)
router.get('/upwork/settings', (req, res) => {
  const stored = readConfig()
  res.json({
    success: true,
    settings: {
      actorId: stored.actorId || config.ACTOR_ID,
      keywords: stored.keywords || config.KEYWORDS.join(','),
      cronInterval: stored.cronInterval || config.CRON_INTERVAL,
      autoCover: stored.autoCover ?? config.AUTO_COVER,
      cronEnabled: stored.cronEnabled ?? false,
      scheduleEnabled: stored.scheduleEnabled ?? false,
      scheduleStart: stored.scheduleStart || '09:00',
      scheduleEnd: stored.scheduleEnd || '18:00',
      dailyLimit: stored.dailyLimit ?? 0,
    },
  })
})

// POST /api/upwork/settings — persist UI-editable settings
router.post('/upwork/settings', (req, res) => {
  const {
    actorId,
    keywords,
    cronInterval,
    autoCover,
    cronEnabled,
    scheduleEnabled,
    scheduleStart,
    scheduleEnd,
    dailyLimit,
  } = req.body || {}

  if (typeof actorId !== 'string' || !actorId.trim())
    return res
      .status(400)
      .json({ success: false, error: 'actorId must be a non-empty string' })
  if (typeof keywords !== 'string' || !keywords.trim())
    return res
      .status(400)
      .json({ success: false, error: 'keywords must be a non-empty string' })
  if (typeof cronInterval !== 'string' || !cronInterval.trim())
    return res
      .status(400)
      .json({
        success: false,
        error: 'cronInterval must be a non-empty string',
      })
  if (typeof autoCover !== 'boolean')
    return res
      .status(400)
      .json({ success: false, error: 'autoCover must be a boolean' })
  if (typeof cronEnabled !== 'boolean')
    return res
      .status(400)
      .json({ success: false, error: 'cronEnabled must be a boolean' })
  if (typeof scheduleEnabled !== 'boolean')
    return res
      .status(400)
      .json({ success: false, error: 'scheduleEnabled must be a boolean' })
  if (typeof scheduleStart !== 'string' || !/^\d{2}:\d{2}$/.test(scheduleStart))
    return res
      .status(400)
      .json({ success: false, error: 'scheduleStart must be HH:MM' })
  if (typeof scheduleEnd !== 'string' || !/^\d{2}:\d{2}$/.test(scheduleEnd))
    return res
      .status(400)
      .json({ success: false, error: 'scheduleEnd must be HH:MM' })
  if (typeof dailyLimit !== 'number' || dailyLimit < 0)
    return res
      .status(400)
      .json({ success: false, error: 'dailyLimit must be a number >= 0' })

  // Spread current config first so dailyCount/dailyCountDate are preserved.
  const current = readConfig()
  const settings = {
    actorId,
    keywords,
    cronInterval,
    autoCover,
    cronEnabled,
    scheduleEnabled,
    scheduleStart,
    scheduleEnd,
    dailyLimit,
  }
  try {
    writeConfig({ ...current, ...settings })
    res.json({ success: true, settings })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── Outreach V2 settings (portal-editable worker/delay/verification tunables) ──
// UNITS CONTRACT: the server stores and validates everything in ms/integers. The
// client converts (minutes↔ms, seconds↔ms) and always sends ms on the wire. No
// secret/infra fields are ever exposed here (by construction of OutreachSetting).

const isPosInt = (n) => Number.isInteger(n) && n > 0

// GET /api/outreach-settings — current effective settings (stored ?? env ?? default).
// Always 200: getFresh falls back to env defaults when Mongo is down.
router.get('/outreach-settings', async (req, res) => {
  const settings = await settingsService.getFresh()
  res.json({ success: true, settings })
})

// PUT /api/outreach-settings — partial update; only provided fields are $set.
router.put('/outreach-settings', async (req, res) => {
  const body = req.body || {}
  const patch = {}
  const bad = (error) => res.status(400).json({ success: false, error })

  if ('queueWorkerEnabled' in body) {
    if (typeof body.queueWorkerEnabled !== 'boolean')
      return bad('queueWorkerEnabled must be a boolean')
    patch.queueWorkerEnabled = body.queueWorkerEnabled
  }

  if ('sendMode' in body) {
    if (!['warmup', 'production'].includes(body.sendMode))
      return bad('sendMode must be one of: warmup, production')
    patch.sendMode = body.sendMode
  }

  if ('delays' in body) {
    const d = body.delays
    if (!d || typeof d !== 'object')
      return bad('delays must be an object with warmup and production ranges')
    for (const mode of ['warmup', 'production']) {
      const r = d[mode]
      if (!r || typeof r !== 'object')
        return bad(`delays.${mode} must be an object with minMs and maxMs`)
      if (!isPosInt(r.minMs) || !isPosInt(r.maxMs))
        return bad(`delays.${mode}.minMs and maxMs must be positive integers`)
      if (r.minMs > r.maxMs)
        return bad(`delays.${mode}.minMs must be <= maxMs`)
    }
    patch.delays = {
      warmup: { minMs: d.warmup.minMs, maxMs: d.warmup.maxMs },
      production: { minMs: d.production.minMs, maxMs: d.production.maxMs },
    }
  }

  if ('maxRetries' in body) {
    if (!Number.isInteger(body.maxRetries) || body.maxRetries < 0 || body.maxRetries > 10)
      return bad('maxRetries must be an integer between 0 and 10')
    patch.maxRetries = body.maxRetries
  }

  if ('workerIdleMs' in body) {
    if (
      !Number.isInteger(body.workerIdleMs) ||
      body.workerIdleMs < 1000 ||
      body.workerIdleMs > 600000
    )
      return bad('workerIdleMs must be an integer between 1000 and 600000')
    patch.workerIdleMs = body.workerIdleMs
  }

  if ('warmupWeeks' in body) {
    const w = body.warmupWeeks
    if (!Array.isArray(w) || w.length !== 4)
      return bad('warmupWeeks must be an array of exactly 4 rows')
    for (const row of w) {
      if (!row || typeof row !== 'object')
        return bad('each warmupWeeks row must be an object with week, min, max')
      const ok = ['week', 'min', 'max'].every(
        (k) => Number.isInteger(row[k]) && row[k] >= 0,
      )
      if (!ok)
        return bad('warmupWeeks week/min/max must be non-negative integers')
      if (row.min > row.max)
        return bad('warmupWeeks min must be <= max')
    }
    patch.warmupWeeks = w.map((r) => ({ week: r.week, min: r.min, max: r.max }))
  }

  if ('emailVerification' in body) {
    const ev = body.emailVerification
    if (!ev || typeof ev !== 'object')
      return bad('emailVerification must be an object of three booleans')
    for (const k of ['checkMX', 'blockDisposable', 'blockRoleBased']) {
      if (typeof ev[k] !== 'boolean')
        return bad(`emailVerification.${k} must be a boolean`)
    }
    patch.emailVerification = {
      checkMX: ev.checkMX,
      blockDisposable: ev.blockDisposable,
      blockRoleBased: ev.blockRoleBased,
    }
  }

  try {
    const settings = await settingsService.set(patch)
    res.json({ success: true, settings })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// GET /api/upwork/jobs — all job rows from the jobs sheet
router.get('/upwork/jobs', async (req, res) => {
  try {
    const jobs = await fetchJobRows()
    res.json({ success: true, jobs })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// GET /api/upwork/stats — aggregate stats for the dashboard
router.get('/upwork/stats', async (req, res) => {
  try {
    const stored = readConfig()
    const rows = await fetchJobRows()
    const stats = {
      totalJobs: rows.length,
      coverLettersGenerated: rows.filter(
        (r) => r.coverLetter && r.coverLetter.trim(),
      ).length,
      activeActor: stored.actorId || config.ACTOR_ID,
      dailyCount: readDailyCount(),
      dailyLimit: readConfig().dailyLimit ?? 0,
    }
    res.json({ success: true, stats })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// POST /api/upwork/generate-cover — generate + persist a cover letter for one row
router.post('/upwork/generate-cover', async (req, res) => {
  const { rowIndex } = req.body || {}
  if (typeof rowIndex !== 'number')
    return res
      .status(400)
      .json({ success: false, error: 'rowIndex must be a number' })

  try {
    const rows = await fetchJobRows()
    const row = rows.find((r) => r.rowIndex === rowIndex)
    if (!row)
      return res.status(404).json({ success: false, error: 'Row not found' })

    const jobObj = {
      title: row.title,
      description: '',
      skills: row.skills ? row.skills.split(',').map((s) => s.trim()) : [],
      clientCountry: row.clientCountry,
    }

    const letter = await generateProposal(jobObj)
    await updateCoverLetter(rowIndex, letter)
    res.json({ success: true, coverLetter: letter, rowIndex })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// POST /api/upwork/test-query — run a live fetch for one keyword (no append/persist)
router.post('/upwork/test-query', async (req, res) => {
  try {
    const live = readConfig()
    const keywords = live.keywords
      ? live.keywords
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean)
      : config.KEYWORDS
    const keyword =
      (req.body.keyword && req.body.keyword.trim()) ||
      keywords[0] ||
      'GoHighLevel'
    const jobs = await fetchJobs(keyword)
    const result = jobs.map((j) => ({
      title: j.title || '',
      url: j.url || '',
      skills: Array.isArray(j.skills)
        ? j.skills
        : (j.skills || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
      clientCountry: j.clientCountry || '',
      applicants: j.applicants || 0,
    }))
    res.json({ success: true, keyword, count: result.length, jobs: result })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── Templates + AI intro personalization (Mongo-backed) ──

const dbReady = () => mongoose.connection.readyState === 1

// GET /api/templates — all templates, newest first
router.get('/templates', async (req, res) => {
  if (!dbReady())
    return res
      .status(503)
      .json({ success: false, error: 'Database unavailable' })
  try {
    const templates = await Template.find().sort({ createdAt: -1 })
    res.json({ success: true, templates })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// POST /api/templates — create a template
router.post('/templates', async (req, res) => {
  if (!dbReady())
    return res
      .status(503)
      .json({ success: false, error: 'Database unavailable' })
  try {
    const { name, subject, body, signature, active } = req.body || {}
    if (typeof name !== 'string' || !name.trim())
      return res
        .status(400)
        .json({ success: false, error: 'name must be a non-empty string' })
    if (typeof subject !== 'string' || !subject.trim())
      return res
        .status(400)
        .json({ success: false, error: 'subject must be a non-empty string' })
    if (typeof body !== 'string' || !body.trim())
      return res
        .status(400)
        .json({ success: false, error: 'body must be a non-empty string' })
    if (signature !== undefined && typeof signature !== 'string')
      return res
        .status(400)
        .json({ success: false, error: 'signature must be a string' })
    if (active !== undefined && typeof active !== 'boolean')
      return res
        .status(400)
        .json({ success: false, error: 'active must be a boolean' })

    const template = await Template.create({
      name,
      subject,
      body,
      signature,
      active: active === undefined ? true : active,
    })
    res.status(201).json({ success: true, template })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// PUT /api/templates/:id — update a template
router.put('/templates/:id', async (req, res) => {
  if (!dbReady())
    return res
      .status(503)
      .json({ success: false, error: 'Database unavailable' })
  try {
    const { name, subject, body, signature, active } = req.body || {}
    if (name !== undefined && typeof name !== 'string')
      return res
        .status(400)
        .json({ success: false, error: 'name must be a string' })
    if (subject !== undefined && typeof subject !== 'string')
      return res
        .status(400)
        .json({ success: false, error: 'subject must be a string' })
    if (body !== undefined && typeof body !== 'string')
      return res
        .status(400)
        .json({ success: false, error: 'body must be a string' })
    if (signature !== undefined && typeof signature !== 'string')
      return res
        .status(400)
        .json({ success: false, error: 'signature must be a string' })
    if (active !== undefined && typeof active !== 'boolean')
      return res
        .status(400)
        .json({ success: false, error: 'active must be a boolean' })

    const updates = {}
    if (name !== undefined) updates.name = name
    if (subject !== undefined) updates.subject = subject
    if (body !== undefined) updates.body = body
    if (signature !== undefined) updates.signature = signature
    if (active !== undefined) updates.active = active

    const template = await Template.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    })
    if (!template)
      return res
        .status(404)
        .json({ success: false, error: 'Template not found' })
    res.json({ success: true, template })
  } catch (err) {
    if (err.name === 'CastError')
      return res
        .status(404)
        .json({ success: false, error: 'Template not found' })
    res.status(500).json({ success: false, error: err.message })
  }
})

// DELETE /api/templates/:id — delete a template (blocked if referenced)
router.delete('/templates/:id', async (req, res) => {
  if (!dbReady())
    return res
      .status(503)
      .json({ success: false, error: 'Database unavailable' })
  try {
    if (await Campaign.exists({ templateId: req.params.id }))
      return res.status(400).json({
        success: false,
        error:
          'Template is referenced by a campaign — deactivate it instead of deleting',
      })
    const template = await Template.findByIdAndDelete(req.params.id)
    if (!template)
      return res
        .status(404)
        .json({ success: false, error: 'Template not found' })
    res.json({ success: true })
  } catch (err) {
    if (err.name === 'CastError')
      return res
        .status(404)
        .json({ success: false, error: 'Template not found' })
    res.status(500).json({ success: false, error: err.message })
  }
})

// POST /api/templates/:id/test — send ONE test email of this template to `to`,
// rendered with a sample lead from the chosen list (so the vars look real).
// Never touches the lead or the queue — a direct one-off send, subject-prefixed
// "[TEST]".
router.post('/templates/:id/test', async (req, res) => {
  if (!dbReady())
    return res
      .status(503)
      .json({ success: false, error: 'Database unavailable' })
  try {
    const { listId, to } = req.body || {}
    if (typeof to !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to.trim()))
      return res
        .status(400)
        .json({ success: false, error: 'A valid "to" email address is required' })
    if (!listId)
      return res
        .status(400)
        .json({ success: false, error: 'listId is required' })

    let template
    try {
      template = await Template.findById(req.params.id)
    } catch (err) {
      if (err.name === 'CastError')
        return res
          .status(404)
          .json({ success: false, error: 'Template not found' })
      throw err
    }
    if (!template)
      return res
        .status(404)
        .json({ success: false, error: 'Template not found' })

    // Sample lead from the chosen list ('unassigned' supported) for realistic vars.
    const leadFilter = listId === 'unassigned' ? { listId: null } : { listId }
    let sampleLead
    try {
      sampleLead = await Lead.findOne(leadFilter).sort({ createdAt: -1 })
    } catch (err) {
      if (err.name === 'CastError')
        return res.status(404).json({ success: false, error: 'List not found' })
      throw err
    }
    if (!sampleLead)
      return res.status(400).json({
        success: false,
        error: 'That list has no leads to sample — import some first',
      })

    const vars = {
      first_name: sampleLead.firstName || '',
      last_name: sampleLead.lastName || '',
      company: sampleLead.company || '',
      industry: sampleLead.industry || '',
      website: sampleLead.website || '',
      ai_intro: sampleLead.aiIntro || '',
    }
    const subject = `[TEST] ${render(template.subject, vars)}`
    let body = render(template.body, vars)
    if (template.signature) body += '\n\n' + render(template.signature, vars)

    await sendEmail({ to: to.trim(), subject, body })
    res.json({ success: true, to: to.trim(), sampleLead: sampleLead.email })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// POST /api/leads/:id/preview — render a template with an AI-generated intro
router.post('/leads/:id/preview', async (req, res) => {
  if (!dbReady())
    return res
      .status(503)
      .json({ success: false, error: 'Database unavailable' })
  try {
    let lead
    try {
      lead = await Lead.findById(req.params.id)
    } catch (err) {
      if (err.name === 'CastError')
        return res.status(404).json({ success: false, error: 'Lead not found' })
      throw err
    }
    if (!lead)
      return res.status(404).json({ success: false, error: 'Lead not found' })

    // 1-2. Cached intro? — only call AI when the lead has none yet.
    const cached = !!(lead.aiIntro && lead.aiIntro.trim())
    if (!cached) {
      const { intro, subject } = await generateIntro(
        lead,
        req.body && req.body.aiPrompt,
      )
      lead.aiIntro = intro
      if (!lead.aiSubject) lead.aiSubject = subject
      await lead.save()
    }

    // 3. Resolve the template.
    let template
    if (req.body && req.body.templateId) {
      try {
        template = await Template.findById(req.body.templateId)
      } catch (err) {
        if (err.name === 'CastError')
          return res
            .status(404)
            .json({ success: false, error: 'Template not found' })
        throw err
      }
      if (!template)
        return res
          .status(404)
          .json({ success: false, error: 'Template not found' })
    } else {
      template =
        (await Template.findOne({ name: 'Default', active: true })) ||
        (await Template.findOne({ active: true }))
    }
    if (!template)
      return res
        .status(400)
        .json({ success: false, error: 'No active template' })

    // 4-5. Build vars and render.
    const vars = {
      first_name: lead.firstName || '',
      last_name: lead.lastName || '',
      company: lead.company || '',
      industry: lead.industry || '',
      website: lead.website || '',
      ai_intro: lead.aiIntro || '',
    }
    const renderedSubject = render(template.subject, vars)
    let body = render(template.body, vars)
    if (template.signature) body += '\n\n' + render(template.signature, vars)
    let subject = renderedSubject

    // If the lead has a full body override, show what will actually send.
    const overridden =
      typeof lead.bodyOverride === 'string' && !!lead.bodyOverride.trim()
    if (overridden) {
      body = lead.bodyOverride
      subject = lead.subjectOverride || renderedSubject
    }

    res.json({ success: true, subject, body, cached, overridden })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// PUT /api/leads/:id/email — set a per-lead full body override (custom email).
// Also patches any not-yet-sent step-0 queue item so an already-queued email
// reflects the edit.
router.put('/leads/:id/email', async (req, res) => {
  if (!dbReady())
    return res
      .status(503)
      .json({ success: false, error: 'Database unavailable' })
  try {
    const { subject, body } = req.body || {}
    if (typeof body !== 'string' || !body.trim())
      return res
        .status(400)
        .json({ success: false, error: 'body must be a non-empty string' })

    let lead
    try {
      lead = await Lead.findById(req.params.id)
    } catch (err) {
      if (err.name === 'CastError')
        return res.status(404).json({ success: false, error: 'Lead not found' })
      throw err
    }
    if (!lead)
      return res.status(404).json({ success: false, error: 'Lead not found' })

    lead.subjectOverride = subject || ''
    lead.bodyOverride = body
    await lead.save()

    await QueuedEmail.updateMany(
      {
        leadId: lead._id,
        stepIndex: 0,
        status: { $in: ['pending', 'scheduled'] },
      },
      { $set: { subject: subject || '(no subject)', body } },
    )

    res.json({
      success: true,
      lead: {
        _id: lead._id,
        subjectOverride: lead.subjectOverride,
        bodyOverride: lead.bodyOverride,
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// DELETE /api/leads/:id/email — clear the override (revert to template + intro).
// Does not touch already-queued items; this reverts the stored override for
// future enqueues.
router.delete('/leads/:id/email', async (req, res) => {
  if (!dbReady())
    return res
      .status(503)
      .json({ success: false, error: 'Database unavailable' })
  try {
    let lead
    try {
      lead = await Lead.findById(req.params.id)
    } catch (err) {
      if (err.name === 'CastError')
        return res.status(404).json({ success: false, error: 'Lead not found' })
      throw err
    }
    if (!lead)
      return res.status(404).json({ success: false, error: 'Lead not found' })

    lead.subjectOverride = undefined
    lead.bodyOverride = undefined
    await lead.save()

    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// POST /api/leads/:id/regenerate — clear + re-generate this lead's AI intro.
router.post('/leads/:id/regenerate', async (req, res) => {
  if (!dbReady())
    return res
      .status(503)
      .json({ success: false, error: 'Database unavailable' })
  try {
    let lead
    try {
      lead = await Lead.findById(req.params.id)
    } catch (err) {
      if (err.name === 'CastError')
        return res.status(404).json({ success: false, error: 'Lead not found' })
      throw err
    }
    if (!lead)
      return res.status(404).json({ success: false, error: 'Lead not found' })

    lead.aiIntro = undefined
    lead.aiSubject = undefined
    let intro, subject
    try {
      ;({ intro, subject } = await generateIntro(lead))
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message })
    }
    lead.aiIntro = intro
    lead.aiSubject = subject
    await lead.save()

    res.json({ success: true, intro, subject })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// POST /api/lists/:id/regenerate — regenerate the AI intro for every lead in a
// list ('unassigned' = no list). One AI call per lead; per-lead failures are
// caught so the batch keeps going.
router.post('/lists/:id/regenerate', async (req, res) => {
  if (!dbReady())
    return res
      .status(503)
      .json({ success: false, error: 'Database unavailable' })
  try {
    const filter =
      req.params.id === 'unassigned'
        ? { listId: null }
        : { listId: req.params.id }
    // Optional { leadIds } narrows the run to just those leads (bulk action on
    // a checkbox selection); omit it to regenerate the whole list.
    const { leadIds } = req.body || {}
    if (leadIds !== undefined) {
      if (!Array.isArray(leadIds) || !leadIds.length)
        return res
          .status(400)
          .json({ success: false, error: 'leadIds must be a non-empty array' })
      filter._id = { $in: leadIds }
    }
    let leads
    try {
      leads = await Lead.find(filter)
    } catch (err) {
      if (err.name === 'CastError')
        return res.status(404).json({ success: false, error: 'List not found' })
      throw err
    }

    let regenerated = 0
    let failed = 0
    for (const lead of leads) {
      try {
        lead.aiIntro = undefined
        lead.aiSubject = undefined
        const { intro, subject } = await generateIntro(lead)
        lead.aiIntro = intro
        lead.aiSubject = subject
        await lead.save()
        regenerated += 1
      } catch (err) {
        failed += 1
      }
    }

    res.json({ success: true, regenerated, failed })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// POST /api/leads/:id/resend — reset a lead to 'new' so a campaign re-queues it.
router.post('/leads/:id/resend', async (req, res) => {
  if (!dbReady())
    return res
      .status(503)
      .json({ success: false, error: 'Database unavailable' })
  try {
    let lead
    try {
      lead = await Lead.findById(req.params.id)
    } catch (err) {
      if (err.name === 'CastError')
        return res.status(404).json({ success: false, error: 'Lead not found' })
      throw err
    }
    if (!lead)
      return res.status(404).json({ success: false, error: 'Lead not found' })

    lead.status = 'new'
    await lead.save()

    res.json({ success: true, lead: { _id: lead._id, status: lead.status } })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// DELETE /api/leads/:id — remove a lead and any of its queued emails.
router.delete('/leads/:id', async (req, res) => {
  if (!dbReady())
    return res
      .status(503)
      .json({ success: false, error: 'Database unavailable' })
  try {
    let lead
    try {
      lead = await Lead.findById(req.params.id)
    } catch (err) {
      if (err.name === 'CastError')
        return res.status(404).json({ success: false, error: 'Lead not found' })
      throw err
    }
    if (!lead)
      return res.status(404).json({ success: false, error: 'Lead not found' })

    // Drop its queue items too so nothing dangles or tries to send later.
    await QueuedEmail.deleteMany({ leadId: lead._id })
    await Lead.findByIdAndDelete(lead._id)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// GET /api/logs — SendLog viewer with category/since filters + pagination.
router.get('/logs', async (req, res) => {
  if (!dbReady())
    return res
      .status(503)
      .json({ success: false, error: 'Database unavailable' })
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1)
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50))

    const CATEGORIES = [
      'smtp',
      'queue',
      'campaign',
      'ai',
      'rotation',
      'retry',
      'error',
    ]
    const filter = {}
    if (req.query.category && CATEGORIES.includes(req.query.category))
      filter.category = req.query.category
    if (req.query.since) {
      const since = new Date(req.query.since)
      if (!isNaN(since.getTime())) filter.timestamp = { $gte: since }
    }
    // Optional per-campaign filter (used by the campaign View modal).
    if (req.query.campaignId) {
      if (!mongoose.Types.ObjectId.isValid(req.query.campaignId))
        return res
          .status(400)
          .json({ success: false, error: 'Invalid campaignId' })
      filter['refs.campaignId'] = new mongoose.Types.ObjectId(
        req.query.campaignId,
      )
    }

    const [items, total] = await Promise.all([
      SendLog.find(filter)
        .sort({ timestamp: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      SendLog.countDocuments(filter),
    ])
    const pages = Math.max(1, Math.ceil(total / limit))

    // Resolve campaign names in one query.
    const campaignIds = [
      ...new Set(
        items
          .map((i) => i.refs && i.refs.campaignId)
          .filter(Boolean)
          .map(String),
      ),
    ]
    const nameById = {}
    if (campaignIds.length) {
      const campaigns = await Campaign.find({ _id: { $in: campaignIds } })
        .select('name')
        .lean()
      for (const c of campaigns) nameById[String(c._id)] = c.name
    }
    for (const i of items)
      i.campaignName =
        i.refs && i.refs.campaignId
          ? nameById[String(i.refs.campaignId)] || null
          : null

    res.json({ success: true, items, total, page, pages })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── Mailboxes (Mongo-backed sending accounts) ──

const MAILBOX_PROVIDERS = ['smtp', 'gmail', 'm365', 'mailgun', 'ses', 'resend']

// Validate mailbox fields. `partial` = update mode (all fields optional).
const validateMailbox = (body, partial) => {
  const req = (v) => typeof v === 'string' && v.trim()
  if (!partial || body.name !== undefined)
    if (!req(body.name)) return 'name must be a non-empty string'
  if (!partial || body.email !== undefined)
    if (!req(body.email)) return 'email must be a non-empty string'
  if (!partial || body.host !== undefined)
    if (!req(body.host)) return 'host must be a non-empty string'
  if (!partial || body.username !== undefined)
    if (!req(body.username)) return 'username must be a non-empty string'
  if (!partial) {
    if (!req(body.password)) return 'password must be a non-empty string'
  } else if (body.password !== undefined && typeof body.password !== 'string') {
    return 'password must be a string'
  }
  if (!partial || body.port !== undefined)
    if (typeof body.port !== 'number') return 'port must be a number'
  if (body.secure !== undefined && typeof body.secure !== 'boolean')
    return 'secure must be a boolean'
  if (body.warmupEnabled !== undefined && typeof body.warmupEnabled !== 'boolean')
    return 'warmupEnabled must be a boolean'
  if (body.active !== undefined && typeof body.active !== 'boolean')
    return 'active must be a boolean'
  if (body.provider !== undefined && !MAILBOX_PROVIDERS.includes(body.provider))
    return `provider must be one of: ${MAILBOX_PROVIDERS.join(', ')}`
  if (
    body.dailyLimit !== undefined &&
    (typeof body.dailyLimit !== 'number' || body.dailyLimit <= 0)
  )
    return 'dailyLimit must be a positive number'
  if (
    body.hourlyLimit !== undefined &&
    (typeof body.hourlyLimit !== 'number' || body.hourlyLimit <= 0)
  )
    return 'hourlyLimit must be a positive number'
  return null
}

// GET /api/mailboxes — all mailboxes, newest first (passwords excluded)
router.get('/mailboxes', async (req, res) => {
  if (!dbReady())
    return res
      .status(503)
      .json({ success: false, error: 'Database unavailable' })
  try {
    const docs = await Mailbox.find().sort({ createdAt: -1 })
    res.json({ success: true, mailboxes: docs.map(sanitize) })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// POST /api/mailboxes — create a mailbox
router.post('/mailboxes', async (req, res) => {
  if (!dbReady())
    return res
      .status(503)
      .json({ success: false, error: 'Database unavailable' })
  try {
    const invalid = validateMailbox(req.body || {}, false)
    if (invalid)
      return res.status(400).json({ success: false, error: invalid })

    const doc = await Mailbox.create(req.body)
    res.status(201).json({ success: true, mailbox: sanitize(doc) })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// PUT /api/mailboxes/:id — update a mailbox
router.put('/mailboxes/:id', async (req, res) => {
  if (!dbReady())
    return res
      .status(503)
      .json({ success: false, error: 'Database unavailable' })
  try {
    const body = req.body || {}
    const invalid = validateMailbox(body, true)
    if (invalid)
      return res.status(400).json({ success: false, error: invalid })

    const updates = {}
    const fields = [
      'name',
      'email',
      'provider',
      'host',
      'port',
      'secure',
      'username',
      'dailyLimit',
      'hourlyLimit',
      'warmupEnabled',
      'warmupStartDate',
      'active',
    ]
    for (const f of fields) if (body[f] !== undefined) updates[f] = body[f]
    // Only touch the password when a non-empty new value is supplied.
    if (typeof body.password === 'string' && body.password.trim())
      updates.password = body.password

    const doc = await Mailbox.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    })
    if (!doc)
      return res
        .status(404)
        .json({ success: false, error: 'Mailbox not found' })
    res.json({ success: true, mailbox: sanitize(doc) })
  } catch (err) {
    if (err.name === 'CastError')
      return res
        .status(404)
        .json({ success: false, error: 'Mailbox not found' })
    res.status(500).json({ success: false, error: err.message })
  }
})

// POST /api/mailboxes/:id/test — verify the connection, record health
router.post('/mailboxes/:id/test', async (req, res) => {
  if (!dbReady())
    return res
      .status(503)
      .json({ success: false, error: 'Database unavailable' })
  try {
    let mailbox
    try {
      mailbox = await Mailbox.findById(req.params.id).select('+password')
    } catch (err) {
      if (err.name === 'CastError')
        return res
          .status(404)
          .json({ success: false, error: 'Mailbox not found' })
      throw err
    }
    if (!mailbox)
      return res
        .status(404)
        .json({ success: false, error: 'Mailbox not found' })

    let verified = false
    try {
      await providerFor(mailbox).verify()
      verified = true
      mailbox.healthStatus = 'healthy'
      mailbox.lastError = undefined
    } catch (err) {
      mailbox.healthStatus = 'error'
      mailbox.lastError = err.message
    }
    await mailbox.save()

    // Deliverability warnings — non-fatal. Flag when the visible FROM address
    // and the authenticating SMTP user live on different domains.
    const warnings = []
    const w = domainMismatch(mailbox.email, mailbox.username)
    if (w) warnings.push(w)

    res.json({ success: verified, mailbox: sanitize(mailbox), warnings })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// POST /api/mailboxes/:id/pause — pause for N minutes (default 60)
router.post('/mailboxes/:id/pause', async (req, res) => {
  if (!dbReady())
    return res
      .status(503)
      .json({ success: false, error: 'Database unavailable' })
  try {
    const { minutes, reason } = req.body || {}
    const until = new Date(Date.now() + (minutes || 60) * 60000)
    const doc = await pause(req.params.id, until, reason)
    if (!doc)
      return res
        .status(404)
        .json({ success: false, error: 'Mailbox not found' })
    res.json({ success: true, mailbox: sanitize(doc) })
  } catch (err) {
    if (err.name === 'CastError')
      return res
        .status(404)
        .json({ success: false, error: 'Mailbox not found' })
    res.status(500).json({ success: false, error: err.message })
  }
})

// POST /api/mailboxes/:id/resume — clear pause/error state
router.post('/mailboxes/:id/resume', async (req, res) => {
  if (!dbReady())
    return res
      .status(503)
      .json({ success: false, error: 'Database unavailable' })
  try {
    const doc = await resume(req.params.id)
    if (!doc)
      return res
        .status(404)
        .json({ success: false, error: 'Mailbox not found' })
    res.json({ success: true, mailbox: sanitize(doc) })
  } catch (err) {
    if (err.name === 'CastError')
      return res
        .status(404)
        .json({ success: false, error: 'Mailbox not found' })
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── Campaigns (Mongo-backed outreach campaigns) ──

const HHMM = /^\d{2}:\d{2}$/

// Validate campaign fields. Returns an error string, or null when valid.
// `partial` = update mode where name may be omitted.
const validateCampaign = (body, partial) => {
  if (!partial || body.name !== undefined)
    if (typeof body.name !== 'string' || !body.name.trim())
      return 'name must be a non-empty string'
  if (body.aiPrompt !== undefined && typeof body.aiPrompt !== 'string')
    return 'aiPrompt must be a string'
  if (body.mailboxIds !== undefined && !Array.isArray(body.mailboxIds))
    return 'mailboxIds must be an array'
  if (body.steps !== undefined) {
    if (!Array.isArray(body.steps)) return 'steps must be an array'
    for (const s of body.steps) {
      if (!s || typeof s.templateId !== 'string' || !s.templateId.trim())
        return 'each step must have a non-empty templateId'
      if (typeof s.delayDays !== 'number' || s.delayDays < 0)
        return 'each step delayDays must be a number >= 0'
    }
  }
  if (
    body.dailyLimit !== undefined &&
    (typeof body.dailyLimit !== 'number' || body.dailyLimit < 0)
  )
    return 'dailyLimit must be a number >= 0'
  if (
    body.listId !== undefined &&
    body.listId !== null &&
    typeof body.listId !== 'string'
  )
    return 'listId must be a string or null'
  if (body.warmupEnabled !== undefined && typeof body.warmupEnabled !== 'boolean')
    return 'warmupEnabled must be a boolean'
  if (body.schedule !== undefined) {
    const s = body.schedule
    if (typeof s !== 'object' || s === null) return 'schedule must be an object'
    if (s.days !== undefined && !Array.isArray(s.days))
      return 'schedule.days must be an array'
    if (s.startTime !== undefined && !HHMM.test(s.startTime))
      return 'schedule.startTime must be HH:MM'
    if (s.endTime !== undefined && !HHMM.test(s.endTime))
      return 'schedule.endTime must be HH:MM'
  }
  return null
}

// Pull only the settable fields off a request body.
const campaignFields = (body) => {
  const out = {}
  const fields = [
    'name',
    'templateId',
    'steps',
    'aiPrompt',
    'mailboxIds',
    'dailyLimit',
    'listId',
    'warmupEnabled',
    'schedule',
  ]
  for (const f of fields) if (body[f] !== undefined) out[f] = body[f]
  // Normalize step order to positional index so the sequence is unambiguous.
  if (out.steps)
    out.steps = out.steps.map((s, i) => ({
      order: i,
      templateId: s.templateId,
      delayDays: Number(s.delayDays) || 0,
    }))
  return out
}

// GET /api/campaigns — all campaigns, newest first, with per-campaign queue counts
router.get('/campaigns', async (req, res) => {
  if (!dbReady())
    return res
      .status(503)
      .json({ success: false, error: 'Database unavailable' })
  try {
    const [docs, counts] = await Promise.all([
      Campaign.find().sort({ createdAt: -1 }),
      campaignService.countsByCampaign(),
    ])
    const listIds = docs.map((d) => d.listId).filter(Boolean)
    const listDocs = listIds.length
      ? await List.find({ _id: { $in: listIds } }).select('name').lean()
      : []
    const listNameById = Object.fromEntries(
      listDocs.map((l) => [String(l._id), l.name]),
    )
    const campaigns = docs.map((c) => ({
      ...c.toObject(),
      counts: counts[String(c._id)] || {},
      stepCount: (c.steps && c.steps.length) || 1,
      listName: c.listId ? listNameById[String(c.listId)] || null : null,
    }))
    res.json({ success: true, campaigns })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// POST /api/campaigns — create a draft campaign
router.post('/campaigns', async (req, res) => {
  if (!dbReady())
    return res
      .status(503)
      .json({ success: false, error: 'Database unavailable' })
  try {
    const invalid = validateCampaign(req.body || {}, false)
    if (invalid)
      return res.status(400).json({ success: false, error: invalid })

    if (req.body.listId) {
      if (
        !mongoose.Types.ObjectId.isValid(req.body.listId) ||
        !(await List.exists({ _id: req.body.listId }))
      )
        return res.status(400).json({
          success: false,
          error: 'listId does not refer to an existing list',
        })
    }

    const campaign = await Campaign.create({
      ...campaignFields(req.body || {}),
      status: 'draft',
    })
    res.status(201).json({ success: true, campaign })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// PUT /api/campaigns/:id — edit a draft campaign (only while draft)
router.put('/campaigns/:id', async (req, res) => {
  if (!dbReady())
    return res
      .status(503)
      .json({ success: false, error: 'Database unavailable' })
  try {
    const invalid = validateCampaign(req.body || {}, true)
    if (invalid)
      return res.status(400).json({ success: false, error: invalid })

    let campaign
    try {
      campaign = await Campaign.findById(req.params.id)
    } catch (err) {
      if (err.name === 'CastError')
        return res
          .status(404)
          .json({ success: false, error: 'Campaign not found' })
      throw err
    }
    if (!campaign)
      return res
        .status(404)
        .json({ success: false, error: 'Campaign not found' })
    if (campaign.status !== 'draft')
      return res
        .status(400)
        .json({ success: false, error: 'Only draft campaigns can be edited' })

    if (req.body.listId) {
      if (
        !mongoose.Types.ObjectId.isValid(req.body.listId) ||
        !(await List.exists({ _id: req.body.listId }))
      )
        return res.status(400).json({
          success: false,
          error: 'listId does not refer to an existing list',
        })
    }

    Object.assign(campaign, campaignFields(req.body || {}))
    await campaign.save()
    res.json({ success: true, campaign })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// Map a campaignService transition error to the right HTTP status.
const campaignActionError = (res, err) => {
  if (err.status === 400)
    return res.status(400).json({ success: false, error: err.message })
  return res.status(500).json({ success: false, error: err.message })
}

// POST /api/campaigns/:id/start — enqueue emails + flip to running
router.post('/campaigns/:id/start', async (req, res) => {
  if (!dbReady())
    return res
      .status(503)
      .json({ success: false, error: 'Database unavailable' })
  try {
    const { leadIds } = req.body || {}
    const { enqueued, skipped } = await campaignService.start(req.params.id, {
      leadIds,
    })
    const campaign = await Campaign.findById(req.params.id)
    res.json({ success: true, enqueued, skipped, campaign })
  } catch (err) {
    if (err.name === 'CastError')
      return res
        .status(404)
        .json({ success: false, error: 'Campaign not found' })
    campaignActionError(res, err)
  }
})

// POST /api/campaigns/:id/pause | /resume | /stop | /reopen — lifecycle transitions
// ('reopen' sends a stopped/completed campaign back to draft so it can be restarted)
for (const action of ['pause', 'resume', 'stop', 'reopen']) {
  router.post(`/campaigns/:id/${action}`, async (req, res) => {
    if (!dbReady())
      return res
        .status(503)
        .json({ success: false, error: 'Database unavailable' })
    try {
      const campaign = await campaignService[action](req.params.id)
      res.json({ success: true, campaign })
    } catch (err) {
      if (err.name === 'CastError')
        return res
          .status(404)
          .json({ success: false, error: 'Campaign not found' })
      campaignActionError(res, err)
    }
  })
}

// DELETE /api/campaigns/:id — remove a non-running campaign + its queue items
router.delete('/campaigns/:id', async (req, res) => {
  if (!dbReady())
    return res
      .status(503)
      .json({ success: false, error: 'Database unavailable' })
  try {
    await campaignService.remove(req.params.id)
    res.json({ success: true })
  } catch (err) {
    if (err.name === 'CastError')
      return res
        .status(404)
        .json({ success: false, error: 'Campaign not found' })
    campaignActionError(res, err)
  }
})

// ── Dashboard analytics + live queue (T-012) ──

const QUEUE_STATUSES = [
  'pending',
  'scheduled',
  'sending',
  'sent',
  'failed',
  'bounced',
  'cancelled',
]

// GET /api/analytics — dashboard summary: cards, rates, per-status tallies,
// campaign performance and mailbox health.
router.get('/analytics', async (req, res) => {
  if (!dbReady())
    return res
      .status(503)
      .json({ success: false, error: 'Database unavailable' })
  try {
    const [queueCounts, leadCounts, campaignDocs, counts, mailboxDocs] =
      await Promise.all([
        campaignService.queueCountsByStatus(),
        campaignService.leadCountsByStatus(),
        Campaign.find().select('name status dailyLimit').lean(),
        campaignService.countsByCampaign(),
        Mailbox.find(),
      ])

    // Sent card is queue-level (per-send); rates are lead-level (per-lead) —
    // intentional: one lead can span multiple sends across steps.
    const delivered = leadCounts.contacted + leadCounts.replied
    const rates = {
      replyRate: delivered > 0 ? leadCounts.replied / delivered : 0,
      bounceRate:
        delivered + leadCounts.bounced > 0
          ? leadCounts.bounced / (delivered + leadCounts.bounced)
          : 0,
    }

    const cards = {
      sent: queueCounts.sent,
      pending: queueCounts.pending + queueCounts.scheduled + queueCounts.sending,
      failed: queueCounts.failed,
      replies: leadCounts.replied,
      replyRate: rates.replyRate,
      bounceRate: rates.bounceRate,
    }

    const campaigns = campaignDocs.map((c) => ({
      _id: c._id,
      name: c.name,
      status: c.status,
      dailyLimit: c.dailyLimit,
      counts: counts[String(c._id)] || {},
    }))

    const mailboxes = mailboxDocs.map((mb) => ({
      ...sanitize(mb),
      effectiveDailyCap: effectiveDailyCap(mb),
    }))

    res.json({
      success: true,
      analytics: {
        cards,
        rates,
        queueCounts,
        leadCounts,
        campaigns,
        mailboxes,
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// GET /api/queue — paginated queued emails, optionally filtered by status.
router.get('/queue', async (req, res) => {
  if (!dbReady())
    return res
      .status(503)
      .json({ success: false, error: 'Database unavailable' })
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25))
    const filter = QUEUE_STATUSES.includes(req.query.status)
      ? { status: req.query.status }
      : {}
    // Optional per-campaign filter (used by the campaign View modal).
    if (req.query.campaignId) {
      if (!mongoose.Types.ObjectId.isValid(req.query.campaignId))
        return res
          .status(400)
          .json({ success: false, error: 'Invalid campaignId' })
      filter.campaignId = new mongoose.Types.ObjectId(req.query.campaignId)
    }

    const [docs, total] = await Promise.all([
      QueuedEmail.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('leadId', 'email')
        .populate('campaignId', 'name')
        .lean(),
      QueuedEmail.countDocuments(filter),
    ])

    const pages = Math.max(1, Math.ceil(total / limit))
    const items = docs.map((item) => ({
      _id: item._id,
      status: item.status,
      stepIndex: item.stepIndex || 0,
      scheduledAt: item.scheduledAt,
      sentAt: item.sentAt,
      createdAt: item.createdAt,
      errorMessage: item.errorMessage,
      leadId: item.leadId && item.leadId._id,
      leadEmail: item.leadId && item.leadId.email,
      campaignName: item.campaignId && item.campaignId.name,
    }))

    res.json({ success: true, items, total, page, pages })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// POST /api/leads/:id/replied — mark a lead as having replied.
router.post('/leads/:id/replied', async (req, res) => {
  if (!dbReady())
    return res
      .status(503)
      .json({ success: false, error: 'Database unavailable' })
  try {
    let lead
    try {
      lead = await Lead.findById(req.params.id)
    } catch (err) {
      if (err.name === 'CastError')
        return res.status(404).json({ success: false, error: 'Lead not found' })
      throw err
    }
    if (!lead)
      return res.status(404).json({ success: false, error: 'Lead not found' })

    lead.status = 'replied'
    lead.replyStatus = (req.body && req.body.note) || 'manual'
    await lead.save()
    res.json({ success: true, lead })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// POST /api/leads/:id/bounced — mark a lead as bounced.
router.post('/leads/:id/bounced', async (req, res) => {
  if (!dbReady())
    return res
      .status(503)
      .json({ success: false, error: 'Database unavailable' })
  try {
    let lead
    try {
      lead = await Lead.findById(req.params.id)
    } catch (err) {
      if (err.name === 'CastError')
        return res.status(404).json({ success: false, error: 'Lead not found' })
      throw err
    }
    if (!lead)
      return res.status(404).json({ success: false, error: 'Lead not found' })

    lead.status = 'bounced'
    lead.bounceStatus = (req.body && req.body.note) || 'manual'
    await lead.save()
    res.json({ success: true, lead })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── Lead Lists (Mongo-backed lead grouping) ──

// GET /api/lists — all lists with a per-list lead count + the unassigned count.
router.get('/lists', async (req, res) => {
  if (!dbReady())
    return res
      .status(503)
      .json({ success: false, error: 'Database unavailable' })
  try {
    const grouped = await Lead.aggregate([
      { $group: { _id: '$listId', n: { $sum: 1 } } },
    ])
    const countMap = {}
    let unassignedCount = 0
    for (const g of grouped) {
      if (g._id == null) unassignedCount = g.n
      else countMap[String(g._id)] = g.n
    }

    const docs = await List.find().sort({ createdAt: -1 }).lean()
    const lists = docs.map((l) => ({
      ...l,
      leadCount: countMap[String(l._id)] || 0,
    }))
    res.json({ success: true, lists, unassignedCount })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// POST /api/lists — create a list.
router.post('/lists', async (req, res) => {
  if (!dbReady())
    return res
      .status(503)
      .json({ success: false, error: 'Database unavailable' })
  try {
    const { name, description } = req.body || {}
    if (typeof name !== 'string' || !name.trim())
      return res
        .status(400)
        .json({ success: false, error: 'name must be a non-empty string' })
    const list = await List.create({ name, description, source: 'manual' })
    res.status(201).json({ success: true, list })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// PUT /api/lists/:id — rename / re-describe a list.
router.put('/lists/:id', async (req, res) => {
  if (!dbReady())
    return res
      .status(503)
      .json({ success: false, error: 'Database unavailable' })
  try {
    const { name, description } = req.body || {}
    if (name !== undefined && (typeof name !== 'string' || !name.trim()))
      return res
        .status(400)
        .json({ success: false, error: 'name must be a non-empty string' })
    const updates = {}
    if (name !== undefined) updates.name = name
    if (description !== undefined) updates.description = description
    const list = await List.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    })
    if (!list)
      return res.status(404).json({ success: false, error: 'List not found' })
    res.json({ success: true, list })
  } catch (err) {
    if (err.name === 'CastError')
      return res.status(404).json({ success: false, error: 'List not found' })
    res.status(500).json({ success: false, error: err.message })
  }
})

// DELETE /api/lists/:id — unassign its leads and remove it, unless a campaign
// targets it. (campaign.listId arrives in T-018; matches nothing until then.)
router.delete('/lists/:id', async (req, res) => {
  if (!dbReady())
    return res
      .status(503)
      .json({ success: false, error: 'Database unavailable' })
  try {
    if (await Campaign.exists({ listId: req.params.id }))
      return res.status(400).json({
        success: false,
        error:
          'List is targeted by a campaign — stop/delete that campaign first',
      })
    await Lead.updateMany(
      { listId: req.params.id },
      { $set: { listId: null } },
    )
    const list = await List.findByIdAndDelete(req.params.id)
    if (!list)
      return res.status(404).json({ success: false, error: 'List not found' })
    res.json({ success: true })
  } catch (err) {
    if (err.name === 'CastError')
      return res.status(404).json({ success: false, error: 'List not found' })
    res.status(500).json({ success: false, error: err.message })
  }
})

// GET /api/lists/:id/leads — paginated leads in a list ('unassigned' = no list).
router.get('/lists/:id/leads', async (req, res) => {
  if (!dbReady())
    return res
      .status(503)
      .json({ success: false, error: 'Database unavailable' })
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25))
    // Guard the 'unassigned' literal so it isn't cast to an ObjectId.
    const filter =
      req.params.id === 'unassigned'
        ? { listId: null }
        : { listId: req.params.id }

    const [docs, total] = await Promise.all([
      Lead.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('firstName lastName email company website status emailCheckStatus listId')
        .lean(),
      Lead.countDocuments(filter),
    ])

    const pages = Math.max(1, Math.ceil(total / limit))
    res.json({ success: true, items: docs, total, page, pages })
  } catch (err) {
    if (err.name === 'CastError')
      return res.status(404).json({ success: false, error: 'List not found' })
    res.status(500).json({ success: false, error: err.message })
  }
})

// Bump a list's source after an import: manual → the import's source; an
// existing different non-manual source → 'mixed'.
const bumpListSource = async (id, source) => {
  const list = await List.findById(id).select('source').lean()
  if (!list) return
  let next = source
  if (list.source && list.source !== 'manual' && list.source !== source)
    next = 'mixed'
  if (list.source !== next)
    await List.findByIdAndUpdate(id, { $set: { source: next } })
}

// POST /api/lists/:id/import-csv — parse a CSV string, upsert its rows.
router.post('/lists/:id/import-csv', async (req, res) => {
  if (!dbReady())
    return res
      .status(503)
      .json({ success: false, error: 'Database unavailable' })
  try {
    const { csv } = req.body || {}
    if (typeof csv !== 'string' || !csv.trim())
      return res
        .status(400)
        .json({ success: false, error: 'csv must be a non-empty string' })

    let rows
    try {
      rows = parse(csv, { columns: true, trim: true, skip_empty_lines: true })
    } catch (err) {
      return res
        .status(400)
        .json({ success: false, error: 'Could not parse CSV: ' + err.message })
    }
    if (!rows.length || !rows.some((r) => Object.keys(r).some((k) => /^e-?mail$/i.test(k.trim()))))
      return res
        .status(400)
        .json({ success: false, error: 'CSV must contain an email column' })

    const summary = await upsertLeadsIntoList(rows, req.params.id, 'csv')
    await bumpListSource(req.params.id, 'csv')
    res.json({ success: true, ...summary })
  } catch (err) {
    if (err.name === 'CastError')
      return res.status(404).json({ success: false, error: 'List not found' })
    res.status(500).json({ success: false, error: err.message })
  }
})

// POST /api/lists/:id/import-sheet — pull a Google Sheet tab's rows, upsert them.
router.post('/lists/:id/import-sheet', async (req, res) => {
  if (!dbReady())
    return res
      .status(503)
      .json({ success: false, error: 'Database unavailable' })
  try {
    const body = req.body || {}
    const sheetId = body.sheetId || process.env.GOOGLE_SHEET_ID
    const tab = body.tab || 'Sheet1'

    let rows
    try {
      rows = await sheetsService.fetchRowsAsObjects(sheetId, tab)
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message })
    }

    const summary = await upsertLeadsIntoList(rows, req.params.id, 'sheets')
    await bumpListSource(req.params.id, 'sheets')
    res.json({ success: true, ...summary })
  } catch (err) {
    if (err.name === 'CastError')
      return res.status(404).json({ success: false, error: 'List not found' })
    res.status(500).json({ success: false, error: err.message })
  }
})

// POST /api/lists/:id/assign — move existing leads into this list.
router.post('/lists/:id/assign', async (req, res) => {
  if (!dbReady())
    return res
      .status(503)
      .json({ success: false, error: 'Database unavailable' })
  try {
    const { leadIds } = req.body || {}
    if (!Array.isArray(leadIds) || leadIds.length === 0)
      return res
        .status(400)
        .json({ success: false, error: 'leadIds must be a non-empty array' })
    const result = await Lead.updateMany(
      { _id: { $in: leadIds } },
      { $set: { listId: req.params.id } },
    )
    res.json({ success: true, moved: result.modifiedCount })
  } catch (err) {
    if (err.name === 'CastError')
      return res.status(404).json({ success: false, error: 'List not found' })
    res.status(500).json({ success: false, error: err.message })
  }
})

module.exports = router
