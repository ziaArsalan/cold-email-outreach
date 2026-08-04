// Google Gemini client — the app's active AI provider (replaced Anthropic Claude
// on 2026-07-16). One place to own the endpoint, model, key and response shape.
//
// IMPORTANT — no web-search grounding:
// Gemini's `tools: [{ google_search: {} }]` grounding is a BILLED feature; on a
// free-tier key it returns 429 RESOURCE_EXHAUSTED (verified). We therefore call
// Gemini WITHOUT tools, and the prompts must forbid inventing facts about a
// company (see aiService.js). To re-enable grounding once billing is on, add
// `tools: [{ google_search: {} }]` to the request body below.
//
// The previous Claude implementation is preserved (commented) at the bottom of
// aiService.js / proposalService.js in case we switch back.

const axios = require('axios')

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models'

// `gemini-2.5-*` models are retired for new API keys; 3-flash is the current
// fast default. Override with GEMINI_MODEL if needed.
const model = () => process.env.GEMINI_MODEL || 'gemini-3-flash-preview'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// HTTP statuses worth retrying: 429 (rate limit / RESOURCE_EXHAUSTED), 500/503
// (transient "model overloaded / high demand"). Others fail fast.
const RETRYABLE = new Set([429, 500, 503])
const MAX_RETRIES = Number(process.env.GEMINI_MAX_RETRIES) || 4
// Never block a worker tick for a huge server-suggested delay: a big retryDelay
// means the DAILY quota is exhausted (won't clear for hours), so we give up and
// let the caller defer instead of sleeping. RPM waits are only a few seconds.
const MAX_BACKOFF_MS = Number(process.env.GEMINI_MAX_BACKOFF_MS) || 30000

// Gemini 429s include a RetryInfo detail like { retryDelay: "17s" } — honor it
// (capped) so we wait exactly as long as the server asks, no more.
const suggestedDelayMs = (data) => {
  const details = data?.error?.details || []
  const ri = details.find((d) => String(d['@type'] || '').includes('RetryInfo'))
  const m = ri && /^([\d.]+)s$/.exec(ri.retryDelay || '')
  return m ? Math.ceil(parseFloat(m[1]) * 1000) : null
}

// Call Gemini and return the reply as plain text (all text parts concatenated).
// Retries transient rate-limit/overload errors with capped exponential backoff
// (honoring the server's RetryInfo). Throws a readable Error once exhausted so
// callers/routes can surface it (the send worker defers the email on throw).
const generateText = async (prompt, { temperature = 0.7 } = {}) => {
  if (!process.env.GEMINI_API_KEY)
    throw new Error('GEMINI_API_KEY is not set')

  let data
  for (let attempt = 0; ; attempt++) {
    try {
      ;({ data } = await axios.post(
        `${GEMINI_API_URL}/${model()}:generateContent`,
        {
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': process.env.GEMINI_API_KEY,
          },
          timeout: 60000,
        },
      ))
      break
    } catch (err) {
      const status = err.response?.status
      const msg = err.response?.data?.error?.message || err.message
      const suggested = suggestedDelayMs(err.response?.data)
      // Retry only transient statuses, within the attempt budget, and only when
      // the server isn't asking us to wait longer than we're willing to block.
      const canRetry =
        RETRYABLE.has(status) &&
        attempt < MAX_RETRIES &&
        (suggested == null || suggested <= MAX_BACKOFF_MS)
      if (!canRetry) {
        console.log('[gemini] error:', msg)
        throw new Error(`Gemini API error: ${msg}`)
      }
      const backoff =
        suggested != null
          ? suggested
          : Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempt)
      const wait = backoff + Math.floor(Math.random() * 500) // jitter
      console.log(
        `[gemini] ${status} — retry ${attempt + 1}/${MAX_RETRIES} in ${wait}ms: ${msg}`,
      )
      await sleep(wait)
    }
  }

  const parts = data?.candidates?.[0]?.content?.parts || []
  const text = parts
    .map((p) => p.text)
    .filter(Boolean)
    .join('')
    .trim()

  if (!text) throw new Error('Gemini returned no text')
  return text
}

// Pull a JSON object out of a model reply that may be wrapped in prose or
// markdown fences — same first-`{`/last-`}` strategy the Claude code used.
const extractJson = (text) => {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1)
    throw new Error('No JSON object found in model response')
  return JSON.parse(text.slice(start, end + 1))
}

// Convenience: prompt → parsed JSON object.
const generateJson = async (prompt, opts) =>
  extractJson(await generateText(prompt, opts))

module.exports = { generateText, generateJson, extractJson, model }
