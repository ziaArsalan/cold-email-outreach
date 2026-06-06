const express = require('express')
const router = express.Router()
const {
  fetchPendingLeads,
  fetchAllLeads,
  updateLeadStatus,
  saveGeneratedEmail,
} = require('../services/sheetsService')
const { generateEmail } = require('../services/aiService')
const { sendEmail, verifyConnection } = require('../services/emailService')
const { fetchJobRows, updateCoverLetter } = require('../services/upworkSheet')
const { generateProposal } = require('../services/proposalService')
const { readConfig, writeConfig } = require('../services/upworkConfigStore')
const config = require('../jobs/config')

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
    },
  })
})

// POST /api/upwork/settings — persist UI-editable settings
router.post('/upwork/settings', (req, res) => {
  const { actorId, keywords, cronInterval, autoCover } = req.body || {}

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
      .json({ success: false, error: 'cronInterval must be a non-empty string' })
  if (typeof autoCover !== 'boolean')
    return res
      .status(400)
      .json({ success: false, error: 'autoCover must be a boolean' })

  const settings = { actorId, keywords, cronInterval, autoCover }
  try {
    writeConfig(settings)
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

module.exports = router
