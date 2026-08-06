import React, { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import { fmtDate, trunc } from '../utils'

// Inbound replies detected by the IMAP worker. Each row is someone who replied
// to one of your mailboxes; if they match a lead, that lead was auto-marked
// 'replied' (their follow-ups stopped).
export default function RepliesPage() {
  const {
    replies,
    fetchReplies,
    repliesBusy,
    replyMailbox,
    filterRepliesByMailbox,
    mailboxes,
    fetchMailboxes,
  } = useApp()

  // Full-email viewer (local — opened from the Preview column).
  const [viewing, setViewing] = useState(null)

  useEffect(() => {
    if (!mailboxes.length) fetchMailboxes()
    // eslint-disable-next-line
  }, [])

  return (
    <div className='tab-content'>
      <div className='page-header'>
        <h1>Replies</h1>
        <p>
          Inbound replies from leads (detected automatically). A reply from a
          lead stops that lead's follow-up sequence.
        </p>
      </div>

      <div className='card table-card'>
        <div
          className='bulk-actions'
          style={{ justifyContent: 'space-between', alignItems: 'center' }}
        >
          <h2 style={{ margin: 0 }}>
            Recent replies{replies.total ? ` (${replies.total})` : ''}
          </h2>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <select
              value={replyMailbox}
              onChange={(e) => filterRepliesByMailbox(e.target.value)}
              title='Filter by the inbox that received the reply'
            >
              <option value=''>All inboxes</option>
              {mailboxes.map((m) => (
                <option key={m._id} value={m._id}>
                  {m.email}
                </option>
              ))}
            </select>
            <button
              className='btn-ghost'
              disabled={repliesBusy}
              onClick={() => fetchReplies(replies.page)}
            >
              {repliesBusy ? 'Refreshing…' : '↻ Refresh'}
            </button>
          </div>
        </div>

        {replies.items.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '13px' }}>
            {repliesBusy
              ? 'Loading…'
              : replyMailbox
                ? 'No replies for this inbox yet.'
                : 'No replies detected yet. Enable reply detection (IMAP) on a mailbox in the Dashboard, and replies from your leads will appear here.'}
          </p>
        ) : (
          <div className='table-wrapper'>
            <table>
              <thead>
                <tr>
                  <th>From</th>
                  <th>Subject</th>
                  <th>Preview</th>
                  <th>Campaign</th>
                  <th>Received</th>
                  <th>Inbox</th>
                </tr>
              </thead>
              <tbody>
                {replies.items.map((r) => (
                  <tr key={r._id}>
                    <td className='td-email'>
                      {r.fromName ? `${r.fromName} · ` : ''}
                      {r.leadEmail || r.fromEmail}
                    </td>
                    <td className='cell-trunc' title={r.subject || ''}>
                      {trunc(r.subject, 40) || '—'}
                    </td>
                    <td>
                      <div
                        style={{
                          display: 'flex',
                          gap: '0.5rem',
                          alignItems: 'center',
                        }}
                      >
                        <span
                          className='cell-trunc'
                          title={r.snippet || ''}
                          style={{ maxWidth: 220 }}
                        >
                          {trunc(r.snippet, 48) || '—'}
                        </span>
                        <button
                          className='btn-preview'
                          onClick={() => setViewing(r)}
                        >
                          View
                        </button>
                      </div>
                    </td>
                    <td>{r.campaignName || '—'}</td>
                    <td>{fmtDate(r.receivedAt)}</td>
                    <td className='td-email'>{r.mailboxEmail || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {replies.pages > 1 && (
          <div className='queue-pagination'>
            <button
              className='btn-ghost'
              disabled={replies.page <= 1 || repliesBusy}
              onClick={() => fetchReplies(replies.page - 1)}
            >
              ← Prev
            </button>
            <span style={{ fontSize: '13px', color: 'var(--muted)' }}>
              Page {replies.page} of {replies.pages}
            </span>
            <button
              className='btn-ghost'
              disabled={replies.page >= replies.pages || repliesBusy}
              onClick={() => fetchReplies(replies.page + 1)}
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {/* Full-email viewer */}
      {viewing && (
        <div className='modal-overlay' onClick={() => setViewing(null)}>
          <div
            className='modal-card'
            style={{ maxWidth: 720, width: '95%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className='modal-close btn-ghost'
              onClick={() => setViewing(null)}
            >
              ✕ Close
            </button>
            <h3 style={{ margin: '0 0 0.5rem' }}>
              {viewing.subject || '(no subject)'}
            </h3>
            <p style={{ margin: '0 0 0.25rem', fontSize: '13px' }}>
              <strong>From:</strong>{' '}
              {viewing.fromName ? `${viewing.fromName} · ` : ''}
              {viewing.leadEmail || viewing.fromEmail}
            </p>
            <p
              style={{
                margin: '0 0 1rem',
                fontSize: '13px',
                color: 'var(--muted)',
              }}
            >
              To {viewing.mailboxEmail || '—'}
              {viewing.campaignName ? ` · ${viewing.campaignName}` : ''} ·{' '}
              {fmtDate(viewing.receivedAt)}
            </p>
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: '55vh',
                overflowY: 'auto',
                margin: 0,
                fontFamily: 'inherit',
                fontSize: '13px',
                lineHeight: 1.5,
              }}
            >
              {viewing.body || viewing.snippet || '(no text content)'}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
