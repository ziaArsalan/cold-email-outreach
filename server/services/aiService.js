// AI email generation. ACTIVE PROVIDER: Google Gemini (see geminiClient.js).
//
// Switched from Anthropic Claude → Gemini on 2026-07-16. The full Claude
// implementation (prompts + API calls, which used Claude's web_search tool to
// research each company) is preserved COMMENTED OUT at the bottom of this file
// so we can switch back by restoring it and reinstating ANTHROPIC_API_KEY.
//
// NOTE — no web research: Gemini's google_search grounding needs a billed plan
// (free tier → 429), so these prompts deliberately FORBID inventing details
// about a company. The model may only use the lead fields we pass it. That
// keeps intros honest at the cost of being less specific than the old
// Claude+web_search intros.

const { generateJson } = require('./geminiClient')

// ── Legacy Sheets flow (kept for /api/preview + /api/send-email) ─────────────
const AI_PROMPT = (lead) => `
You are an outreach email writer for Devtronics, a full-stack SaaS development agency run by Zia Arsalan.

Devtronics provides:
- Custom web and mobile app development
- LoyalIdeas (loyalideas.com) — a digital rewards card where guests build up and use points to increase repeat visits for F&B and hospitality businesses

Write a SHORT, professional outreach email to ${lead.name || 'there'} at ${lead.business || 'their company'}.

The ONLY facts you know about them:
- Name: ${lead.name || '(unknown)'}
- Business: ${lead.business || '(unknown)'}
- Website: ${lead.website || '(unknown)'}

CRITICAL: You have NOT visited their website and you have NO other information
about this business. Do NOT invent, guess or imply any specific detail (no made-up
products, locations, reviews, achievements or website observations). Use only the
facts listed above. If you know nothing specific, keep the opening general and honest
rather than fabricating something.

Email rules:
- Start with "Hi ${lead.name || 'there'},"
- Pitch LoyalIdeas (loyalideas.com) in 1-2 sentences, benefit-focused
- End with: "Want a quick look? Reply "Yes" and I will send it over."
- Add a new line: "To opt out from these emails, reply "No"."
- NO signature (the sender already has one)
- NO dashes (—) anywhere
- NO bullet points
- Keep it under 120 words total
- Tone: warm, professional, conversational

STRICT SPAM RULES — never use these words anywhere in subject or body:
- congratulations, winning, perfect, unsubscribe, stop, earn, redeem, collect, free, guarantee, limited, offer, deal, click, buy, purchase, sale, discount, bonus, gift, prize, reward (use "points" instead), spam, cash, money, income, profit

Subject line format:
"Grow ${lead.business || 'your'} Repeat Visits with a Digital Rewards Card"

Return your response in this EXACT JSON format (no markdown, no extra text):
{
  "subject": "your subject line here",
  "body": "your email body here"
}
`

const generateEmail = async (lead) => {
  const parsed = await generateJson(AI_PROMPT(lead))
  return { subject: parsed.subject, body: parsed.body }
}

// ── V2 flow: personalized opening line only (template supplies the rest) ─────
const INTRO_PROMPT = (lead, aiPrompt) => `
You are writing the personalized OPENING LINE of a cold outreach email from
Devtronics (a SaaS/app development studio run by Zia Arsalan) to
${lead.firstName || 'there'} at ${lead.company || 'their company'}.

The ONLY facts you know about this lead:
- First name: ${lead.firstName || '(unknown)'}
- Company: ${lead.company || '(unknown)'}
- Website: ${lead.website || '(unknown)'}
- Industry: ${lead.industry || '(unknown)'}
- Country: ${lead.country || '(unknown)'}

CRITICAL — DO NOT INVENT ANYTHING. You have NOT visited their website and you have
NO information beyond the fields above. Never state or imply a specific product,
location, recent post, achievement, review, team size, or observation about their
site unless it is literally one of the facts listed above. A generic-but-true
opener is far better than a specific-but-fabricated one. If you know nothing
specific, write an honest opener grounded only in their company name and industry.

Write ONLY the opening — not the whole email. The rest comes from a fixed template.

Rules for the intro:
- Under 50 words. Shorter is better.
- Natural, human, conversational. Write like a person, not a marketer.
- No marketing buzzwords (leverage, synergy, cutting-edge, seamless,
  game-changer, revolutionary, unlock, empower, elevate, etc.).
- No AI-sounding phrasing (no "I hope this email finds you well", "I came across
  your", "As a fellow", "In today's fast-paced world").
- Do NOT include a greeting ("Hi Name,"), a pitch, a signature, or a CTA — just
  the 1-2 sentence personalized opener.${
    typeof aiPrompt === 'string' && aiPrompt.trim()
      ? `\n\nAdditional instructions for this campaign:\n${aiPrompt}`
      : ''
  }

Also produce a short, specific subject line (no buzzwords, no clickbait).

Return ONLY this JSON, no markdown, no extra text:
{ "intro": "...", "subject": "..." }
`

