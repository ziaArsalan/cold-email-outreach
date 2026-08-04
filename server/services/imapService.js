// IMAP reader for reply detection. Read-only: opens a mailbox's INBOX and pulls
// messages newer than the last processed UID. Never deletes/moves anything.
// Send path is unchanged (SMTP/Brevo) — replies just land in the real inbox.

const { ImapFlow } = require('imapflow')
const { simpleParser } = require('mailparser')

const DEFAULT_HOST = process.env.IMAP_DEFAULT_HOST || 'mail.privateemail.com'
const DEFAULT_PORT = Number(process.env.IMAP_DEFAULT_PORT) || 993

const clientFor = (mailbox) =>
  new ImapFlow({
    host: mailbox.imapHost || DEFAULT_HOST,
    port: mailbox.imapPort || DEFAULT_PORT,
    secure: true,
    auth: {
      user: mailbox.imapUser || mailbox.username || mailbox.email,
      pass: mailbox.imapPassword,
    },
    logger: false,
  })

// Verify login + INBOX access. Returns { ok, messages } or throws a clean Error.
const testConnection = async (mailbox) => {
  const client = clientFor(mailbox)
  try {
    await client.connect()
    const mbx = await client.mailboxOpen('INBOX', { readOnly: true })
    return { ok: true, messages: mbx.exists }
  } finally {
    await client.logout().catch(() => {})
  }
}

// Fetch INBOX messages with UID > sinceUid. On the FIRST run (sinceUid 0) we only
// set the watermark to the current newest UID — we don't backfill the whole inbox
// (that would mark years of old mail as fresh replies). Returns { messages, maxUid }.
const fetchNewMessages = async (mailbox, sinceUid = 0, limit = 50) => {
  const client = clientFor(mailbox)
  const out = []
  let maxUid = sinceUid || 0
  try {
    await client.connect()
    const mbx = await client.mailboxOpen('INBOX', { readOnly: true })

    if (!sinceUid) {
      const watermark = mbx.uidNext ? mbx.uidNext - 1 : 0
      return { messages: [], maxUid: watermark }
    }

    for await (const msg of client.fetch(
      `${sinceUid + 1}:*`,
      { uid: true, envelope: true, source: true },
      { uid: true },
    )) {
      if (!msg.uid || msg.uid <= sinceUid) continue
      if (msg.uid > maxUid) maxUid = msg.uid
      let parsed = null
      try {
        parsed = await simpleParser(msg.source)
      } catch (_) {}
      const from = msg.envelope?.from?.[0] || parsed?.from?.value?.[0] || {}
      out.push({
        uid: msg.uid,
        fromEmail: String(from.address || '').toLowerCase().trim(),
        fromName: from.name || '',
        subject: msg.envelope?.subject || parsed?.subject || '',
        messageId: msg.envelope?.messageId || parsed?.messageId || '',
        date: msg.envelope?.date || parsed?.date || new Date(),
        text: String(parsed?.text || '').trim(),
        autoSubmitted:
          /auto-(replied|generated|notified)/i.test(
            parsed?.headers?.get('auto-submitted') || '',
          ) || !!parsed?.headers?.get('x-autoreply'),
      })
      if (out.length >= limit) break
    }
    return { messages: out, maxUid }
  } finally {
    await client.logout().catch(() => {})
  }
}

// Heuristic auto-reply / bounce filter so an out-of-office doesn't mark a lead
// "replied" and stop a live sequence.
const AUTO_SUBJECT =
  /(out of office|automatic reply|auto.?reply|vacation|away from|delivery status|undeliverable|mail delivery|failure notice|do not reply|no-?reply)/i
const isAutoReply = (msg) =>
  msg.autoSubmitted || AUTO_SUBJECT.test(msg.subject || '')

module.exports = { testConnection, fetchNewMessages, isAutoReply }
