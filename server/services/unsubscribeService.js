// One-click unsubscribe: signed per-lead tokens, the email footer, and the
// List-Unsubscribe headers.
//
// WHY THIS HELPS DELIVERABILITY (rather than hurting it):
// Since Feb 2024 Gmail/Yahoo expect bulk senders to offer one-click unsubscribe.
// Providing `List-Unsubscribe` + `List-Unsubscribe-Post` headers and a visible
// opt-out link is a positive reputation signal — it gives recipients an exit
// that isn't the "Report spam" button, which is what actually destroys a domain's
// reputation. It's also required by CAN-SPAM.
//
// The footer + headers are attached at SEND time (worker / template test), not
// baked into templates, so `deliverabilityService.validateBody`'s one-link rule
// still governs the template's own CTA link and this mandatory opt-out link is
// exempt from that budget.

const crypto = require('crypto')
const config = require('../config')

// Sign a lead id so the unsubscribe URL can't be guessed or enumerated, without
// storing anything. Reuses JWT_SECRET (already required for auth).
const secret = () => process.env.JWT_SECRET || 'insecure-dev-secret'

const b64url = (buf) =>
  Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

const sign = (value) =>
  b64url(crypto.createHmac('sha256', secret()).update(String(value)).digest())

const makeToken = (leadId) => `${leadId}.${sign(leadId)}`

// Returns the leadId when the token is authentic, else null. Uses a
// constant-time compare so the signature can't be brute-forced by timing.
const verifyToken = (token) => {
  if (typeof token !== 'string' || !token.includes('.')) return null
  const idx = token.lastIndexOf('.')
  const leadId = token.slice(0, idx)
  const sig = token.slice(idx + 1)
  if (!leadId || !sig) return null
  const expected = sign(leadId)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return null
  return crypto.timingSafeEqual(a, b) ? leadId : null
}

const unsubscribeUrl = (leadId) =>
  `${config.publicBaseUrl.replace(/\/+$/, '')}/api/unsubscribe?t=${makeToken(leadId)}`

// Plain-text footer appended to every outgoing email. Kept short and human so it
// doesn't break the 1:1 tone of a cold email.
const footerFor = (leadId) =>
  `\n\nIf you'd prefer not to receive emails from me, you can unsubscribe here:\n${unsubscribeUrl(leadId)}`

// RFC 8058 one-click headers. The mailto: fallback is included because some
// clients prefer it; the https URL is what Gmail POSTs to.
const headersFor = (leadId, fromEmail) => {
  const url = unsubscribeUrl(leadId)
  const mailto = fromEmail
    ? `<mailto:${fromEmail}?subject=unsubscribe>, `
    : ''
  return {
    'List-Unsubscribe': `${mailto}<${url}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  }
}

module.exports = {
  makeToken,
  verifyToken,
  unsubscribeUrl,
  footerFor,
  headersFor,
}
