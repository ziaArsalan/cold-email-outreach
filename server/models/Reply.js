const mongoose = require('mongoose')

// An inbound reply detected by the IMAP poller. One row per matched reply so the
// Replies view can show who replied, to which campaign, and a snippet — and so we
// never double-process the same message (unique on mailboxId + messageId).
const replySchema = new mongoose.Schema(
  {
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },
    mailboxId: { type: mongoose.Schema.Types.ObjectId, ref: 'Mailbox' },
    fromEmail: String,
    fromName: String,
    subject: String,
    snippet: String, // first ~300 chars, for the table preview
    body: String, // full plain-text body (capped), for "view full email"
    messageId: String, // RFC Message-ID header (dedupe key)
    receivedAt: Date,
  },
  { timestamps: true },
)

replySchema.index({ mailboxId: 1, messageId: 1 }, { unique: true, sparse: true })
replySchema.index({ receivedAt: -1 })
replySchema.index({ leadId: 1 })

module.exports = mongoose.model('Reply', replySchema)
