import React from 'react'
import { useApp } from '../context/AppContext'
import { fmtDate, trunc } from '../utils'

export default function DashboardPage() {
  const {
    analytics,
    mailboxBusy,
    mailboxForm,
    setMailboxForm,
    mailboxTestResult,
    queueActivity,
    queue,
    queueStatus,
    setQueueStatus,
    queuePage,
    setQueuePage,
    queueSort,
    sortQueue,
    toggleMailboxPause,
    fetchDashboardAll,
    openNewMailboxForm,
    saveMailbox,
    closeMailboxForm,
    testMailbox,
    openEditMailboxForm,
    fetchQueueActivity,
    fetchQueue,
    markLead,
    resendQueueItem,
  } = useApp()

  // Sortable Live Queue column header: click to sort, click again to flip. The
  // caret shows the active field/direction (populated Lead/Campaign columns are
  // not server-sortable, so they stay plain headers).
  const SortTh = ({ field, children }) => {
    const active = queueSort.field === field
    return (
      <th>
        <button
          type='button'
          className='th-sort'
          onClick={() => sortQueue(field)}
          aria-label={`Sort by ${field}`}
        >
          {children}
          <span className={active ? 'sort-caret active' : 'sort-caret'}>
            {active ? (queueSort.dir === 'asc' ? '▲' : '▼') : '↕'}
          </span>
        </button>
      </th>
    )
  }

  return (
    <div className='tab-content'>
      <div className='page-header'>
        <h1>Outreach Dashboard</h1>
        <p>Automate personalized cold emails powered by AI</p>
      </div>

      {/* Mailbox health alerts — paused / errored mailboxes block sending */}
      {analytics &&
        (analytics.mailboxes || [])
          .filter(
            (mb) =>
              mb.healthStatus === 'paused' || mb.healthStatus === 'error',
          )
          .map((mb) => (
            <div key={mb._id} className='mailbox-alert'>
              <div>
                <strong>⚠ {mb.email}</strong> is{' '}
                <span
                  className={`status-badge health-${mb.healthStatus}`}
                >
                  {mb.healthStatus}
                </span>{' '}
                — sending is halted for this mailbox.
                {mb.lastError && (
                  <div className='mailbox-alert-err'>{mb.lastError}</div>
                )}
              </div>
              <button
                className='btn-start'
                disabled={mailboxBusy}
                onClick={() => toggleMailboxPause(mb)}
              >
                ⚡ Reactivate
              </button>
            </div>
          ))}

      {/* Stat cards — queue-level sends + lead-level rates */}
      <div className='stats-grid'>
        <div className='stat-card stat-emailed'>
          <span className='stat-num'>
            {analytics ? analytics.cards.sent : 0}
          </span>
          <span className='stat-label'>Sent</span>
        </div>
        <div className='stat-card stat-pending'>
          <span className='stat-num'>
            {analytics ? analytics.cards.pending : 0}
          </span>
          <span className='stat-label'>Pending</span>
        </div>
        <div className='stat-card stat-failed'>
          <span className='stat-num'>
            {analytics ? analytics.cards.failed : 0}
          </span>
          <span className='stat-label'>Failed</span>
        </div>
        <div className='stat-card'>
          <span className='stat-num'>
            {analytics ? analytics.cards.replies : 0}
          </span>
          <span className='stat-label'>Replies</span>
        </div>
        <div className='stat-card'>
          <span className='stat-num'>
            {analytics
              ? (analytics.cards.bounceRate * 100).toFixed(1) + '%'
              : 0}
          </span>
          <span className='stat-label'>Bounce %</span>
        </div>
        <div className='stat-card'>
          <span className='stat-num'>
            {analytics
              ? (analytics.cards.replyRate * 100).toFixed(1) + '%'
              : 0}
          </span>
          <span className='stat-label'>Reply %</span>
        </div>
      </div>

      {/* Two-column layout: main content + queue-activity sidebar */}
      <div className='dashboard-layout'>
        <div className='dashboard-main'>
          {/* Mailboxes */}
          <div className='card table-card'>
            <div
              className='bulk-actions'
              style={{
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <h2 style={{ margin: 0 }}>Mailboxes</h2>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className='btn-ghost' onClick={fetchDashboardAll}>
                  ↻ Refresh
                </button>
                <button
                  className='btn-start'
                  onClick={openNewMailboxForm}
                >
                  + Add Mailbox
                </button>
              </div>
            </div>

            {mailboxForm && (
              <form
                onSubmit={saveMailbox}
                className='card'
                style={{
                  margin: '0 0 1rem',
                  background: 'var(--bg-alt)',
                }}
              >
                <h3 style={{ marginTop: 0 }}>
                  {mailboxForm._id ? 'Edit Mailbox' : 'New Mailbox'}
                </h3>
                <div className='settings-fields-grid'>
                  <div className='control-group'>
                    <label>Label / Name</label>
                    <input
                      value={mailboxForm.name}
                      onChange={(e) =>
                        setMailboxForm((f) => ({
                          ...f,
                          name: e.target.value,
                        }))
                      }
                      placeholder='Alex'
                      required
                    />
                  </div>
                  <div className='control-group'>
                    <label>Email (From address)</label>
                    <input
                      type='email'
                      value={mailboxForm.email}
                      onChange={(e) =>
                        setMailboxForm((f) => ({
                          ...f,
                          email: e.target.value,
                        }))
                      }
                      placeholder='alex@meetdevtronics.com'
                      required
                    />
                  </div>
                  <div className='control-group'>
                    <label>Provider</label>
                    <select
                      value={mailboxForm.provider || 'smtp'}
                      onChange={(e) =>
                        setMailboxForm((f) => ({
                          ...f,
                          provider: e.target.value,
                        }))
                      }
                    >
                      <option value='smtp'>SMTP</option>
                      <option value='brevo'>Brevo API (HTTP)</option>
                    </select>
                    <span className='field-note'>
                      Use Brevo API on hosts that block outbound SMTP (e.g.
                      DigitalOcean).
                    </span>
                  </div>
                  {mailboxForm.provider === 'brevo' && (
                    <div className='control-group'>
                      <label>
                        Brevo API Key{' '}
                        {mailboxForm._id && (
                          <span className='field-note'>
                            (leave blank to keep existing)
                          </span>
                        )}
                      </label>
                      <input
                        type='password'
                        value={mailboxForm.apiKey}
                        onChange={(e) =>
                          setMailboxForm((f) => ({
                            ...f,
                            apiKey: e.target.value,
                          }))
                        }
                        placeholder='leave blank to use the server default key'
                        autoComplete='new-password'
                      />
                    </div>
                  )}
                  {mailboxForm.provider !== 'brevo' && (
                  <>
                  <div className='control-group'>
                    <label>SMTP Host</label>
                    <input
                      value={mailboxForm.host}
                      onChange={(e) =>
                        setMailboxForm((f) => ({
                          ...f,
                          host: e.target.value,
                        }))
                      }
                      placeholder='mail.privateemail.com'
                      required
                    />
                  </div>
                  <div className='control-group'>
                    <label>Port</label>
                    <input
                      type='number'
                      value={mailboxForm.port}
                      onChange={(e) =>
                        setMailboxForm((f) => ({
                          ...f,
                          port: e.target.value,
                        }))
                      }
                      required
                    />
                  </div>
                  <div className='control-group'>
                    <label>
                      <input
                        type='checkbox'
                        checked={mailboxForm.secure}
                        onChange={(e) =>
                          setMailboxForm((f) => ({
                            ...f,
                            secure: e.target.checked,
                          }))
                        }
                      />{' '}
                      Secure (TLS/SSL, usually port 465)
                    </label>
                  </div>
                  <div className='control-group'>
                    <label>SMTP Username</label>
                    <input
                      value={mailboxForm.username}
                      onChange={(e) =>
                        setMailboxForm((f) => ({
                          ...f,
                          username: e.target.value,
                        }))
                      }
                      placeholder='usually same as email'
                      required
                    />
                  </div>
                  <div className='control-group'>
                    <label>
                      Password{' '}
                      {mailboxForm._id && (
                        <span className='field-note'>
                          (leave blank to keep existing)
                        </span>
                      )}
                    </label>
                    <input
                      type='password'
                      value={mailboxForm.password}
                      onChange={(e) =>
                        setMailboxForm((f) => ({
                          ...f,
                          password: e.target.value,
                        }))
                      }
                      required={!mailboxForm._id}
                      autoComplete='new-password'
                    />
                  </div>
                  </>
                  )}
                  <div className='control-group full-width'>
                    <label>Signature</label>
                    <textarea
                      rows={4}
                      value={mailboxForm.signature}
                      onChange={(e) =>
                        setMailboxForm((f) => ({
                          ...f,
                          signature: e.target.value,
                        }))
                      }
                      placeholder={
                        'Best,\nSarah\nDevtronics · +1 555 123 4567\nhttps://meetdevtronics.com'
                      }
                    />
                    <span className='field-note'>
                      Appended to every email sent from THIS mailbox (overrides the
                      template signature). Keep it to one link for deliverability.
                    </span>
                  </div>
                  <div className='control-group'>
                    <label>Daily Limit</label>
                    <input
                      type='number'
                      min='0'
                      value={mailboxForm.dailyLimit}
                      onChange={(e) =>
                        setMailboxForm((f) => ({
                          ...f,
                          dailyLimit: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className='control-group'>
                    <label>Hourly Limit</label>
                    <input
                      type='number'
                      min='0'
                      value={mailboxForm.hourlyLimit}
                      onChange={(e) =>
                        setMailboxForm((f) => ({
                          ...f,
                          hourlyLimit: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className='control-group'>
                    <label>
                      <input
                        type='checkbox'
                        checked={mailboxForm.warmupEnabled}
                        onChange={(e) =>
                          setMailboxForm((f) => ({
                            ...f,
                            warmupEnabled: e.target.checked,
                          }))
                        }
                      />{' '}
                      Warm-up enabled
                    </label>
                    <span className='field-note'>
                      Ramps the daily cap 5→10→20→30→40→50 over 4 weeks
                      from the start date below, then uses the plain Daily
                      Limit.
                    </span>
                  </div>
                  {mailboxForm.warmupEnabled && (
                    <div className='control-group'>
                      <label>Warm-up Start Date</label>
                      <input
                        type='date'
                        value={mailboxForm.warmupStartDate}
                        onChange={(e) =>
                          setMailboxForm((f) => ({
                            ...f,
                            warmupStartDate: e.target.value,
                          }))
                        }
                      />
                    </div>
                  )}
                </div>
                <div
                  style={{
                    marginTop: '1rem',
                    display: 'flex',
                    gap: '0.5rem',
                  }}
                >
                  <button
                    className='btn-start'
                    type='submit'
                    disabled={mailboxBusy}
                  >
                    {mailboxBusy
                      ? 'Saving…'
                      : mailboxForm._id
                        ? 'Save Changes'
                        : '+ Create Mailbox'}
                  </button>
                  <button
                    className='btn-ghost'
                    type='button'
                    onClick={closeMailboxForm}
                    disabled={mailboxBusy}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {mailboxTestResult && (
              <p
                style={{
                  fontSize: '13px',
                  color: mailboxTestResult.success
                    ? 'var(--success, #2e7d32)'
                    : 'var(--danger, #c62828)',
                }}
              >
                {mailboxTestResult.success
                  ? '✓ Connection verified.'
                  : '✗ Connection failed.'}
                {mailboxTestResult.warnings.length > 0 && (
                  <> Warnings: {mailboxTestResult.warnings.join('; ')}</>
                )}
              </p>
            )}

            {!analytics || analytics.mailboxes.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: '13px' }}>
                No mailboxes configured. Click "+ Add Mailbox" to add one.
              </p>
            ) : (
              <div className='table-wrapper'>
                <table>
                  <thead>
                    <tr>
                      <th>Mailbox</th>
                      <th>Health</th>
                      <th>Today</th>
                      <th>Warm-up</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.mailboxes.map((mb) => (
                      <tr key={mb._id}>
                        <td className='td-email'>{mb.email}</td>
                        <td>
                          <span
                            className={`status-badge health-${mb.healthStatus || 'healthy'}`}
                          >
                            {mb.healthStatus || 'healthy'}
                          </span>
                        </td>
                        <td>
                          {mb.sentToday || 0} / {mb.effectiveDailyCap}
                        </td>
                        <td>
                          {mb.warmupEnabled
                            ? `On (since ${fmtDate(mb.warmupStartDate).split(',')[0]})`
                            : 'Off'}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <button
                              className='btn-ghost'
                              disabled={mailboxBusy}
                              onClick={() => testMailbox(mb._id)}
                            >
                              Test
                            </button>
                            <button
                              className='btn-ghost'
                              disabled={mailboxBusy}
                              onClick={() => openEditMailboxForm(mb)}
                            >
                              Edit
                            </button>
                            <button
                              className={
                                mb.healthStatus === 'paused' ||
                                mb.healthStatus === 'error'
                                  ? 'btn-start'
                                  : 'btn-ghost'
                              }
                              disabled={mailboxBusy}
                              onClick={() => toggleMailboxPause(mb)}
                            >
                              {mb.healthStatus === 'paused' ||
                              mb.healthStatus === 'error'
                                ? '⚡ Reactivate'
                                : 'Pause'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Campaign performance */}
          <div className='card table-card'>
            <h2 style={{ margin: 0 }}>Campaign Performance</h2>
            {!analytics || analytics.campaigns.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: '13px' }}>
                No campaigns yet.
              </p>
            ) : (
              <div className='table-wrapper'>
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Status</th>
                      <th>Pending</th>
                      <th>Sent</th>
                      <th>Failed</th>
                      <th>Cancelled</th>
                      <th>Daily Limit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.campaigns.map((c) => {
                      const counts = c.counts || {}
                      return (
                        <tr key={c._id}>
                          <td>{c.name}</td>
                          <td>
                            <span
                              className={`status-badge badge-${c.status}`}
                            >
                              {c.status}
                            </span>
                          </td>
                          <td>{counts.pending || 0}</td>
                          <td>{counts.sent || 0}</td>
                          <td>{counts.failed || 0}</td>
                          <td>{counts.cancelled || 0}</td>
                          <td>{c.dailyLimit || 0}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* ── Sidebar: live queue activity ── */}
        <div className='dashboard-side'>
          <div
            className='card qa-sidebar'
            style={{ height: '350px', overflowY: 'auto' }}
          >
            <div
              className='bulk-actions'
              style={{
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <h2 style={{ margin: 0 }}>Queue Activity</h2>
              <button className='btn-ghost' onClick={fetchQueueActivity}>
                ↻
              </button>
            </div>

            <div className='qa-section'>
              <div className='qa-head qa-head-sending'>● Sending now</div>
              {queueActivity.sending[0] ? (
                <div className='qa-item'>
                  <span className='qa-email'>
                    {queueActivity.sending[0].leadEmail || '—'}
                  </span>
                  <span className='qa-sub'>
                    {queueActivity.sending[0].campaignName || 'campaign'}{' '}
                    · step {(queueActivity.sending[0].stepIndex || 0) + 1}
                  </span>
                </div>
              ) : (
                <div className='qa-empty'>Idle — nothing sending</div>
              )}
            </div>

            <div className='qa-section'>
              <div className='qa-head qa-head-next'>→ Next up</div>
              {queueActivity.next.length === 0 ? (
                <div className='qa-empty'>Nothing queued</div>
              ) : (
                queueActivity.next.slice(0, 5).map((it) => (
                  <div key={it._id} className='qa-item'>
                    <span className='qa-email'>
                      {it.leadEmail || '—'}
                    </span>
                    <span className='qa-sub'>
                      {it.scheduledAt
                        ? 'due ' +
                          new Date(it.scheduledAt).toLocaleTimeString(
                            [],
                            {
                              hour: '2-digit',
                              minute: '2-digit',
                            },
                          )
                        : 'due now'}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className='qa-section'>
              <div className='qa-head qa-head-sent'>✓ Last 8 sent</div>
              {queueActivity.sent.length === 0 ? (
                <div className='qa-empty'>None yet</div>
              ) : (
                queueActivity.sent.slice(0, 8).map((it) => (
                  <div key={it._id} className='qa-item'>
                    <span className='qa-email'>
                      {it.leadEmail || '—'}
                    </span>
                    <span className='qa-sub'>
                      {it.sentAt
                        ? 'sent ' +
                          new Date(it.sentAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : ''}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
      {/* Live queue */}
      <div className='card table-card'>
        <div
          className='bulk-actions'
          style={{
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h2 style={{ margin: 0 }}>Live Queue</h2>
          <div className='queue-controls'>
            <select
              value={queueStatus}
              onChange={(e) => {
                const s = e.target.value
                setQueueStatus(s)
                setQueuePage(1)
                fetchQueue(s, 1)
              }}
            >
              <option value=''>All statuses</option>
              <option value='pending'>pending</option>
              <option value='scheduled'>scheduled</option>
              <option value='sending'>sending</option>
              <option value='sent'>sent</option>
              <option value='failed'>failed</option>
              <option value='bounced'>bounced</option>
              <option value='cancelled'>cancelled</option>
            </select>
            <button
              className='btn-ghost'
              onClick={() => fetchQueue(queueStatus, queuePage)}
            >
              ↻ Refresh
            </button>
          </div>
        </div>
        {queue.items.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '13px' }}>
            No queued emails.
          </p>
        ) : (
          <div className='table-wrapper'>
            <table>
              <thead>
                <tr>
                  <th>Lead</th>
                  <th>Campaign</th>
                  <SortTh field='stepIndex'>Step</SortTh>
                  <SortTh field='status'>Status</SortTh>
                  <SortTh field='scheduledAt'>Scheduled</SortTh>
                  <SortTh field='sentAt'>Sent</SortTh>
                  <th>Error</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {queue.items.map((item) => (
                  <tr key={item._id}>
                    <td className='td-email'>{item.leadEmail || '—'}</td>
                    <td>{item.campaignName || '—'}</td>
                    <td>{(item.stepIndex || 0) + 1}</td>
                    <td>
                      <span
                        className={`status-badge badge-${item.status}`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td>{fmtDate(item.scheduledAt)}</td>
                    <td>{fmtDate(item.sentAt)}</td>
                    <td
                      className='cell-trunc'
                      title={item.errorMessage || ''}
                    >
                      {trunc(item.errorMessage, 40) || '—'}
                    </td>
                    <td>
                      <div className='queue-controls'>
                        {item.status === 'failed' && (
                          <button
                            className='btn-preview'
                            onClick={() => resendQueueItem(item._id)}
                          >
                            ↻ Resend
                          </button>
                        )}
                        {item.status === 'sent' && (
                          <button
                            className='btn-preview'
                            onClick={() =>
                              markLead(item.leadId, 'replied')
                            }
                          >
                            Mark replied
                          </button>
                        )}
                        {(item.status === 'sent' ||
                          item.status === 'bounced') && (
                          <button
                            className='btn-ghost'
                            onClick={() =>
                              markLead(item.leadId, 'bounced')
                            }
                          >
                            Mark bounced
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className='queue-pagination'>
          <button
            className='btn-ghost'
            disabled={queue.page <= 1}
            onClick={() => {
              const p = queue.page - 1
              setQueuePage(p)
              fetchQueue(queueStatus, p)
            }}
          >
            ← Prev
          </button>
          <span className='queue-page-label'>
            Page {queue.page} of {queue.pages}
          </span>
          <button
            className='btn-ghost'
            disabled={queue.page >= queue.pages}
            onClick={() => {
              const p = queue.page + 1
              setQueuePage(p)
              fetchQueue(queueStatus, p)
            }}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  )
}
