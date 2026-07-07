const nodemailer = require('nodemailer')
const config = require('../../config')

// Build the nodemailer sendMail options from a mail payload. Always sets
// from/to/subject/text; sets `html` ONLY when html != null — we never fabricate
// an HTML part from the text, so plain-text sends stay genuinely plain-text
// (better cold-email deliverability). Exported for unit testing.
const buildMailOptions = ({ to, subject, text, html, fromName, fromEmail }) => {
  const opts = {
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject,
    text,
  }
  if (html != null) opts.html = html
  return opts
}

// SMTP provider backed by nodemailer. Wraps a mailbox document (env-shaped or a
// Mailbox model instance) into a transport and exposes send()/verify().
class NodemailerProvider {
  constructor(mailbox) {
    this.mailbox = mailbox
    this.transporter = nodemailer.createTransport({
      host: mailbox.host,
      port: mailbox.port,
      secure: mailbox.secure,
      auth: {
        user: mailbox.username,
        pass: mailbox.password,
      },
      connectionTimeout: config.smtpTimeoutMs,
      greetingTimeout: config.smtpTimeoutMs,
      socketTimeout: config.smtpTimeoutMs,
    })
  }

  async send(payload) {
    const info = await this.transporter.sendMail(buildMailOptions(payload))
    return info
  }

  async verify() {
    return await this.transporter.verify()
  }
}

// Keep the default export as the class (smtp/index.js does
// `require('./NodemailerProvider')` and `new`s it) while also exposing the pure
// buildMailOptions helper for reuse/tests.
module.exports = NodemailerProvider
module.exports.buildMailOptions = buildMailOptions
