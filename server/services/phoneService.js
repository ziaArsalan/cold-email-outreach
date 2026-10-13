// Lightweight phone normalization for the Follow-ups module. Stores numbers as
// E.164 DIGITS ONLY (country code + subscriber number, no '+', no separators),
// which is what the Member.phone unique index dedupes on and what wa.me / the
// WhatsApp Cloud API expect.
//
// This is a deliberately small in-house normalizer (no libphonenumber dep): it
// handles the common shapes for a single default country (config.followups
// .defaultCountryCode, default 92 / Pakistan) without claiming full per-country
// validation. It does NOT verify that a number is actually reachable.

const config = require('../config')

const defaultCC = () =>
  String((config.followups && config.followups.defaultCountryCode) || '').replace(/\D/g, '')

// Normalize a raw phone string to E.164 digits, or return null if it can't be
// made into a plausible number.
//   +92 300 1234567  → '923001234567'
//   0092-3001234567   → '923001234567'
//   03001234567       → '923001234567'  (local → default CC, drop trunk 0)
//   3001234567        → '923001234567'  (bare national → default CC)
//   923001234567      → '923001234567'  (already E.164)
const normalize = (raw, countryCode = defaultCC()) => {
  if (raw == null) return null
  let s = String(raw).trim()
  if (!s) return null

  const hadPlus = s.startsWith('+')
  let digits = s.replace(/\D/g, '')
  if (!digits) return null

  const cc = String(countryCode || '').replace(/\D/g, '')

  // '00' international prefix is equivalent to '+'.
  if (!hadPlus && digits.startsWith('00')) digits = digits.slice(2)
  else if (hadPlus) {
    // already in CC + number form
  } else if (cc) {
    if (digits.startsWith('0')) {
      // national format with a trunk 0 → strip it and prepend the default CC.
      digits = cc + digits.replace(/^0+/, '')
    } else if (!digits.startsWith(cc)) {
      // bare national number → prepend the default CC.
      digits = cc + digits
    }
  }

  // Plausibility: E.164 allows up to 15 digits; require a sane minimum so empty
  // / junk input is rejected rather than stored.
  if (digits.length < 8 || digits.length > 15) return null
  return digits
}

// Format stored digits back to a '+' E.164 string for display.
const toE164 = (digits) => (digits ? '+' + String(digits).replace(/\D/g, '') : '')

module.exports = { normalize, toE164 }
