// Reply handling shared by the manual "Mark replied" button and the IMAP poller.
// Marking a lead 'replied' stops their sequence: the send worker already skips
// replied leads, and we ALSO eagerly cancel their queued follow-ups so the queue
// reflects it immediately. Optionally records the inbound reply for the Replies
// view (deduped by mailbox + Message-ID).

const { Lead, QueuedEmail, Reply, SendLog } = require('../models')

// Mark a lead replied + cancel in-flight follow-ups, and optionally store the
// inbound reply. Idempotent: re-marking an already-replied lead won't re-cancel,
// but a new reply record is still saved (a lead can reply more than once).
const markLeadReplied = async (lead, { note = 'manual', reply = null } = {}) => {
  if (lead.status !== 'replied') {
    lead.status = 'replied'
    lead.replyStatus = note
    lead.lastContactDate = lead.lastContactDate || new Date()
    await lead.save()
    await QueuedEmail.updateMany(
      { leadId: lead._id, status: { $in: ['pending', 'scheduled'] } },
      { $set: { status: 'cancelled', errorMessage: 'lead replied' } },
    )
    await SendLog.create({
      level: 'info',
      category: 'campaign',
      message: `Lead replied (${note}): ${lead.email}`,
      refs: { leadId: lead._id, campaignId: lead.campaignId || undefined },
      meta: { email: lead.email },
    }).catch(() => {})
  }

  if (reply) {
    try {
      await Reply.create({ leadId: lead._id, ...reply })
    } catch (err) {
      // Duplicate (mailboxId+messageId) → already recorded; ignore.
      if (err.code !== 11000) throw err
    }
  }
  return lead
}

module.exports = { markLeadReplied }
