import React from 'react'
import './App.css'
import LoginScreen from './components/LoginScreen'
import { AppProvider, useApp } from './context/AppContext'
import DashboardPage from './pages/DashboardPage'
import LogsPage from './pages/LogsPage'
import TemplatesPage from './pages/TemplatesPage'
import UpworkPage from './pages/UpworkPage'
import SettingsPage from './pages/SettingsPage'
import LeadsPage from './pages/LeadsPage'
import PreviewPage from './pages/PreviewPage'
import CampaignsPage from './pages/CampaignsPage'

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
    tab,
    setTab,
    navOpen,
    setNavOpen,
    smtpStatus,
    coverModal,
    setCoverModal,
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
    fetchDashboardAll,
    sendTemplateTest,
    fetchTemplates,
    fetchCampaignsAll,
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
        {tab === 'dashboard' && <DashboardPage />}

        {/* ── CAMPAIGNS TAB ── */}
        {tab === 'campaigns' && <CampaignsPage />}

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
