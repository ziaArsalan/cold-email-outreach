import React from 'react'
import './App.css'
import LoginScreen from './components/LoginScreen'
import { AppProvider, useApp } from './context/AppContext'
import LogsPage from './pages/LogsPage'
import TemplatesPage from './pages/TemplatesPage'
import UpworkPage from './pages/UpworkPage'
import SettingsPage from './pages/SettingsPage'
import LeadsPage from './pages/LeadsPage'
import PreviewPage from './pages/PreviewPage'
import { WEEKDAYS, scheduleSummary, fmtDate, trunc } from './utils'

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  )
}

function AppShell() {
  const {
    leads,
    lists,
    emailModal,
    setEmailModal,
    logs,
    campaigns,
    templates,
    mailboxes,
    newCampaign,
    setNewCampaign,
    campaignBusy,
    editingCampaignId,
    campaignActionId,
    tab,
    setTab,
    navOpen,
    setNavOpen,
    smtpStatus,
    coverModal,
    setCoverModal,
    analytics,
    queueActivity,
    queue,
    queueStatus,
    setQueueStatus,
    queuePage,
    setQueuePage,
    mailboxForm,
    setMailboxForm,
    mailboxBusy,
    mailboxTestResult,
    templateTest,
    setTemplateTest,
    campaignView,
    setCampaignView,
    logout,
    fetchLists,
    closeListView,
    saveLeadEmail,
    revertLeadEmail,
    regenerateLeadIntro,
    fetchLogs,
    fetchQueue,
    fetchQueueActivity,
    fetchDashboardAll,
    markLead,
    openNewMailboxForm,
    openEditMailboxForm,
    closeMailboxForm,
    saveMailbox,
    testMailbox,
    toggleMailboxPause,
    sendTemplateTest,
    fetchCampaigns,
    fetchTemplates,
    fetchCampaignsAll,
    createCampaign,
    openEditCampaign,
    cancelEditCampaign,
    deleteCampaign,
    openCampaignView,
    campaignAction,
    toggleCampaignDay,
    toggleCampaignMailbox,
    addFollowup,
    updateFollowup,
    removeFollowup,
    testSmtp,
    sendEmail,
    fetchUpworkAll,
    fetchOutreachSettings,
    authed,
    setAuthed,
  } = useApp()

  if (!authed) return <LoginScreen onSuccess={() => setAuthed(true)} />

  return (
    <div className='app'>
      {/* Mobile top bar — hamburger toggles the sidebar drawer (mobile only) */}
      <div className='mobile-topbar'>
        <button
          className='hamburger'
          aria-label='Menu'
          onClick={() => setNavOpen((v) => !v)}
        >
          ☰
        </button>
        <span className='logo-d'>D</span>
        <span className='mobile-title'>Devtronics</span>
      </div>

      {/* Backdrop behind the open drawer (mobile) */}
      {navOpen && (
        <div className='nav-backdrop' onClick={() => setNavOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={'sidebar' + (navOpen ? ' open' : '')}>
        <div className='logo'>
          <span className='logo-d'>D</span>
          <span className='logo-text'>
            Devtronics
            <br />
            <small>Outreach</small>
          </span>
        </div>
        {/* Any nav click closes the mobile drawer (event bubbles up) */}
        <nav onClick={() => setNavOpen(false)}>
          <button
            className={tab === 'dashboard' ? 'nav-item active' : 'nav-item'}
            onClick={() => {
              setTab('dashboard')
              fetchDashboardAll()
            }}
          >
            <span className='nav-icon'>◈</span> Dashboard
          </button>
          <button
            className={tab === 'leads' ? 'nav-item active' : 'nav-item'}
            onClick={() => {
              setTab('leads')
              closeListView()
              fetchLists()
            }}
          >
            <span className='nav-icon'>◉</span> Lists
          </button>
          <button
            className={tab === 'campaigns' ? 'nav-item active' : 'nav-item'}
            onClick={() => {
              setTab('campaigns')
              fetchCampaignsAll()
            }}
          >
            <span className='nav-icon'>◈</span> Campaigns
          </button>
          <button
            className={tab === 'templates' ? 'nav-item active' : 'nav-item'}
            onClick={() => {
              setTab('templates')
              fetchTemplates()
            }}
          >
            <span className='nav-icon'>▤</span> Templates
          </button>
          <button
            className={tab === 'upwork' ? 'nav-item active' : 'nav-item'}
            onClick={() => {
              setTab('upwork')
              fetchUpworkAll()
            }}
          >
            <span className='nav-icon'>◆</span> Upwork
          </button>
          <button
            className={tab === 'settings' ? 'nav-item active' : 'nav-item'}
            onClick={() => {
              setTab('settings')
              fetchOutreachSettings()
            }}
          >
            <span className='nav-icon'>◎</span> Settings
          </button>
          <button
            className={tab === 'logs' ? 'nav-item active' : 'nav-item'}
            onClick={() => {
              setTab('logs')
              fetchLogs()
            }}
          >
            <span className='nav-icon'>▦</span> Logs
          </button>
          {tab === 'preview' && (
            <button className='nav-item active'>
              <span className='nav-icon'>◌</span> Preview
            </button>
          )}
        </nav>
        <div className='sidebar-footer'>
          <div className='smtp-test'>
            <button className='btn-ghost' onClick={testSmtp}>
              {smtpStatus === 'testing' ? 'Testing...' : 'Test SMTP'}
            </button>
            {smtpStatus === 'ok' && <span className='badge-ok'>Connected</span>}
            {smtpStatus === 'fail' && (
              <span className='badge-fail'>Failed</span>
            )}
          </div>
          <button className='btn-ghost logout-btn' onClick={logout}>
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className='main'>
        {/* ── DASHBOARD TAB ── */}
        {tab === 'dashboard' && (
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
                        <th>Step</th>
                        <th>Status</th>
                        <th>Scheduled</th>
                        <th>Sent</th>
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
        )}

        {/* ── CAMPAIGNS TAB ── */}
        {tab === 'campaigns' && (
          <div className='tab-content'>
            <div className='page-header'>
              <h1>Campaigns</h1>
              <p>Launch and control AI-personalized outreach</p>
            </div>

            {/* How it works — plain-language flow */}
            <div className='card legend-card'>
              <div className='legend-flow'>
                <span className='legend-step'>
                  1 · <strong>Start</strong> → all target leads join the queue
                </span>
                <span className='legend-arrow'>→</span>
                <span className='legend-step'>
                  2 · Emails send <strong>one at a time</strong>, every few
                  minutes
                </span>
                <span className='legend-arrow'>→</span>
                <span className='legend-step'>
                  3 · Stops at the <strong>daily limit</strong>, resumes next
                  day
                </span>
              </div>
              <div className='legend-statuses'>
                <span>
                  <span className='status-badge badge-draft'>draft</span> not
                  started
                </span>
                <span>
                  <span className='status-badge badge-running'>running</span>{' '}
                  actively sending
                </span>
                <span>
                  <span className='status-badge badge-paused'>paused</span>{' '}
                  temporarily halted
                </span>
                <span>
                  <span className='status-badge badge-completed'>
                    completed
                  </span>{' '}
                  all sent
                </span>
              </div>
            </div>

            {/* Existing campaigns */}
            <div className='card'>
              <div
                className='bulk-actions'
                style={{
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <h2 style={{ margin: 0 }}>Your Campaigns</h2>
                <button className='btn-ghost' onClick={fetchCampaigns}>
                  ↻ Refresh
                </button>
              </div>
              {campaigns.length === 0 ? (
                <p style={{ color: 'var(--muted)', fontSize: '13px' }}>
                  No campaigns yet. Create one below.
                </p>
              ) : (
                <div className='campaign-list'>
                  {campaigns.map((c) => {
                    const counts = c.counts || {}
                    const sent = counts.sent || 0
                    const pending =
                      (counts.pending || 0) +
                      (counts.scheduled || 0) +
                      (counts.sending || 0)
                    const failed = (counts.failed || 0) + (counts.bounced || 0)
                    const cancelled = counts.cancelled || 0
                    const total = sent + pending + failed + cancelled
                    const pct = total ? Math.round((sent / total) * 100) : 0
                    return (
                      <div key={c._id} className='campaign-row'>
                        <div className='campaign-main'>
                          <div className='campaign-title'>
                            <span className='campaign-name'>{c.name}</span>
                            <span className={`status-badge badge-${c.status}`}>
                              {c.status}
                            </span>
                            {c.status === 'running' && pending > 0 && (
                              <span className='field-note'>
                                sending…{' '}
                                {c.warmupEnabled
                                  ? 'warm-up pace'
                                  : 'one every few min'}
                              </span>
                            )}
                          </div>

                          {/* Progress: sent vs total targeted */}
                          <div className='campaign-progress'>
                            <div className='progress-bar'>
                              <div
                                className='progress-fill'
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className='progress-label'>
                              {sent} of {total} sent ({pct}%)
                            </span>
                          </div>

                          <div className='campaign-meta'>
                            <span>{c.stepCount || 1} step(s)</span>
                            {c.listName && <span>List: {c.listName}</span>}
                            <span className='chip chip-pending'>
                              {pending} waiting
                            </span>
                            <span className='chip chip-sent'>{sent} sent</span>
                            {failed > 0 && (
                              <span className='chip chip-failed'>
                                {failed} failed
                              </span>
                            )}
                            {cancelled > 0 && (
                              <span className='chip'>{cancelled} stopped</span>
                            )}
                            <span>limit {c.dailyLimit || 0}/day</span>
                            <span>
                              warm-up {c.warmupEnabled ? 'on' : 'off'}
                            </span>
                            <span>{scheduleSummary(c.schedule)}</span>
                          </div>
                        </div>
                        <div className='campaign-actions'>
                          <button
                            className='btn-ghost'
                            onClick={() => openCampaignView(c)}
                          >
                            ⊙ View
                          </button>
                          {c.status === 'draft' && (
                            <>
                              <button
                                className='btn-start'
                                disabled={campaignActionId === c._id}
                                onClick={() => campaignAction(c._id, 'start')}
                              >
                                {campaignActionId === c._id
                                  ? 'Starting…'
                                  : '▶ Start'}
                              </button>
                              <button
                                className='btn-ghost'
                                disabled={campaignActionId === c._id}
                                onClick={() => openEditCampaign(c)}
                              >
                                Edit
                              </button>
                              <button
                                className='btn-stop'
                                disabled={campaignActionId === c._id}
                                onClick={() => deleteCampaign(c)}
                              >
                                Delete
                              </button>
                            </>
                          )}
                          {c.status === 'running' && (
                            <>
                              <button
                                className='btn-ghost'
                                disabled={campaignActionId === c._id}
                                onClick={() => campaignAction(c._id, 'pause')}
                              >
                                ❚❚ Pause
                              </button>
                              <button
                                className='btn-stop'
                                disabled={campaignActionId === c._id}
                                onClick={() => campaignAction(c._id, 'stop')}
                              >
                                ■ Stop
                              </button>
                            </>
                          )}
                          {c.status === 'paused' && (
                            <>
                              <button
                                className='btn-start'
                                disabled={campaignActionId === c._id}
                                onClick={() => campaignAction(c._id, 'resume')}
                              >
                                {campaignActionId === c._id
                                  ? 'Resuming…'
                                  : '▶ Resume'}
                              </button>
                              <button
                                className='btn-stop'
                                disabled={campaignActionId === c._id}
                                onClick={() => campaignAction(c._id, 'stop')}
                              >
                                ■ Stop
                              </button>
                            </>
                          )}
                          {(c.status === 'stopped' ||
                            c.status === 'completed') && (
                            <>
                              <button
                                className='btn-start'
                                disabled={campaignActionId === c._id}
                                onClick={() => campaignAction(c._id, 'reopen')}
                              >
                                {campaignActionId === c._id
                                  ? 'Restarting…'
                                  : '↻ Restart'}
                              </button>
                              <button
                                className='btn-stop'
                                disabled={campaignActionId === c._id}
                                onClick={() => deleteCampaign(c)}
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* New / edit campaign */}
            <div className='card'>
              <h2>{editingCampaignId ? 'Edit Campaign' : 'New Campaign'}</h2>
              <form onSubmit={createCampaign}>
                <div className='settings-fields-grid'>
                  <div className='control-group'>
                    <label>Name</label>
                    <input
                      type='text'
                      value={newCampaign.name}
                      onChange={(e) =>
                        setNewCampaign((c) => ({ ...c, name: e.target.value }))
                      }
                      placeholder='Q3 SaaS founders'
                      required
                    />
                  </div>
                  <div className='control-group'>
                    <label>Template (Step 1 — Initial email)</label>
                    <select
                      value={newCampaign.templateId}
                      onChange={(e) =>
                        setNewCampaign((c) => ({
                          ...c,
                          templateId: e.target.value,
                        }))
                      }
                    >
                      <option value=''>Select a template…</option>
                      {templates.map((t) => (
                        <option key={t._id} value={t._id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className='control-group'>
                    <label>List</label>
                    <select
                      value={newCampaign.listId}
                      onChange={(e) =>
                        setNewCampaign((c) => ({
                          ...c,
                          listId: e.target.value,
                        }))
                      }
                    >
                      <option value=''>No list (all new leads)</option>
                      {lists.map((l) => (
                        <option key={l._id} value={l._id}>
                          {l.name} ({l.leadCount} leads)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className='control-group full-width'>
                    <label>Follow-up steps (optional)</label>
                    {newCampaign.steps.length === 0 ? (
                      <span className='field-note'>
                        No follow-ups. Add one to send a sequence after the
                        initial email.
                      </span>
                    ) : (
                      newCampaign.steps.map((s, i) => (
                        <div key={i} className='checkbox-row'>
                          <span className='field-note'>Step {i + 2}</span>
                          <select
                            value={s.templateId}
                            onChange={(e) =>
                              updateFollowup(i, { templateId: e.target.value })
                            }
                          >
                            <option value=''>Select a template…</option>
                            {templates.map((t) => (
                              <option key={t._id} value={t._id}>
                                {t.name}
                              </option>
                            ))}
                          </select>
                          <span className='field-note'>wait</span>
                          <input
                            type='number'
                            min='0'
                            style={{ width: '5rem' }}
                            value={s.delayDays}
                            onChange={(e) =>
                              updateFollowup(i, { delayDays: e.target.value })
                            }
                          />
                          <span className='field-note'>days</span>
                          <button
                            type='button'
                            className='btn-ghost'
                            onClick={() => removeFollowup(i)}
                          >
                            Remove
                          </button>
                        </div>
                      ))
                    )}
                    <button
                      type='button'
                      className='btn-ghost'
                      onClick={addFollowup}
                      disabled={!newCampaign.templateId}
                    >
                      + Add follow-up
                    </button>
                  </div>
                  <div className='control-group'>
                    <label>Daily Limit</label>
                    <input
                      type='number'
                      min='0'
                      value={newCampaign.dailyLimit}
                      onChange={(e) =>
                        setNewCampaign((c) => ({
                          ...c,
                          dailyLimit: e.target.value,
                        }))
                      }
                    />
                    <span className='field-note'>0 = unlimited</span>
                  </div>
                  <div className='control-group'>
                    <label>Warm-up</label>
                    <label className='checkbox-row'>
                      <input
                        type='checkbox'
                        checked={newCampaign.warmupEnabled}
                        onChange={(e) =>
                          setNewCampaign((c) => ({
                            ...c,
                            warmupEnabled: e.target.checked,
                          }))
                        }
                      />
                      Enable warm-up ramp
                    </label>
                  </div>
                  <div className='control-group full-width'>
                    <label>AI Prompt (optional)</label>
                    <textarea
                      className='settings-textarea'
                      rows={12}
                      value={newCampaign.aiPrompt}
                      onChange={(e) =>
                        setNewCampaign((c) => ({
                          ...c,
                          aiPrompt: e.target.value,
                        }))
                      }
                      placeholder='Extra instructions for the personalized intro…'
                    />
                  </div>
                  <div className='control-group full-width'>
                    <label>Mailboxes</label>
                    {mailboxes.length === 0 ? (
                      <span className='field-note'>
                        No mailboxes configured.
                      </span>
                    ) : (
                      <div className='checkbox-list'>
                        {mailboxes.map((m) => (
                          <label key={m._id} className='checkbox-row'>
                            <input
                              type='checkbox'
                              checked={newCampaign.mailboxIds.includes(m._id)}
                              onChange={() => toggleCampaignMailbox(m._id)}
                            />
                            {m.email}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className='control-group full-width'>
                    <label>Schedule Days</label>
                    <div className='day-toggle-row'>
                      {WEEKDAYS.map((d) => (
                        <button
                          type='button'
                          key={d}
                          className={
                            newCampaign.days.includes(d)
                              ? 'day-toggle active'
                              : 'day-toggle'
                          }
                          onClick={() => toggleCampaignDay(d)}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className='control-group'>
                    <label>Start Time</label>
                    <input
                      type='time'
                      value={newCampaign.startTime}
                      onChange={(e) =>
                        setNewCampaign((c) => ({
                          ...c,
                          startTime: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className='control-group'>
                    <label>End Time</label>
                    <input
                      type='time'
                      value={newCampaign.endTime}
                      onChange={(e) =>
                        setNewCampaign((c) => ({
                          ...c,
                          endTime: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
                <div
                  style={{
                    marginTop: '1.25rem',
                    display: 'flex',
                    gap: '0.5rem',
                  }}
                >
                  <button
                    className='btn-start'
                    type='submit'
                    disabled={campaignBusy || !newCampaign.name.trim()}
                  >
                    {campaignBusy
                      ? 'Saving…'
                      : editingCampaignId
                        ? 'Save Changes'
                        : '+ Create Campaign'}
                  </button>
                  {editingCampaignId && (
                    <button
                      className='btn-ghost'
                      type='button'
                      onClick={cancelEditCampaign}
                      disabled={campaignBusy}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── TEMPLATES TAB ── */}
        {tab === 'templates' && <TemplatesPage />}

        {/* ── LISTS TAB (T-017) ── */}
        {tab === 'leads' && <LeadsPage />}

        {/* ── PREVIEW TAB ── */}
        {tab === 'preview' && <PreviewPage />}

        {/* ── UPWORK TAB ── */}
        {tab === 'upwork' && <UpworkPage />}

        {/* ── SETTINGS TAB ── */}
        {tab === 'settings' && <SettingsPage />}

        {/* ── LOGS TAB ── */}
        {tab === 'logs' && <LogsPage />}
      </main>

      {/* ── Editable email modal (per-lead full body override) ── */}
      {emailModal && (
        <div className='modal-overlay' onClick={() => setEmailModal(null)}>
          <div className='modal-card' onClick={(e) => e.stopPropagation()}>
            <button
              className='modal-close btn-ghost'
              onClick={() => setEmailModal(null)}
            >
              ✕ Close
            </button>
            {emailModal.loading ? (
              <div className='loading-card'>
                <div className='spinner' />
                <p>Loading email…</p>
              </div>
            ) : (
              <>
                <h2 style={{ margin: '0 0 0.75rem' }}>Edit Email</h2>
                {emailModal.overridden && (
                  <p className='field-note' style={{ marginBottom: '0.75rem' }}>
                    Overridden (custom) — this full body will be sent as-is,
                    ignoring the template. Regenerating the intro updates the
                    underlying AI intro, but this override still wins for
                    sending.
                  </p>
                )}
                <div className='control-group'>
                  <label>Subject</label>
                  <input
                    type='text'
                    value={emailModal.subject || ''}
                    onChange={(e) =>
                      setEmailModal((m) => ({ ...m, subject: e.target.value }))
                    }
                  />
                </div>
                <div className='control-group'>
                  <label>Body</label>
                  <textarea
                    rows={14}
                    value={emailModal.body || ''}
                    onChange={(e) =>
                      setEmailModal((m) => ({ ...m, body: e.target.value }))
                    }
                  />
                </div>
                <div
                  style={{
                    display: 'flex',
                    gap: '0.5rem',
                    flexWrap: 'wrap',
                    marginTop: '1rem',
                  }}
                >
                  <button
                    className='btn-start'
                    disabled={emailModal.saving}
                    onClick={saveLeadEmail}
                  >
                    {emailModal.saving ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    className='btn-ghost'
                    disabled={emailModal.saving}
                    onClick={regenerateLeadIntro}
                  >
                    Regenerate intro
                  </button>
                  <button
                    className='btn-ghost'
                    disabled={emailModal.saving}
                    onClick={revertLeadEmail}
                  >
                    Revert to template
                  </button>
                  <button
                    className='btn-ghost'
                    onClick={() => setEmailModal(null)}
                  >
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Template test modal (send to a tester list + history) ── */}
      {templateTest && (
        <div className='modal-overlay' onClick={() => setTemplateTest(null)}>
          <div
            className='modal-card'
            style={{ maxWidth: 720, width: '95%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className='modal-close btn-ghost'
              onClick={() => setTemplateTest(null)}
            >
              ✕ Close
            </button>
            <h3 style={{ marginTop: 0 }}>
              Test template — {templateTest.templateName}
            </h3>
            <p style={{ color: 'var(--muted)', fontSize: '13px' }}>
              Sends the REAL template email (rendered per-lead, exactly like a
              campaign — no test marker) to <strong>every lead</strong> in the
              chosen list. Use your tester list. Each send is recorded below and
              in Logs, labelled TEST.
            </p>
            <div
              className='control-group'
              style={{ marginBottom: '0.9rem', maxWidth: 360 }}
            >
              <label>Tester list (sends to all its leads)</label>
              <select
                value={templateTest.listId}
                onChange={(e) =>
                  setTemplateTest((s) => ({ ...s, listId: e.target.value }))
                }
              >
                <option value=''>Select a list…</option>
                {lists.map((l) => (
                  <option key={l._id} value={l._id}>
                    {l.name} ({l.leadCount} leads)
                  </option>
                ))}
              </select>
            </div>
            {templateTest.result && (
              <p
                style={{
                  fontSize: '13px',
                  color: templateTest.result.startsWith('Failed')
                    ? 'var(--error)'
                    : 'var(--success)',
                }}
              >
                {templateTest.result}
              </p>
            )}
            <button
              className='btn-start'
              onClick={sendTemplateTest}
              disabled={templateTest.sending || !templateTest.listId}
            >
              {templateTest.sending
                ? 'Sending…'
                : '▶ Send test to all leads in list'}
            </button>

            <h4 style={{ margin: '1.5rem 0 0.5rem' }}>
              Test history ({templateTest.history.length})
            </h4>
            {templateTest.history.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: '13px' }}>
                No tests run for this template yet.
              </p>
            ) : (
              <div
                className='table-wrapper'
                style={{ maxHeight: 280, overflowY: 'auto' }}
              >
                <table>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Recipient</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {templateTest.history.map((h) => (
                      <tr key={h._id}>
                        <td>{new Date(h.timestamp).toLocaleString()}</td>
                        <td className='td-email'>
                          {(h.meta && h.meta.to) || '—'}
                        </td>
                        <td>
                          <span
                            className={`status-badge badge-${
                              h.level === 'error' ? 'failed' : 'sent'
                            }`}
                          >
                            {h.level === 'error' ? 'failed' : 'sent'}
                          </span>
                          {h.meta && h.meta.error ? (
                            <span
                              className='cell-trunc'
                              title={h.meta.error}
                              style={{
                                marginLeft: 8,
                                color: 'var(--error)',
                                fontSize: 12,
                              }}
                            >
                              {String(h.meta.error).slice(0, 40)}
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Campaign View modal (queue + logs) ── */}
      {campaignView && (
        <div className='modal-overlay' onClick={() => setCampaignView(null)}>
          <div
            className='modal-card'
            style={{ maxWidth: 920, width: '95%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className='modal-close btn-ghost'
              onClick={() => setCampaignView(null)}
            >
              ✕ Close
            </button>
            <h3 style={{ marginTop: 0 }}>
              {campaignView.campaign.name}{' '}
              <span
                className={`status-badge badge-${campaignView.campaign.status}`}
              >
                {campaignView.campaign.status}
              </span>
            </h3>
            <p style={{ color: 'var(--muted)', fontSize: '13px' }}>
              {campaignView.campaign.listName
                ? `List: ${campaignView.campaign.listName} · `
                : ''}
              pending {campaignView.campaign.counts?.pending || 0} · sent{' '}
              {campaignView.campaign.counts?.sent || 0} · failed{' '}
              {campaignView.campaign.counts?.failed || 0} · cancelled{' '}
              {campaignView.campaign.counts?.cancelled || 0}
            </p>
            {campaignView.loading ? (
              <div className='loading-card'>
                <div className='spinner' />
                <p>Loading campaign activity…</p>
              </div>
            ) : (
              <>
                <h4 style={{ margin: '1rem 0 0.5rem' }}>
                  Emails ({campaignView.queue.length})
                </h4>
                {campaignView.queue.length === 0 ? (
                  <p style={{ color: 'var(--muted)', fontSize: '13px' }}>
                    No queued emails yet.
                  </p>
                ) : (
                  <div className='table-wrapper'>
                    <table>
                      <thead>
                        <tr>
                          <th>Lead</th>
                          <th>Step</th>
                          <th>Status</th>
                          <th>Scheduled</th>
                          <th>Sent</th>
                          <th>Error</th>
                        </tr>
                      </thead>
                      <tbody>
                        {campaignView.queue.map((item) => (
                          <tr key={item._id}>
                            <td className='td-email'>
                              {item.leadEmail || '—'}
                            </td>
                            <td>{(item.stepIndex || 0) + 1}</td>
                            <td>
                              <span
                                className={`status-badge badge-${item.status}`}
                              >
                                {item.status}
                              </span>
                            </td>
                            <td>
                              {item.scheduledAt
                                ? new Date(item.scheduledAt).toLocaleString()
                                : '—'}
                            </td>
                            <td>
                              {item.sentAt
                                ? new Date(item.sentAt).toLocaleString()
                                : '—'}
                            </td>
                            <td
                              className='cell-trunc'
                              title={item.errorMessage || ''}
                            >
                              {item.errorMessage
                                ? item.errorMessage.slice(0, 40)
                                : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <h4 style={{ margin: '1.25rem 0 0.5rem' }}>
                  Logs ({campaignView.logs.length})
                </h4>
                {campaignView.logs.length === 0 ? (
                  <p style={{ color: 'var(--muted)', fontSize: '13px' }}>
                    No log entries for this campaign yet.
                  </p>
                ) : (
                  <div
                    className='table-wrapper'
                    style={{ maxHeight: 260, overflowY: 'auto' }}
                  >
                    <table>
                      <thead>
                        <tr>
                          <th>Time</th>
                          <th>Category</th>
                          <th>Message</th>
                        </tr>
                      </thead>
                      <tbody>
                        {campaignView.logs.map((log) => (
                          <tr key={log._id}>
                            <td>{new Date(log.timestamp).toLocaleString()}</td>
                            <td>
                              <span
                                className={`status-badge badge-${log.category}`}
                              >
                                {log.category}
                              </span>
                            </td>
                            <td
                              className='cell-trunc'
                              style={{ maxWidth: 420 }}
                              title={log.message || ''}
                            >
                              {log.message}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Cover letter modal ── */}
      {coverModal && (
        <div className='modal-overlay' onClick={() => setCoverModal(null)}>
          <div className='modal-card' onClick={(e) => e.stopPropagation()}>
            <button
              className='modal-close btn-ghost'
              onClick={() => setCoverModal(null)}
            >
              ✕ Close
            </button>
            <pre>{coverModal}</pre>
          </div>
        </div>
      )}
    </div>
  )
}
