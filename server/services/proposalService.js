// Cover-letter generation in Zia's brand voice via Claude.
// Mirrors the axios call style in aiService.js (x-api-key, anthropic-version
// 2023-06-01). Single prompt builder so the voice can be refined in one place.

const axios = require('axios');

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

const PROPOSAL_PROMPT = (job) => `
You are writing an Upwork cover letter on behalf of Zia Arsalan Abdullah, senior full-stack developer and founder of Devtronics (devtronics.co), with 10+ years of experience.

Zia's portfolio (reference items only when relevant to the job):
- Recrula — AI recruitment platform
- LoyalIdeas — Apple/Google Wallet loyalty SaaS
- Tourdec — eBike fleet management
- Meet Gabbi — AI customer support agent
- Car-rental platforms running in 3 countries
- 3 published GoHighLevel (GHL) marketplace apps
Target clients: US/UK/UAE. Niches: AI products, SaaS, wallet/loyalty, CRM, GHL apps.
Contact: zia@devtronics.co · calendly.com/ziaarsalan/let-s-connect

The job:
- Title: ${job.title}
- Skills: ${(job.skills || []).join(', ')}
- Client country: ${job.clientCountry || 'unknown'}
- Description: ${job.description || '(no description provided)'}

Rules for the cover letter:
- Under 200 words.
- Lead with the client's specific problem, not with Zia.
- Direct and confident tone.
- Reference relevant portfolio items only when they genuinely fit the job.
- NEVER use generic filler such as "I am hardworking", "I am a great fit", "I am passionate", "I am the perfect candidate", "I have a keen eye for detail".
- Write it as a ready-to-send letter — no preamble, no headers, no markdown, no commentary. Return ONLY the letter text.
`;

const generateProposal = async (job) => {
  const response = await axios
    .post(
      ANTHROPIC_API_URL,
      {
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: PROPOSAL_PROMPT(job),
          },
        ],
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
      },
    )
    .catch((err) => {
      console.log('Proposal AI Error', err.message);
      throw err;
    });

  const content = response.data.content || [];
  const textBlocks = content.filter((b) => b.type === 'text').map((b) => b.text);
  const letter = (textBlocks[textBlocks.length - 1] || '').trim();

  if (!letter) {
    throw new Error('No text returned from Claude for proposal');
  }

  return letter;
};

module.exports = { generateProposal };
