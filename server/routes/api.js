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
const { Lead, Template, Mailbox, Campaign, QueuedEmail } = require('../models')
const { render } = require('../services/templateService')
const campaignService = require('../services/campaignService')
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
    const subject = render(template.subject, vars)
    let body = render(template.body, vars)
    if (template.signature) body += '\n\n' + render(template.signature, vars)

    res.json({ success: true, subject, body, cached })
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
  if (
    body.dailyLimit !== undefined &&
    (typeof body.dailyLimit !== 'number' || body.dailyLimit < 0)
  )
    return 'dailyLimit must be a number >= 0'
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
    'aiPrompt',
    'mailboxIds',
    'dailyLimit',
    'warmupEnabled',
    'schedule',
  ]
  for (const f of fields) if (body[f] !== undefined) out[f] = body[f]
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
    const campaigns = docs.map((c) => ({
      ...c.toObject(),
      counts: counts[String(c._id)] || {},
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

// POST /api/campaigns/:id/pause | /resume | /stop — lifecycle transitions
for (const action of ['pause', 'resume', 'stop']) {
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

module.exports = router
