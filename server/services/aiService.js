const axios = require('axios')

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'

const AI_PROMPT_v1 = (lead) => `
You are an outreach email writer for Devtronics, a full-stack SaaS development agency run by Zia Arsalan.

Devtronics provides:
- Custom web and mobile app development
- LoyalIdeas loyalty app (loyalideas.com) — a digital loyalty card system where customers earn and redeem points instantly to increase repeat orders for F&B businesses

Your task:
1. Visit the website: ${lead.website}
2. Look for any real issues (broken pages, outdated design, placeholder text, missing content, errors, slow loading, under-construction pages, typos, etc.)
3. Write a SHORT, personalized, professional outreach email to ${lead.name} at ${lead.business}

Email rules:
- Start with "Hi ${lead.name},"
- Briefly compliment something SPECIFIC and REAL about their business (from the website)
- If you found a website issue, mention it naturally as a helpful observation in ONE sentence
- If no clear issue is found, skip the website fix and focus purely on loyalty
- Pitch LoyalIdeas (loyalideas.com) in 1-2 sentences — keep it benefit-focused
- End with: "Interested in a quick 2-minute demo? Just reply "Demo" and I will send it over."
- Add a new line: "Reply STOP to unsubscribe."
- NO signature (the sender already has one)
- NO dashes (—) anywhere
- NO bullet points
- Keep it under 120 words total
- Tone: warm, professional, conversational

Also write a compelling subject line in this format:
"Boost [Business Name] Repeat Orders with Easy Loyalty Points" — add "(+ Website Fix)" only if there is a real issue to mention.

Return your response in this EXACT JSON format (no markdown, no extra text):
{
  "subject": "your subject line here",
  "body": "your email body here"
}
`

const AI_PROMPT = (lead) => `
You are an outreach email writer for Devtronics, a full-stack SaaS development agency run by Zia Arsalan.

Devtronics provides:
- Custom web and mobile app development
- LoyalIdeas (loyalideas.com) — a digital rewards card where guests build up and use points to increase repeat visits for F&B and hospitality businesses

Your task:
1. Visit the website: ${lead.website}
2. Look for any real issues (broken pages, outdated design, placeholder text, missing content, errors, slow loading, under-construction pages, typos, etc.)
3. Write a SHORT, personalized, professional outreach email to ${lead.name} at ${lead.business}

Email rules:
- Start with "Hi ${lead.name},"
- Briefly compliment something SPECIFIC and REAL about their business (from the website) in a calm, observational tone
- If you found a website issue, mention it naturally as a helpful observation in ONE sentence
- If no clear issue is found, skip the website fix and focus purely on the rewards pitch
- Pitch LoyalIdeas (loyalideas.com) in 1-2 sentences, keep it benefit-focused
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
"Grow [Business Name] Repeat Visits with a Digital Rewards Card" — add "(+ Website Fix)" only if there is a real issue to mention.

Return your response in this EXACT JSON format (no markdown, no extra text):
{
  "subject": "your subject line here",
  "body": "your email body here"
}
`

const generateEmail = async (lead) => {
  const response = await axios
    .post(
      ANTHROPIC_API_URL,
      {
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        tools: [
          {
            type: 'web_search_20250305',
            name: 'web_search',
          },
        ],
        messages: [
          {
            role: 'user',
            content: AI_PROMPT(lead),
          },
        ],
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'web-search-2025-03-05',
        },
      },
    )
    .catch((err) => {
      console.log('AI Error', err)
      throw err
    })

  // Extract text from response (may contain tool_use blocks)
  const content = response.data.content || []
  const textBlocks = content.filter((b) => b.type === 'text').map((b) => b.text)

  // Get the last text block which contains the JSON (after Claude's reasoning/web search)
  const textBlock = textBlocks[textBlocks.length - 1] || ''

  // console.log('Content', content)
  // console.log('Extracted Text Block', textBlock)

  // Extract JSON by finding the first '{' and last '}'
  const jsonStart = textBlock.indexOf('{')
  const jsonEnd = textBlock.lastIndexOf('}')

  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error('No JSON object found in text block')
  }

  // Parse JSON from the text
  const jsonString = textBlock.slice(jsonStart, jsonEnd + 1)
  const parsed = JSON.parse(jsonString)

  return {
    subject: parsed.subject,
    body: parsed.body,
  }
}

