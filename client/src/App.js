import React, { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import './App.css'

const API = 'http://localhost:8080/api'

const EMAIL_SIGNATURE = `
  
  Best Regards,
  Zia Arsalan
  Software Engr.
  
  Founder @ Devtronics
  
  +1 312 783 9450
  zia@devtronics.co
  https://devtronics.co
  
  Sheridan, WY`

const statusColor = (s) => {
  if (!s) return 'status-pending'
  if (s === 'Emailed') return 'status-emailed'
  if (s === 'Failed') return 'status-failed'
  return 'status-pending'
}

export default function App() {
  const [leads, setLeads] = useState([])
  const [jobState, setJobState] = useState(null)
  const [batchSize, setBatchSize] = useState(10)
  const [delayMs, setDelayMs] = useState(3000)
  const [previewLead, setPreviewLead] = useState(null)
  const [preview, setPreview] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [tab, setTab] = useState('dashboard')
  const [smtpStatus, setSmtpStatus] = useState(null)
  const [bulkGenerating, setBulkGenerating] = useState(false)
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 })
  const pollRef = useRef(null)

  const fetchLeads = async () => {
    try {
      const { data } = await axios.get(`${API}/leads`)
      setLeads(data.leads || [])
    } catch (e) {}
  }

  const fetchStatus = async () => {
    try {
      const { data } = await axios.get(`${API}/status`)
      setJobState(data)
    } catch (e) {}
  }

  useEffect(() => {
    fetchLeads()
    fetchStatus()
  }, [])

  // Poll every 2s when job is running
  useEffect(() => {
    if (jobState?.running) {
      pollRef.current = setInterval(() => {
        fetchStatus()
        fetchLeads()
      }, 2000)
    } else {
      clearInterval(pollRef.current)
    }
    return () => clearInterval(pollRef.current)
  }, [jobState?.running])

  const startJob = async () => {
    await axios.post(`${API}/start`, {
      batchSize: parseInt(batchSize),
      delayMs: parseInt(delayMs),
    })
    fetchStatus()
    setTimeout(fetchStatus, 1000)
  }

  const stopJob = async () => {
    await axios.post(`${API}/stop`)
    fetchStatus()
  }

  const testSmtp = async () => {
    setSmtpStatus('testing')
    try {
      await axios.post(`${API}/test-smtp`)
      setSmtpStatus('ok')
    } catch (e) {
      setSmtpStatus('fail')
    }
  }

  const openPreview = async (lead) => {
    setPreviewLead(lead)
    setPreview(null)
    setPreviewLoading(true)
    setTab('preview')
    try {
      const { data } = await axios.post(`${API}/preview`, { lead })
      setPreview({ ...data.email, cached: data.cached })
    } catch (e) {
      setPreview({ subject: 'Error', body: e.message, cached: false })
    }
    setPreviewLoading(false)
  }

  const sendEmail = async () => {
    if (!previewLead) return
    try {
      await axios.post(`${API}/send-email`, { lead: previewLead })
      fetchLeads()
      fetchStatus()
    } catch (e) {
      alert('Failed to send email: ' + e.message)
    }
  }

  const bulkGenerate = async () => {
    const leadsToGenerate = leads.filter((l) => !l.generatedEmail)
    if (leadsToGenerate.length === 0) {
      alert('All leads already have generated emails!')
      return
    }

    setBulkGenerating(true)
    setBulkProgress({ current: 0, total: leadsToGenerate.length })

    for (let i = 0; i < leadsToGenerate.length; i++) {
      try {
        await axios.post(`${API}/preview`, { lead: leadsToGenerate[i] })
        setBulkProgress({ current: i + 1, total: leadsToGenerate.length })
      } catch (e) {
        console.error(
          `Failed to generate email for ${leadsToGenerate[i].name}:`,
          e,
        )
        setBulkProgress((p) => ({ ...p, current: p.current + 1 }))
      }
    }

    setBulkGenerating(false)
    await fetchLeads()
  }

  const pending = leads.filter((l) => !l.status).length
  const emailed = leads.filter((l) => l.status === 'Emailed').length
  const failed = leads.filter((l) => l.status === 'Failed').length

  return (
    <div className='app'>
      {/* Sidebar */}
      <aside className='sidebar'>
        <div className='logo'>
          <span className='logo-d'>D</span>
          <span className='logo-text'>
            Devtronics
            <br />
            <small>Outreach</small>
          </span>
        </div>
        <nav>
          <button
            className={tab === 'dashboard' ? 'nav-item active' : 'nav-item'}
            onClick={() => setTab('dashboard')}
          >
            <span className='nav-icon'>◈</span> Dashboard
          </button>
          <button
            className={tab === 'leads' ? 'nav-item active' : 'nav-item'}
            onClick={() => {
              setTab('leads')
              fetchLeads()
            }}
          >
            <span className='nav-icon'>◉</span> Leads
          </button>
          <button
            className={tab === 'settings' ? 'nav-item active' : 'nav-item'}
            onClick={() => setTab('settings')}
          >
            <span className='nav-icon'>◎</span> Settings
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

            {/* Stats */}
            <div className='stats-grid'>
              <div className='stat-card'>
                <span className='stat-num'>{leads.length}</span>
                <span className='stat-label'>Total Leads</span>
              </div>
              <div className='stat-card stat-pending'>
                <span className='stat-num'>{pending}</span>
                <span className='stat-label'>Pending</span>
              </div>
              <div className='stat-card stat-emailed'>
                <span className='stat-num'>{emailed}</span>
                <span className='stat-label'>Emailed</span>
              </div>
              <div className='stat-card stat-failed'>
                <span className='stat-num'>{failed}</span>
                <span className='stat-label'>Failed</span>
              </div>
            </div>

            {/* Job Controls */}
            <div className='card'>
              <h2>Job Controls</h2>
              <div className='controls-row'>
                <div className='control-group'>
                  <label>Batch Size</label>
                  <input
                    type='number'
                    value={batchSize}
                    min={1}
                    max={100}
                    onChange={(e) => setBatchSize(e.target.value)}
                    disabled={jobState?.running}
                  />
                </div>
                <div className='control-group'>
                  <label>Delay Between Emails (ms)</label>
                  <input
                    type='number'
                    value={delayMs}
                    min={1000}
                    step={500}
                    onChange={(e) => setDelayMs(e.target.value)}
                    disabled={jobState?.running}
                  />
                </div>
                <div className='control-actions'>
                  {!jobState?.running ? (
                    <button
                      className='btn-start'
                      onClick={startJob}
                      disabled={pending === 0}
                    >
                      ▶ Start Campaign
                    </button>
                  ) : (
                    <button className='btn-stop' onClick={stopJob}>
                      ■ Stop
                    </button>
                  )}
                  <button className='btn-ghost' onClick={fetchLeads}>
                    ↻ Refresh
                  </button>
                </div>
              </div>

              {/* Progress Bar */}
              {jobState && (jobState.running || jobState.processed > 0) && (
                <div className='progress-section'>
                  <div className='progress-info'>
                    <span>{jobState.running ? 'Running...' : 'Completed'}</span>
                    <span>
                      {jobState.processed} / {jobState.total}
                    </span>
                  </div>
                  <div className='progress-bar'>
                    <div
                      className='progress-fill'
                      style={{
                        width:
                          jobState.total > 0
                            ? `${(jobState.processed / jobState.total) * 100}%`
                            : '0%',
                      }}
                    />
                  </div>
                  <div className='progress-stats'>
                    <span className='ps-success'>
                      ✓ {jobState.success} sent
                    </span>
                    <span className='ps-fail'>✗ {jobState.failed} failed</span>
                  </div>
                </div>
              )}
            </div>

            {/* Activity Log */}
            {jobState?.logs?.length > 0 && (
              <div className='card log-card'>
                <h2>Activity Log</h2>
                <div className='log-list'>
                  {jobState.logs.map((log, i) => (
                    <div key={i} className={`log-entry log-${log.type}`}>
                      <span className='log-time'>
                        {new Date(log.time).toLocaleTimeString()}
                      </span>
                      <span className='log-msg'>{log.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── LEADS TAB ── */}
        {tab === 'leads' && (
          <div className='tab-content'>
            <div className='page-header'>
              <h1>Leads</h1>
              <p>{leads.length} contacts from Google Sheets</p>
            </div>
            <div className='card table-card'>
              <div className='bulk-actions'>
                <button
                  className='btn-start'
                  onClick={bulkGenerate}
                  disabled={
                    bulkGenerating ||
                    leads.filter((l) => !l.generatedEmail).length === 0
                  }
                >
                  {bulkGenerating
                    ? `⟳ Generating... (${bulkProgress.current}/${bulkProgress.total})`
                    : '✦ Bulk Generate Emails'}
                </button>
              </div>
              <div className='table-wrapper'>
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Business</th>
                      <th>Website</th>
                      <th>Status</th>
                      <th>Preview</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((lead, i) => (
                      <tr key={i}>
                        <td>{lead.name}</td>
                        <td className='td-email'>{lead.email}</td>
                        <td>{lead.business}</td>
                        <td>
                          {lead.website && (
                            <a
                              href={lead.website}
                              target='_blank'
                              rel='noreferrer'
                              className='link'
                            >
                              {lead.website
                                .replace(/https?:\/\//, '')
                                .slice(0, 25)}
                            </a>
                          )}
                        </td>
                        <td>
                          <span
                            className={`status-badge ${statusColor(lead.status)}`}
                          >
                            {lead.status || 'Pending'}
                          </span>
                        </td>
                        <td>
                          {!lead.status && (
                            <button
                              className='btn-preview'
                              onClick={() => openPreview(lead)}
                            >
                              {lead.generatedEmail ? '👁 View' : '✦ Generate'}
                            </button>
                          )}
                          {lead.status && lead.generatedEmail && (
                            <button
                              className='btn-preview'
                              onClick={() => openPreview(lead)}
                            >
                              👁 View
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── PREVIEW TAB ── */}
        {tab === 'preview' && (
          <div className='tab-content'>
            <div className='page-header'>
              <button className='btn-ghost' onClick={() => setTab('leads')}>
                ← Back to Leads
              </button>
              <h1>Email Preview</h1>
              {previewLead && (
                <p>
                  For {previewLead.name} at {previewLead.business}
                </p>
              )}
            </div>
            {previewLoading && (
              <div className='card loading-card'>
                <div className='spinner' />
                <p>
                  {previewLead?.generatedEmail
                    ? 'Loading saved email...'
                    : `AI is researching ${previewLead?.website} and crafting your email...`}
                </p>
              </div>
            )}
            {preview && !previewLoading && (
              <div className='card preview-card'>
                <div className='preview-status'>
                  <label>Status</label>
                  <span
                    className={`status-badge ${statusColor(previewLead?.status)}`}
                  >
                    {previewLead?.status || 'Pending'}
                  </span>
                </div>
                <div className='preview-subject'>
                  <label>
                    Subject
                    {preview.cached && (
                      <span className='badge-cached'>
                        Cached — no tokens used
                      </span>
                    )}
                    {!preview.cached && (
                      <span className='badge-fresh'>
                        Freshly generated + saved
                      </span>
                    )}
                  </label>
                  <p>{preview.subject}</p>
                </div>
                <div className='preview-body'>
                  <label>Email Body</label>
                  <pre>
                    {preview.body}
                    {EMAIL_SIGNATURE}
                  </pre>
                </div>
                {/* {previewLead?.status !== 'Emailed' && ( */}
                <div className='preview-actions'>
                  <button className='btn-start' onClick={sendEmail}>
                    ✉ Send Email
                  </button>
                </div>
                {/* )} */}
              </div>
            )}
          </div>
        )}

        {/* ── SETTINGS TAB ── */}
        {tab === 'settings' && (
          <div className='tab-content'>
            <div className='page-header'>
              <h1>Settings</h1>
              <p>Configure your server environment variables</p>
            </div>
            <div className='card settings-card'>
              <h2>Required Environment Variables</h2>
              <p>
                Set these in your <code>server/.env</code> file:
              </p>
              <div className='env-table'>
                {[
                  ['GOOGLE_SHEET_ID', 'Your Google Sheet ID from the URL'],
                  [
                    'GOOGLE_SERVICE_ACCOUNT_EMAIL',
                    'Service account email from Google Cloud',
                  ],
                  [
                    'GOOGLE_PRIVATE_KEY',
                    'Private key from service account JSON',
                  ],
                  [
                    'ANTHROPIC_API_KEY',
                    'Your Claude API key from console.anthropic.com',
                  ],
                  ['SMTP_HOST', 'e.g. mail.devtronics.co'],
                  ['SMTP_PORT', '465 for SSL, 587 for TLS'],
                  ['SMTP_USER', 'zia@devtronics.co'],
                  ['SMTP_PASS', 'Your email password'],
                ].map(([key, desc]) => (
                  <div key={key} className='env-row'>
                    <code>{key}</code>
                    <span>{desc}</span>
                  </div>
                ))}
              </div>
              <h2 style={{ marginTop: '2rem' }}>Google Sheet Setup</h2>
              <p>Your sheet must have these columns in order:</p>
              <div className='env-table'>
                {[
                  'A: Email',
                  'B: Name',
                  'C: Business',
                  'D: Website',
                  'E: Status',
                  'F: Reference',
                ].map((col) => (
                  <div key={col} className='env-row'>
                    <code>{col.split(':')[0]}</code>
                    <span>{col.split(':')[1]}</span>
                  </div>
                ))}
              </div>
              <div className='settings-note'>
                <strong>Note:</strong> Share your Google Sheet with the service
                account email and give it Editor access.
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
