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

// Call Gemini and return the reply as plain text (all text parts concatenated).
// Throws a readable Error on API failure so callers/routes can surface it.
const generateText = async (prompt, { temperature = 0.7 } = {}) => {
  if (!process.env.GEMINI_API_KEY)
    throw new Error('GEMINI_API_KEY is not set')

  const { data } = await axios
    .post(
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
    )
    .catch((err) => {
      const msg = err.response?.data?.error?.message || err.message
      console.log('[gemini] error:', msg)
      throw new Error(`Gemini API error: ${msg}`)
    })

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
