// Email provider that sends via Brevo's HTTP API (https://api.brevo.com) instead
// of SMTP. Chosen for hosts that block outbound SMTP ports (e.g. DigitalOcean) —
// this goes over HTTPS/443, which is never blocked. Same shape as
// NodemailerProvider (send/verify) so the queue worker uses it unchanged.

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email'
const BREVO_ACCOUNT = 'https://api.brevo.com/v3/account'

class BrevoApiProvider {
  constructor(mailbox) {
    this.mailbox = mailbox
    // Per-mailbox key preferred; env key as a fallback so a single shared key
    // works without storing it on every mailbox.
    this.apiKey = mailbox.apiKey || process.env.BREVO_API_KEY
  }

  async send({ to, subject, text, html, fromName, fromEmail, headers }) {
    if (!this.apiKey) throw new Error('Brevo API key missing (mailbox.apiKey / BREVO_API_KEY)')

    const payload = {
      sender: { email: fromEmail, name: fromName || fromEmail },
      to: [{ email: to }],
      subject,
      textContent: text,
    }
    if (html != null) payload.htmlContent = html
    // Pass through List-Unsubscribe (+ Post) so one-click unsubscribe still works.
    if (headers && Object.keys(headers).length) payload.headers = headers

    const res = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: {
        'api-key': this.apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const bodyText = await res.text()
    if (!res.ok) {
      // Surface Brevo's message; tag with status so classifySendError can react
      // (e.g. 401 auth, 4xx rate-limit) the same way it does for SMTP.
      const err = new Error(`Brevo API ${res.status}: ${bodyText}`)
      err.responseCode = res.status
      err.response = bodyText
      throw err
    }

    let messageId
    try {
      messageId = JSON.parse(bodyText).messageId
    } catch (_) {}
    // Shape a nodemailer-like info object for markSent().
    return { response: `250 Brevo accepted (${messageId || 'ok'})`, messageId }
  }

  async verify() {
    if (!this.apiKey) throw new Error('Brevo API key missing')
    const res = await fetch(BREVO_ACCOUNT, {
      headers: { 'api-key': this.apiKey, accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`Brevo verify failed ${res.status}: ${await res.text()}`)
    return true
  }
}

module.exports = BrevoApiProvider
