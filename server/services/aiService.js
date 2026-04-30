const axios = require('axios')

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'

const AI_PROMPT = (lead) => `
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

const generateEmail = async (lead) => {
  const response = await axios.post(
    ANTHROPIC_API_URL,
    {
      model: 'claude-sonnet-4-20250514',
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

  // Extract text from response (may contain tool_use blocks)
  const content = response.data.content || []
  const textBlocks = content.filter((b) => b.type === 'text').map((b) => b.text)

  // Get the last text block which contains the JSON (after Claude's reasoning/web search)
  const textBlock = textBlocks[textBlocks.length - 1] || ''

  console.log('Content', content)
  console.log('Extracted Text Block', textBlock)

  // Parse JSON from the text
  const cleaned = textBlock.replace(/```json|```/g, '').trim()
  const parsed = JSON.parse(cleaned)

  return {
    subject: parsed.subject,
    body: parsed.body,
  }
}

module.exports = { generateEmail }

// Logging utility to keep jobState.logs manageable and consistent
/*
Content [
  {
    type: 'server_tool_use',
    id: 'srvtoolu_01W225qCuHGH7HgcZHv7FCQg',
    name: 'web_search',
    input: { query: 'lagaufrette.com website' }
  },
  {
    type: 'web_search_tool_result',
    tool_use_id: 'srvtoolu_01W225qCuHGH7HgcZHv7FCQg',
    content: [
      [Object], [Object],
      [Object], [Object],
      [Object], [Object],
      [Object], [Object],
      [Object], [Object]
    ],
    caller: { type: 'direct' }
  },
  {
    type: 'text',
    text: 'Based on the search results, I can see that La Gaufrette is a well-established Dubai restaurant/coffee shop with locations in Deira City Centre. However, I noticed an issue: their menu pages are showing only "Loading" text instead of displaying actual menu content, which suggests broken functionality. This is a clear website issue that would impact customer experience.\n' +
      '\n' +
      '{\n' +
      '  "subject": "Boost La Gaufrette Repeat Orders with Easy Loyalty Points (+ Website Fix)",\n' +
      `  "body": "Hi jabbar,\\n\\nI love La Gaufrette's beautiful motto about guests becoming friends and your impressive 33-year legacy in Dubai's F&B scene. I noticed your menu pages are currently showing \\"Loading\\" instead of displaying your offerings, which might be frustrating visitors trying to browse your delicious selection.\\n\\nOur LoyalIdeas digital loyalty system helps F&B businesses like yours increase repeat orders by letting customers earn and redeem points instantly on their phones, turning casual visitors into loyal regulars.\\n\\nInterested in a quick 2-minute demo? Just reply \\"Demo\\" and I will send it over.\\n\\nReply STOP to unsubscribe."\n` +
      '}'
  }
]
Extracted Text Block Based on the search results, I can see that La Gaufrette is a well-established Dubai restaurant/coffee shop with locations in Deira City Centre. However, I noticed an issue: their menu pages are showing only "Loading" text instead of displaying actual menu content, which suggests broken functionality. This is a clear website issue that would impact customer experience.

{
  "subject": "Boost La Gaufrette Repeat Orders with Easy Loyalty Points (+ Website Fix)",
  "body": "Hi jabbar,\n\nI love La Gaufrette's beautiful motto about guests becoming friends and your impressive 33-year legacy in Dubai's F&B scene. I noticed your menu pages are currently showing \"Loading\" instead of displaying your offerings, which might be frustrating visitors trying to browse your delicious selection.\n\nOur LoyalIdeas digital loyalty system helps F&B businesses like yours increase repeat orders by letting customers earn and redeem points instantly on their phones, turning casual visitors into loyal regulars.\n\nInterested in a quick 2-minute demo? Just reply \"Demo\" and I will send it over.\n\nReply STOP to unsubscribe."
}
*/
