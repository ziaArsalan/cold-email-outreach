require('dotenv').config()
const express = require('express')
const cors = require('cors')
const cron = require('node-cron')
const apiRoutes = require('./routes/api')
const config = require('./jobs/config')
const { runCycle } = require('./jobs/upworkMonitor')
const { connectMongo } = require('./db')
const { start: startQueueWorker } = require('./workers/schedulerWorker')

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
app.use(express.json())

app.use('/api', apiRoutes)

app.get('/health', (req, res) =>
  res.json({ status: 'ok', time: new Date().toISOString() }),
)

app.listen(PORT, () => {
  console.log(`Devtronics Outreach Server running on port ${PORT}`)

  // Fire-and-forget: a down Mongo must not block boot. Sheets/Upwork features
  // keep working without it; DB-backed features are simply disabled.
  connectMongo()
    .then(() => {
      console.log('[mongo] connected')
      startQueueWorker()
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