const generateIntro = async (lead, aiPrompt) => {
  const parsed = await generateJson(INTRO_PROMPT(lead, aiPrompt))
  return { intro: parsed.intro, subject: parsed.subject }
}

module.exports = { generateEmail, generateIntro }

/* ────────────────────────────────────────────────────────────────────────────
 * PREVIOUS PROVIDER — Anthropic Claude (+ web_search research). Preserved so we
 * can switch back: restore this code, drop the geminiClient import above, and
 * set ANTHROPIC_API_KEY in server/.env.
 *
 * Why we moved off it: the user switched to a Google Gemini key. Note the trade
 * -off — Claude's web_search ACTUALLY researched each company, so its intros
 * could cite real, specific details. The Gemini prompts above forbid that
 * because Gemini's grounding requires a billed plan. If you restore this, you
 * also get the old "Research the company first / mention ONE specific real
 * detail" prompts back.
 *
 * const axios = require('axios')
 * const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
 *
 * // --- Legacy Sheets email prompt (researched the site via web_search) ---
 * const AI_PROMPT_CLAUDE = (lead) => `
 * You are an outreach email writer for Devtronics, a full-stack SaaS development agency run by Zia Arsalan.
 *
 * Devtronics provides:
 * - Custom web and mobile app development
 * - LoyalIdeas (loyalideas.com) — a digital rewards card where guests build up and use points to increase repeat visits for F&B and hospitality businesses
 *
 * Your task:
 * 1. Visit the website: ${lead.website}
 * 2. Look for any real issues (broken pages, outdated design, placeholder text, missing content, errors, slow loading, under-construction pages, typos, etc.)
 * 3. Write a SHORT, personalized, professional outreach email to ${lead.name} at ${lead.business}
 *
 * Email rules:
 * - Start with "Hi ${lead.name},"
 * - Briefly compliment something SPECIFIC and REAL about their business (from the website) in a calm, observational tone
 * - If you found a website issue, mention it naturally as a helpful observation in ONE sentence
 * - If no clear issue is found, skip the website fix and focus purely on the rewards pitch
 * - Pitch LoyalIdeas (loyalideas.com) in 1-2 sentences, keep it benefit-focused
 * - End with: "Want a quick look? Reply "Yes" and I will send it over."
 * - Add a new line: "To opt out from these emails, reply "No"."
 * - NO signature (the sender already has one)
 * - NO dashes (—) anywhere
 * - NO bullet points
 * - Keep it under 120 words total
 * - Tone: warm, professional, conversational
 *
 * STRICT SPAM RULES — never use these words anywhere in subject or body:
 * - congratulations, winning, perfect, unsubscribe, stop, earn, redeem, collect, free, guarantee, limited, offer, deal, click, buy, purchase, sale, discount, bonus, gift, prize, reward (use "points" instead), spam, cash, money, income, profit
 *
 * Subject line format:
 * "Grow [Business Name] Repeat Visits with a Digital Rewards Card" — add "(+ Website Fix)" only if there is a real issue to mention.
 *
 * Return your response in this EXACT JSON format (no markdown, no extra text):
 * {
 *   "subject": "your subject line here",
 *   "body": "your email body here"
 * }
 * `
 *
 * // --- V2 intro prompt (researched the company via web_search) ---
 * const INTRO_PROMPT_CLAUDE = (lead, aiPrompt) => `
 * You are writing the personalized OPENING LINE of a cold outreach email from
 * Devtronics (a SaaS/app development studio run by Zia Arsalan) to
 * ${lead.firstName || 'there'} at ${lead.company || 'their company'}.
 *
 * Research the company first (website: ${lead.website || 'unknown'}) using web
 * search, then write ONLY the opening — not the whole email. The rest of the
 * email comes from a fixed template, so write just the personalized intro.
 *
 * Rules for the intro:
 * - Under 50 words. Shorter is better.
 * - Mention ONE specific, real detail about this company (something you actually
 *   found — a product, location, recent post, service, or a genuine observation
 *   about their site). No generic flattery.
 * - Natural, human, conversational. Write like a person, not a marketer.
 * - No marketing buzzwords (leverage, synergy, cutting-edge, seamless,
 *   game-changer, revolutionary, unlock, empower, elevate, etc.).
 * - No AI-sounding phrasing (no "I hope this email finds you well", "I came across
 *   your", "As a fellow", "In today's fast-paced world").
 * - Do NOT include a greeting ("Hi Name,"), a pitch, a signature, or a CTA — just
 *   the 1-2 sentence personalized opener.${
 *     typeof aiPrompt === 'string' && aiPrompt.trim()
 *       ? `\n\nAdditional instructions for this campaign:\n${aiPrompt}`
 *       : ''
 *   }
 *
 * Also produce a short, specific subject line (no buzzwords, no clickbait).
 *
 * Return ONLY this JSON, no markdown, no extra text:
 * { "intro": "...", "subject": "..." }
 * `
 *
 * // --- Shared Claude call: web_search tool + JSON extraction from the last text block ---
 * const callClaude = async (prompt) => {
 *   const response = await axios
 *     .post(
 *       ANTHROPIC_API_URL,
 *       {
 *         model: 'claude-sonnet-4-6',
 *         max_tokens: 1000,
 *         tools: [{ type: 'web_search_20250305', name: 'web_search' }],
 *         messages: [{ role: 'user', content: prompt }],
 *       },
 *       {
 *         headers: {
 *           'Content-Type': 'application/json',
 *           'x-api-key': process.env.ANTHROPIC_API_KEY,
 *           'anthropic-version': '2023-06-01',
 *           'anthropic-beta': 'web-search-2025-03-05',
 *         },
 *       },
 *     )
 *     .catch((err) => {
 *       console.log('AI Error', err)
 *       throw err
 *     })
 *
 *   // Response may contain tool_use blocks; the JSON lives in the LAST text block.
 *   const content = response.data.content || []
 *   const textBlocks = content.filter((b) => b.type === 'text').map((b) => b.text)
 *   const textBlock = textBlocks[textBlocks.length - 1] || ''
 *   const jsonStart = textBlock.indexOf('{')
 *   const jsonEnd = textBlock.lastIndexOf('}')
 *   if (jsonStart === -1 || jsonEnd === -1)
 *     throw new Error('No JSON object found in text block')
 *   return JSON.parse(textBlock.slice(jsonStart, jsonEnd + 1))
 * }
 *
 * const generateEmailClaude = async (lead) => {
 *   const parsed = await callClaude(AI_PROMPT_CLAUDE(lead))
 *   return { subject: parsed.subject, body: parsed.body }
 * }
 *
 * const generateIntroClaude = async (lead, aiPrompt) => {
 *   const parsed = await callClaude(INTRO_PROMPT_CLAUDE(lead, aiPrompt))
 *   return { intro: parsed.intro, subject: parsed.subject }
 * }
 * ──────────────────────────────────────────────────────────────────────────── */
