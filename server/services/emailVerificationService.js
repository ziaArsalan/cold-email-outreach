// Free, pre-send email screening (T-011 follow-up). Catches obviously bad
// addresses before they cost an AI call or an SMTP attempt — not a substitute
// for a paid verifier (no mailbox-exists check), just cheap upfront filtering:
// format, MX records, disposable domains, role-based inboxes.

const { Resolver } = require('dns').promises
const disposableDomains = require('disposable-email-domains')
const config = require('../config')
const settingsService = require('./settingsService')
const { domainOf } = require('./deliverabilityService')

const DISPOSABLE_SET = new Set(disposableDomains)

// Generic inboxes rather than a named person — usually the wrong target for
// personalized 1:1 cold outreach. Toggle via config.emailVerification.blockRoleBased.
const ROLE_BASED_LOCAL_PARTS = new Set([
  'admin', 'administrator', 'support', 'info', 'sales', 'contact', 'help',
  'hello', 'marketing', 'billing', 'accounts', 'noreply', 'no-reply',
  'postmaster', 'webmaster', 'abuse', 'security', 'jobs', 'careers', 'press',
  'media', 'office', 'team', 'service', 'feedback', 'newsletter', 'root',
  'hostmaster', 'enquiries', 'inquiries',
])

// RFC-5322-lite — good enough to catch typos/garbage, not a full grammar.
const EMAIL_FORMAT_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const isValidFormat = (email) =>
  typeof email === 'string' && EMAIL_FORMAT_RE.test(email.trim())

const isRoleBased = (email) => {
  const at = (email || '').indexOf('@')
  if (at < 0) return false
  const localPart = email.slice(0, at).trim().toLowerCase()
  return ROLE_BASED_LOCAL_PARTS.has(localPart)
}

const isDisposableDomain = (domain) => DISPOSABLE_SET.has((domain || '').toLowerCase())

// Per-domain MX result cache (process lifetime) — many leads share a handful of
// domains (gmail.com, the same company, etc.), so this avoids redundant lookups.
const mxCache = new Map()

// Use reliable public resolvers (Google, Cloudflare) instead of the system/ISP/
// host resolver — those frequently return transient SERVFAILs that would
// otherwise be misread as "no MX record" and wrongly disqualify valid leads.
// Overridable via DNS_SERVERS (comma-separated).
const resolver = new Resolver({ timeout: 5000, tries: 2 })
resolver.setServers(
  (process.env.DNS_SERVERS || '8.8.8.8,1.1.1.1')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
)

const hasA = async (domain) => {
  try {
    const a = await resolver.resolve4(domain)
    return a.length > 0
  } catch {
    return false
  }
}

// Whether a domain can receive mail. Deliberately LENIENT so a flaky DNS lookup
// never silently drops a real lead:
//   - MX records present            → deliverable
//   - no MX but an A record present → deliverable (implicit MX, RFC 5321)
//   - domain truly doesn't exist    → not deliverable
//   - any transient DNS failure     → treated as deliverable (let the SMTP send
//     decide; a real bounce is handled downstream)
const hasMX = async (domain) => {
  if (!domain) return false
  if (mxCache.has(domain)) return mxCache.get(domain)
  let ok
  try {
    const records = await resolver.resolveMx(domain)
    ok = Array.isArray(records) && records.length > 0
    if (!ok) ok = await hasA(domain)
  } catch (e) {
    if (e.code === 'ENOTFOUND' || e.code === 'ENODATA') {
      // Domain exists but no MX / or no such record — fall back to A record.
      ok = await hasA(domain)
    } else {
      // SERVFAIL / timeout / refused → transient; don't disqualify the lead.
      ok = true
    }
  }
  mxCache.set(domain, ok)
  return ok
}

// Runs the cheap synchronous checks first, MX (a network call) last. Returns
// { valid, reason } — reason is null when valid, else a short human-readable
// cause suitable for storing on the Lead and showing to the user.
const verifyEmail = async (email) => {
  const opts = settingsService.get().emailVerification

  if (!isValidFormat(email)) return { valid: false, reason: 'invalid email format' }

  if (opts.blockRoleBased && isRoleBased(email))
    return { valid: false, reason: 'role-based inbox (e.g. info@, admin@)' }

  const domain = domainOf(email)

  if (opts.blockDisposable && isDisposableDomain(domain))
    return { valid: false, reason: `disposable email domain (${domain})` }

  if (opts.checkMX && !(await hasMX(domain)))
    return { valid: false, reason: `domain has no MX record (${domain})` }

  return { valid: true, reason: null }
}

module.exports = {
  isValidFormat,
  isRoleBased,
  isDisposableDomain,
  hasMX,
  verifyEmail,
}
