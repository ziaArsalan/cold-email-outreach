// Background reply detector. Polls each IMAP-enabled mailbox's INBOX and, when a
// message comes FROM a known lead, marks that lead 'replied' (which stops their
// follow-ups) and records the reply for the Replies view. Read-only on the inbox.
//
// Gated by IMAP_WORKER_ENABLED=true (like the queue worker) so it only runs where
// intended (production), not on every dev machine sharing the DB.

const { Mailbox, Lead } = require('../models')
const { fetchNewMessages, isAutoReply } = require('../services/imapService')
const { markLeadReplied, recordReply } = require('../services/replyService')

const POLL_MS = Number(process.env.IMAP_POLL_MS) || 120000 // 2 min default
let timer = null

// Process one mailbox: fetch new INBOX messages, match each to a lead, mark
// replied. Persists the UID watermark so we never reprocess a message.
const pollMailbox = async (mailbox) => {
  const { messages, maxUid } = await fetchNewMessages(mailbox, mailbox.imapLastUid)

  let recorded = 0
  for (const msg of messages) {
    if (!msg.fromEmail || isAutoReply(msg)) continue
    // Ignore mail from our own sending addresses (loops / internal).
    const self = await Mailbox.exists({ email: msg.fromEmail })
    if (self) continue

    const reply = {
      mailboxId: mailbox._id,
      fromEmail: msg.fromEmail,
      fromName: msg.fromName,
      subject: msg.subject,
      snippet: (msg.text || '').slice(0, 300),
      body: (msg.text || '').slice(0, 20000), // full text (capped) for viewing
      messageId: msg.messageId,
      receivedAt: msg.date,
    }

    // From a known lead → mark them replied (stops follow-ups) + record it.
    // Otherwise still record the reply so nothing is missed (a lead may reply
    // from a different address); it just can't auto-stop a sequence.
    const lead = await Lead.findOne({ email: msg.fromEmail })
    if (lead) {
      await markLeadReplied(lead, {
        note: 'auto',
        reply: { ...reply, campaignId: lead.campaignId || undefined },
      })
    } else {
      await recordReply(reply)
    }
    recorded += 1
  }

  // Advance the watermark + health, even when nothing matched.
  await Mailbox.updateOne(
    { _id: mailbox._id },
    {
      $set: {
        imapLastUid: Math.max(mailbox.imapLastUid || 0, maxUid || 0),
        imapLastCheckedAt: new Date(),
        imapLastError: null,
      },
    },
  )
  return recorded
}

const tick = async () => {
  try {
    const boxes = await Mailbox.find({ imapEnabled: true, active: true }).select(
      '+imapPassword',
    )
    for (const mailbox of boxes) {
      try {
        const n = await pollMailbox(mailbox)
        if (n) console.log(`[imap] ${mailbox.email}: ${n} new repl${n === 1 ? 'y' : 'ies'}`)
      } catch (err) {
        console.warn(`[imap] ${mailbox.email} poll failed:`, err.message)
        await Mailbox.updateOne(
          { _id: mailbox._id },
          { $set: { imapLastError: err.message, imapLastCheckedAt: new Date() } },
        ).catch(() => {})
      }
    }
  } catch (err) {
    console.warn('[imap] tick error:', err.message)
  } finally {
    timer = setTimeout(tick, POLL_MS)
  }
}

const start = () => {
  if (process.env.IMAP_WORKER_ENABLED !== 'true') {
    console.log('[imap] reply detector disabled (set IMAP_WORKER_ENABLED=true)')
    return
  }
  if (timer) return
  console.log(`[imap] reply detector on — polling every ${POLL_MS}ms`)
  timer = setTimeout(tick, 5000) // small delay so boot finishes first
}

const stop = () => {
  if (timer) clearTimeout(timer)
  timer = null
}

module.exports = { start, stop, pollMailbox, tick }
