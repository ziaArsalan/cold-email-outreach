const nodemailer = require('nodemailer')
const config = require('../../config')

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

  async send({ to, subject, text, html, fromName, fromEmail }) {
    const info = await this.transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject,
      text,
      html: html || (text ? text.replace(/\n/g, '<br/>') : ''),
    })
    return info
  }

  async verify() {
    return await this.transporter.verify()
  }
}

module.exports = NodemailerProvider
