// Public inbound WhatsApp webhook for the Follow-ups module (Meta WhatsApp
// Business Cloud API). Mounted ABOVE requireAuth in routes/api.js because Meta
// is not an authenticated user — exactly like the unsubscribe routes.
//
// Gated behind config.followups.whatsappCloud.webhookEnabled: when off, both
// verbs 404 so the endpoint is effectively absent. The POST handler verifies
// Meta's X-Hub-Signature-256 HMAC over the raw body before trusting anything.
//
// Behavior: a member replying "DONE" (case-insensitive) marks ALL their pending
// current-period tasks done; "DONE 2" marks the 2nd pending task; "DONE <title>"
// marks the task whose title matches. completedBy = 'member_reply'.
const express = require('express')
const crypto = require('crypto')
const axios = require('axios')
const router = express.Router()

const config = require('../config')
const { Member } = require('../models')
const followupService = require('../services/followupService')
const phone = require('../services/phoneService')

const wa = () => config.followups.whatsappCloud

// GET — Meta's webhook verification handshake.
router.get('/', (req, res) => {
  if (!wa().webhookEnabled) return res.sendStatus(404)
  const mode = req.query['hub.mode']
  const token = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']
  if (mode === 'subscribe' && token && token === wa().verifyToken) {
    return res.status(200).send(challenge)
  }
  return res.sendStatus(403)
})

// Verify Meta's HMAC-SHA256 signature over the raw request body.
const signatureValid = (req) => {
  const secret = wa().appSecret
  if (!secret) return false
  const header = req.headers['x-hub-signature-256'] || ''
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(req.rawBody || Buffer.from('')).digest('hex')
  const a = Buffer.from(header)
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

// Parse "DONE", "DONE 2", "DONE <title>" → { all } | { index } | { title }.
const parseDone = (text) => {
  const t = String(text || '').trim()
  const m = /^done\b\s*(.*)$/i.exec(t)
  if (!m) return null
  const rest = m[1].trim()
  if (!rest) return { all: true }
  if (/^\d+$/.test(rest)) return { index: parseInt(rest, 10) }
  return { title: rest }
}

// Best-effort free-form session reply (allowed within the 24h window since the
// member just messaged us). Never throws out of the webhook.
const replyText = async (to, body) => {
  try {
    const c = wa()
    if (!c.token || !c.phoneNumberId) return
    await axios.post(
      `https://graph.facebook.com/${c.graphVersion}/${c.phoneNumberId}/messages`,
      { messaging_product: 'whatsapp', to, type: 'text', text: { body } },
      { headers: { Authorization: `Bearer ${c.token}` }, timeout: 10000 },
    )
  } catch (_) {}
}

const handleMessage = async (msg) => {
  if (!msg || msg.type !== 'text' || !msg.text) return
  const from = String(msg.from || '').replace(/\D/g, '')
  const parsed = parseDone(msg.text.body)
  if (!from || !parsed) return

  // Match on stored digits; also try a normalized variant for robustness.
  const member =
    (await Member.findOne({ phone: from })) ||
    (await Member.findOne({ phone: phone.normalize(from) }))
  if (!member || !member.isActive) return

  // Resolve which task(s) the reply targets against the member's pending set.
  const now = new Date()
  const groups = await followupService.pendingByMember([member._id], now)
  const pending = (groups[0] && groups[0].pending) || []
  if (!pending.length) {
    await replyText(from, `Hi ${member.name}, you have no pending tasks right now. 👍`)
    return
  }

  let taskId = null
  if (parsed.index) {
    const pick = pending[parsed.index - 1]
    if (!pick) {
      await replyText(from, `Couldn't find task #${parsed.index}. Reply DONE to clear all, or DONE <task name>.`)
      return
    }
    taskId = pick.taskId
  } else if (parsed.title) {
    const needle = parsed.title.toLowerCase()
    const pick = pending.find((p) => p.title.toLowerCase().includes(needle))
    if (!pick) {
      await replyText(from, `Couldn't match "${parsed.title}". Reply DONE to clear all, or DONE <number>.`)
      return
    }
    taskId = pick.taskId
  }

  const n = await followupService.markMemberDone(member._id, { now, by: 'member_reply', taskId })
  const after = await followupService.pendingByMember([member._id], now)
  const left = (after[0] && after[0].pending) || []
  if (left.length) {
    await replyText(
      from,
      `Thanks ${member.name}! Marked ${n} done. Still pending:\n` +
        left.map((p) => '• ' + p.title).join('\n'),
    )
  } else {
    await replyText(from, `Thanks ${member.name}! All caught up — nothing pending. 🎉`)
  }
}

// POST — inbound message notifications.
router.post('/', async (req, res) => {
  if (!wa().webhookEnabled) return res.sendStatus(404)
  if (!signatureValid(req)) return res.sendStatus(401)
  // Acknowledge immediately; process after so Meta never retries on our latency.
  res.sendStatus(200)
  try {
    const entries = (req.body && req.body.entry) || []
    for (const entry of entries) {
      for (const change of entry.changes || []) {
        const messages = (change.value && change.value.messages) || []
        for (const msg of messages) await handleMessage(msg)
      }
    }
  } catch (_) {
    // Already responded 200; swallow so we don't crash the process.
  }
})

module.exports = router
// Exposed for unit tests.
module.exports.parseDone = parseDone
