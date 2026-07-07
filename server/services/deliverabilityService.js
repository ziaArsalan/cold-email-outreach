// Pure deliverability helpers for cold email (T-013). No DB, no SMTP, no I/O.
// Cold-email inbox placement improves dramatically with plain-text bodies and at
// most one link (the single CTA/link lives in the signature). These functions
// enforce that at enqueue time and surface FROM/auth domain mismatches.
//
// NOTE: the current send flow has no attachment path (nodemailer is only ever
// handed text/html), so there is no attachment check here beyond rejecting
// inline data: URIs, which are the only way an "attachment" could sneak into a
// body string.

// Lowercased domain part of an email address, or '' when absent/malformed.
const domainOf = (email) => {
  if (!email || typeof email !== 'string') return ''
  const at = email.lastIndexOf('@')
  if (at < 0) return ''
  return email.slice(at + 1).trim().toLowerCase()
}

// Count links in a body: https?:// URLs plus bare www. occurrences. The regex is
// conservative — one URL with trailing punctuation (e.g. "https://x.com.") counts
// once because the match stops at whitespace and common trailing punctuation is
// simply part of the single match, not a second link.
const countLinks = (text) => {
  if (!text || typeof text !== 'string') return 0
  const urls = text.match(/https?:\/\/[^\s<>()]+/gi) || []
  // Bare www. links that are not already part of an http(s):// URL.
  const bareWww =
    text.match(/(^|[\s(])www\.[^\s<>()]+/gi) || []
  return urls.length + bareWww.length
}

// Validate a composed body for deliverability. Returns { ok, errors: [] }.
const validateBody = (text) => {
  const errors = []
  const body = typeof text === 'string' ? text : ''

  if (!body.trim()) errors.push('email body is empty')

  const links = countLinks(body)
  if (links > 1)
    errors.push(
      `body has ${links} links; deliverability allows at most 1 (put your one CTA/link in the signature)`,
    )

  const hasMarkdownImage = /!\[[^\]]*\]\([^)]*\)/.test(body)
  const hasImgTag = /<img/i.test(body)
  const hasDataUri = /data:[^\s]*/i.test(body)
  if (hasMarkdownImage || hasImgTag || hasDataUri)
    errors.push('images are not allowed in cold emails')

  return { ok: errors.length === 0, errors }
}

// Warning string when the visible FROM address and the authenticating SMTP user
// live on different domains (a common SPF/DKIM-alignment mistake), else null.
// Null when either address is blank or the domains are equal.
const domainMismatch = (fromEmail, authEmail) => {
  const from = domainOf(fromEmail)
  const auth = domainOf(authEmail)
  if (!from || !auth) return null
  if (from === auth) return null
  return `FROM domain '${from}' does not match auth/SMTP domain '${auth}' — this hurts SPF/DKIM alignment and deliverability`
}

module.exports = { domainOf, countLinks, validateBody, domainMismatch }
