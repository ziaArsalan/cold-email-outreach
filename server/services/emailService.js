const { providerFor } = require('./smtp')
const { Mailbox } = require('../models')

// Build the env-configured mailbox inside the call so dotenv has loaded. Only a
// fallback now — see resolveMailbox.
const envMailbox = () => ({
  provider: 'smtp',
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT) || 465,
  secure: process.env.SMTP_SECURE === 'true',
  username: process.env.SMTP_USER,
  password: process.env.SMTP_PASS,
  email: process.env.FROM_EMAIL,
  name: process.env.FROM_NAME,
})

// Resolve the sending mailbox for the legacy/one-off send paths (template Test,
// Google Sheets flow). Prefer a configured DB mailbox so these use the SAME
// provider as campaigns (e.g. Brevo over its HTTP API) instead of raw SMTP —
// important on hosts that block outbound SMTP. Falls back to env SMTP only when
// no mailbox is configured or the DB is unavailable.
const resolveMailbox = async () => {
  try {
    const mb = await Mailbox.findOne({ active: true })
      .select('+password +apiKey')
      .lean()
    if (mb) return mb
  } catch (_) {}
  return envMailbox()
}

const sendEmail = async ({ to, subject, body, headers }) => {
  const mailbox = await resolveMailbox()
  return await providerFor(mailbox).send({
    to,
    subject,
    text: body,
    headers,
    // Keep an HTML part (line-break formatted) for these one-off sends.
    html: body.replace(/\n/g, '<br/>'),
    fromName: mailbox.name || process.env.FROM_NAME,
    fromEmail: mailbox.email || process.env.FROM_EMAIL,
  })
}

// Verify the configured mailbox's connection (Brevo API key / SMTP creds).
const verifyConnection = async () => {
  const mailbox = await resolveMailbox()
  return await providerFor(mailbox).verify()
}

module.exports = { sendEmail, verifyConnection }
