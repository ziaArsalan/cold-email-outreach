const { providerFor } = require('./smtp')

// Build the env-configured mailbox inside the call so dotenv has loaded.
const envMailbox = () => ({
  provider: 'smtp',
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT) || 465,
  secure: process.env.SMTP_SECURE === 'true',
  username: process.env.SMTP_USER,
  password: process.env.SMTP_PASS,
})

const sendEmail = async ({ to, subject, body }) => {
  return await providerFor(envMailbox()).send({
    to,
    subject,
    text: body,
    fromName: process.env.FROM_NAME,
    fromEmail: process.env.FROM_EMAIL,
  })
}

// Test SMTP connection
const verifyConnection = async () => {
  return await providerFor(envMailbox()).verify()
}

module.exports = { sendEmail, verifyConnection }
