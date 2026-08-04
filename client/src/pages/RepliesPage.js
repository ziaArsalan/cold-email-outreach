import React from 'react'
import { useApp } from '../context/AppContext'
import { fmtDate, trunc } from '../utils'

// Inbound replies detected by the IMAP worker. Each row is a lead who replied —
// the lead was auto-marked 'replied' (their follow-ups stopped) when detected.
export default function RepliesPage() {
  const { replies, fetchReplies } = useApp()

  return (
    <div className='tab-content'>
      <div className='page-header'>
        <h1>Replies</h1>
        <p>
          Inbound replies from leads (detected automatically). A reply stops
          that lead's follow-up sequence.
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
          <button className='btn-ghost' onClick={() => fetchReplies(replies.page)}>
            ↻ Refresh
          </button>
        </div>

        {replies.items.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '13px' }}>
            No replies detected yet. Enable reply detection (IMAP) on a mailbox
            in the Dashboard, and replies from your leads will appear here.
          </p>
        ) : (
          <div className='table-wrapper'>
            <table>
              <thead>
                <tr>
                  <th>From</th>
                  <th>Campaign</th>
                  <th>Subject</th>
                  <th>Preview</th>
                  <th>Inbox</th>
                  <th>Received</th>
                </tr>
              </thead>
              <tbody>
                {replies.items.map((r) => (
                  <tr key={r._id}>
                    <td className='td-email'>
                      {r.fromName ? `${r.fromName} · ` : ''}
                      {r.leadEmail || r.fromEmail}
                    </td>
                    <td>{r.campaignName || '—'}</td>
                    <td className='cell-trunc' title={r.subject || ''}>
                      {trunc(r.subject, 48) || '—'}
                    </td>
                    <td className='cell-trunc' title={r.snippet || ''}>
                      {trunc(r.snippet, 60) || '—'}
                    </td>
                    <td className='td-email'>{r.mailboxEmail || '—'}</td>
                    <td>{fmtDate(r.receivedAt)}</td>
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
              disabled={replies.page <= 1}
              onClick={() => fetchReplies(replies.page - 1)}
            >
              ← Prev
            </button>
            <span style={{ fontSize: '13px', color: 'var(--muted)' }}>
              Page {replies.page} of {replies.pages}
            </span>
            <button
              className='btn-ghost'
              disabled={replies.page >= replies.pages}
              onClick={() => fetchReplies(replies.page + 1)}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