const INTRO_PROMPT = (lead, aiPrompt) => `
You are writing the personalized OPENING LINE of a cold outreach email from
Devtronics (a SaaS/app development studio run by Zia Arsalan) to
${lead.firstName || 'there'} at ${lead.company || 'their company'}.

Research the company first (website: ${lead.website || 'unknown'}) using web
search, then write ONLY the opening — not the whole email. The rest of the
email comes from a fixed template, so write just the personalized intro.

Rules for the intro:
- Under 50 words. Shorter is better.
- Mention ONE specific, real detail about this company (something you actually
  found — a product, location, recent post, service, or a genuine observation
  about their site). No generic flattery.
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
  const response = await axios
    .post(
      ANTHROPIC_API_URL,
      {
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        tools: [
          {
            type: 'web_search_20250305',
            name: 'web_search',
          },
        ],
        messages: [
          {
            role: 'user',
            content: INTRO_PROMPT(lead, aiPrompt),
          },
        ],
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'web-search-2025-03-05',
        },
      },
    )
    .catch((err) => {
      console.log('AI Error', err)
      throw err
    })

  // Extract text from response (may contain tool_use blocks)
  const content = response.data.content || []
  const textBlocks = content.filter((b) => b.type === 'text').map((b) => b.text)

  // Get the last text block which contains the JSON (after web search)
  const textBlock = textBlocks[textBlocks.length - 1] || ''

  // Extract JSON by finding the first '{' and last '}'
  const jsonStart = textBlock.indexOf('{')
  const jsonEnd = textBlock.lastIndexOf('}')

  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error('No JSON object found in text block')
  }

  // Parse JSON from the text
  const jsonString = textBlock.slice(jsonStart, jsonEnd + 1)
  const parsed = JSON.parse(jsonString)

  return {
    intro: parsed.intro,
    subject: parsed.subject,
  }
}

module.exports = { generateEmail, generateIntro }

// function parseJSON(){
//   const content = [
//     {
//       type: 'server_tool_use',
//       id: 'srvtoolu_01A4T5CWzVRSm7iRRnXdGNfU',
//       name: 'web_search',
//       input: { query: 'hotmail.com website' }
//     },
//     {
//       type: 'web_search_tool_result',
//       tool_use_id: 'srvtoolu_01A4T5CWzVRSm7iRRnXdGNfU',
//       content: [
//         [Object], [Object],
//         [Object], [Object],
//         [Object], [Object],
//         [Object], [Object],
//         [Object], [Object]
//       ],
//       caller: { type: 'direct' }
//     },
//     {
//       type: 'text',
//       text: `I need to clarify something important. Based on the search results, hotmail.com is not a business website that I can analyze for issues. Hotmail.com was an email service that was discontinued in 2013 and redirects to Outlook.com (Microsoft's current email service). The recipient "waad_sater" appears to be an email address (@hotmail.com), not a business owner with a website.\n` +
//         '\n' +
//         'Since this is an email service provider and not a business with a website that could benefit from loyalty programs or web development services, I cannot complete this task as requested. The email outreach would not be relevant or appropriate for this recipient.\n' +
//         '\n' +
//         "If you'd like me to write an outreach email for a different business with an actual website, please provide a business website URL instead."
//     }
//   ]

//   const textBlock = content.filter((b) => b.type === 'text').map((b) => b.text)
//   console.log('Text Block', textBlock)
//   const jsonStart = textBlock.indexOf('{')
//   const jsonEnd = textBlock.lastIndexOf('}')

//   if (jsonStart === -1 || jsonEnd === -1) {
//     throw new Error('No JSON object found in text block')
//   }

//   // Parse JSON from the text
//   const jsonString = textBlock.slice(jsonStart, jsonEnd + 1)
//   const parsed = JSON.parse(jsonString)

//   return parsed
// }

// console.log(parseJSON())
