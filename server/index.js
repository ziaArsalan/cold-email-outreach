require('dotenv').config()
const express = require('express')
const path = require('path')
const fs = require('fs')
const cors = require('cors')
const cron = require('node-cron')
const apiRoutes = require('./routes/api')
const config = require('./jobs/config')
const { runCycle } = require('./jobs/upworkMonitor')
const { connectMongo } = require('./db')
const { start: startQueueWorker } = require('./workers/schedulerWorker')
const { start: startImapWorker } = require('./workers/imapWorker')
const { domainMismatch } = require('./services/deliverabilityService')

// One-shot dry-run: run a single monitor cycle and exit. Does not start the
// HTTP listener or the cron scheduler.
if (process.argv.includes('--once')) {
  runCycle()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
  return
}

const app = express()
const PORT = process.env.PORT || 5000

app.use(cors())
// CSV imports POST the whole file as a JSON string ({ csv: "..." }); Apollo
// exports with their huge keyword/technology columns easily exceed the default
// 100kb body limit, so allow a generous ceiling.
app.use(express.json({ limit: '25mb' }))
app.use(express.urlencoded({ extended: true, limit: '25mb' }))

app.use('/api', apiRoutes)

app.get('/health', (req, res) =>
  res.json({ status: 'ok', time: new Date().toISOString() }),
)

// In production, serve the built React app from the same server so the frontend
// and API share an origin (client then calls a relative /api — no hardcoded
// host). Any non-API GET falls back to index.html for client-side routing.
const clientBuild = path.join(__dirname, '..', 'client', 'build')
if (fs.existsSync(path.join(clientBuild, 'index.html'))) {
  app.use(express.static(clientBuild))
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next()
    if (req.path.startsWith('/api') || req.path === '/health') return next()
    res.sendFile(path.join(clientBuild, 'index.html'))
  })
  console.log('[static] serving client build from', clientBuild)
} else {
  console.log(
    '[static] no client build found — API only. Build it with: cd client && npm run build',
  )
}

app.listen(PORT, () => {
  console.log(`Devtronics Outreach Server running on port ${PORT}`)

  const w = domainMismatch(process.env.FROM_EMAIL, process.env.SMTP_USER)
  if (w) console.warn('[deliverability]', w)

  // Fire-and-forget: a down Mongo must not block boot. Sheets/Upwork features
  // keep working without it; DB-backed features are simply disabled.
  connectMongo()
    .then(() => {
      console.log('[mongo] connected')
      startQueueWorker()
      startImapWorker()
    })
    .catch((e) =>
      console.warn('[mongo] not connected — DB features disabled:', e.message),
    )

  if (config.CRON_ENABLED) {
    cron.schedule(config.CRON_INTERVAL, runCycle)
    console.log(
      `[upworkMonitor] cron scheduled — interval=${config.CRON_INTERVAL}`,
    )
  } else {
    console.log(
      '[upworkMonitor] cron disabled — not scheduled (enable via admin settings)',
    )
  }
})
