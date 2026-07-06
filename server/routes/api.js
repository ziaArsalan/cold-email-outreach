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
const { Lead, Template } = require('../models')
const { render } = require('../services/templateService')

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

// POST /api/start — start the automation job
router.post('/start', async (req, res) => {
  if (jobState.running) {
    return res
      .status(400)
      .json({ success: false, error: 'Job already running' })
  }

  const { batchSize = 10, delayMs = 3000 } = req.body

  // Reset state
  jobState = {
    running: true,
    total: 0,
    processed: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    logs: [],
    startedAt: new Date().toISOString(),
    finishedAt: null,
  }

  res.json({ success: true, message: 'Job started' })

  // Run job in background
  ;(async () => {
    try {
      addLog('info', 'Fetching pending leads from Google Sheets...')
      const leads = await fetchPendingLeads()
      jobState.total = leads.length

      if (leads.length === 0) {
        addLog('info', 'No pending leads found. All done!')
        jobState.running = false
        jobState.finishedAt = new Date().toISOString()
        return
      }

      addLog('info', `Found ${leads.length} pending leads. Starting...`)

      // Process in batches
      const batch = leads.slice(0, batchSize)

      for (const lead of batch) {
        try {
          addLog('info', `Processing: ${lead.name} (${lead.email})`)

          // Step 1: Use cached email if already generated, otherwise call AI
          let subject, body
          if (lead.generatedEmail) {
            ;({ subject, body } = lead.generatedEmail)
            addLog('info', `Using cached email for ${lead.name} (no AI call)`)
          } else {
            addLog('info', `Generating email for ${lead.name}...`)
            ;({ subject, body } = await generateEmail(lead))
            // Save to sheet so it is never regenerated
            await saveGeneratedEmail(lead.rowIndex, { subject, body })
          }

          // Step 2: Send email
          addLog('info', `Sending email to ${lead.email}...`)
          await sendEmail({ to: lead.email, subject, body })

          // Step 3: Update sheet status
          await updateLeadStatus(lead.rowIndex, 'Emailed')

          jobState.success++
          addLog(
            'success',
            `Emailed ${lead.name} at ${lead.email} — Subject: "${subject}"`,
          )
        } catch (err) {
          jobState.failed++
          addLog('error', `Failed for ${lead.email}: ${err.message}`)
          // Mark as failed in sheet so we know
          try {
            await updateLeadStatus(lead.rowIndex, 'Failed')
          } catch (_) {}
        }

        jobState.processed++

        // Delay between emails to avoid rate limits
        if (jobState.processed < batch.length) {
          await new Promise((r) => setTimeout(r, delayMs))
        }
      }

      addLog(
        'info',
        `Job complete. Sent: ${jobState.success} | Failed: ${jobState.failed}`,
      )
    } catch (err) {
      addLog('error', `Job crashed: ${err.message}`)
    } finally {
      jobState.running = false
      jobState.finishedAt = new Date().toISOString()
    }
  })()
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

module.exports = router
