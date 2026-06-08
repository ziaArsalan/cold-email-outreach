import React, { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import './App.css'

const API = 'http://localhost:8080/api'

const EMAIL_SIGNATURE = ``

// Best Regards,
// Zia Arsalan
// Software Engr.

// Founder @ Devtronics

// +1 312 783 9450
// zia@devtronics.co
// https://devtronics.co

// Sheridan, WY`

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
  // Upwork tab state
  const [upworkSettings, setUpworkSettings] = useState(null)
  const [upworkStats, setUpworkStats] = useState(null)
  const [upworkJobs, setUpworkJobs] = useState([])
  const [upworkJobsLoading, setUpworkJobsLoading] = useState(false)
  const [upworkSettingsSaving, setUpworkSettingsSaving] = useState(false)
  const [upworkSettingsSaved, setUpworkSettingsSaved] = useState(false)
  const [rowBusy, setRowBusy] = useState(new Set())
  const [coverModal, setCoverModal] = useState(null)
  const [draftSettings, setDraftSettings] = useState(null)
  const [upworkTestLoading, setUpworkTestLoading] = useState(false)
  const [upworkTestResults, setUpworkTestResults] = useState(null)
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

  // ── Upwork helpers ──
  const fetchUpworkSettings = async () => {
    try {
      const { data } = await axios.get(`${API}/upwork/settings`)
      setUpworkSettings(data.settings)
    } catch (e) {}
  }

  const fetchUpworkStats = async () => {
    try {
      const { data } = await axios.get(`${API}/upwork/stats`)
      setUpworkStats(data.stats)
    } catch (e) {}
  }

  const fetchUpworkJobs = async () => {
    setUpworkJobsLoading(true)
    try {
      const { data } = await axios.get(`${API}/upwork/jobs`)
      setUpworkJobs(data.jobs || [])
    } catch (e) {
    } finally {
      setUpworkJobsLoading(false)
    }
  }

  const fetchUpworkAll = async () => {
    await Promise.all([
      fetchUpworkSettings(),
      fetchUpworkStats(),
      fetchUpworkJobs(),
    ])
  }

  const saveUpworkSettings = async (s) => {
    setUpworkSettingsSaving(true)
    try {
      const { data } = await axios.post(`${API}/upwork/settings`, s)
      setUpworkSettings(data.settings)
      setUpworkSettingsSaved(true)
      setTimeout(() => setUpworkSettingsSaved(false), 2000)
    } catch (e) {
      alert('Failed to save settings: ' + e.message)
    } finally {
      setUpworkSettingsSaving(false)
    }
  }

  const generateCover = async (rowIndex) => {
    setRowBusy((prev) => new Set([...prev, rowIndex]))
    try {
      const { data } = await axios.post(`${API}/upwork/generate-cover`, {
        rowIndex,
      })
      if (data.success) {
        setUpworkJobs((jobs) =>
          jobs.map((j) =>
            j.rowIndex === rowIndex
              ? { ...j, coverLetter: data.coverLetter }
              : j,
          ),
        )
        fetchUpworkStats()
      }
    } catch (e) {
      alert('Failed to generate cover letter: ' + e.message)
    } finally {
      setRowBusy((prev) => {
        const next = new Set(prev)
        next.delete(rowIndex)
        return next
      })
    }
  }

  const testUpworkQuery = async () => {
    setUpworkTestLoading(true)
    setUpworkTestResults(null)
    try {
      const { data } = await axios.post(`${API}/upwork/test-query`, {
        keyword: draftSettings?.keywords?.split(',')[0]?.trim() || '',
      })
      setUpworkTestResults(data)
    } catch (e) {
      setUpworkTestResults({ error: e.message })
    }
    setUpworkTestLoading(false)
  }

  // Keep the editable draft in sync when settings first load
  useEffect(() => {
    if (upworkSettings && !draftSettings) {
      setDraftSettings(upworkSettings)
    }
  }, [upworkSettings])

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
                          {!lead.generatedEmail && (
                            <button
                              className='btn-preview'
                              onClick={() => openPreview(lead)}
                            >
                              {lead.generatedEmail ? '👁 View' : '✦ Generate'}
                            </button>
                          )}
                          {console.log(lead)}
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
                  <br />
                  {previewLead.email}
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

        {/* ── UPWORK TAB ── */}
        {tab === 'upwork' && (
          <div className='tab-content'>
            <div className='page-header'>
              <h1>Upwork Monitor</h1>
              <p>Tracked jobs, settings, and AI cover letters</p>
            </div>

            {/* Stats */}
            <div className='stats-grid'>
              <div className='stat-card'>
                <span className='stat-num'>{upworkStats?.totalJobs ?? '—'}</span>
                <span className='stat-label'>Total Jobs</span>
              </div>
              <div className='stat-card'>
                <span className='stat-num'>
                  {upworkStats?.coverLettersGenerated ?? '—'}
                </span>
                <span className='stat-label'>Cover Letters</span>
              </div>
              <div className='stat-card'>
                <span className='stat-num' style={{ fontSize: '16px' }}>
                  {upworkStats?.activeActor
                    ? upworkStats.activeActor.split('/').pop()
                    : '—'}
                </span>
                <span className='stat-label'>Active Actor</span>
              </div>
              <div className='stat-card'>
                <span className='stat-num'>
                  {upworkStats
                    ? `${upworkStats.dailyCount ?? 0} / ${upworkStats.dailyLimit || '∞'}`
                    : '—'}
                </span>
                <span className='stat-label'>Today's Jobs</span>
              </div>
            </div>

            {/* Settings */}
            <div className='card settings-card'>
              <h2>Monitor Settings</h2>
              <div className='control-group'>
                <label>Cron Status</label>
                <label className='toggle-switch'>
                  <input
                    type='checkbox'
                    checked={draftSettings?.cronEnabled ?? true}
                    onChange={(e) =>
                      setDraftSettings((s) => ({
                        ...s,
                        cronEnabled: e.target.checked,
                      }))
                    }
                  />
                  <span className='toggle-slider' />
                  <span className='toggle-label'>
                    {(draftSettings?.cronEnabled ?? true) ? 'ON' : 'OFF'}
                  </span>
                </label>
              </div>
              <div className='controls-row'>
                <div className='control-group'>
                  <label>Actor ID</label>
                  <input
                    type='text'
                    value={draftSettings?.actorId ?? ''}
                    onChange={(e) =>
                      setDraftSettings((d) => ({
                        ...d,
                        actorId: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className='control-group'>
                  <label>Cron Interval</label>
                  <input
                    type='text'
                    value={draftSettings?.cronInterval ?? ''}
                    onChange={(e) =>
                      setDraftSettings((d) => ({
                        ...d,
                        cronInterval: e.target.value,
                      }))
                    }
                  />
                  <span className='field-note'>
                    Interval changes apply after server restart.
                  </span>
                </div>
                <div className='control-group'>
                  <label>Daily Job Limit</label>
                  <input
                    type='number'
                    min='0'
                    value={draftSettings?.dailyLimit ?? 0}
                    onChange={(e) =>
                      setDraftSettings((s) => ({
                        ...s,
                        dailyLimit: Number(e.target.value),
                      }))
                    }
                  />
                  <span className='field-note'>
                    Max jobs to append per day (0 = unlimited)
                  </span>
                </div>
              </div>
              <div className='control-group' style={{ marginTop: '1rem' }}>
                <label>Keywords (comma-separated)</label>
                <textarea
                  rows={3}
                  value={draftSettings?.keywords ?? ''}
                  onChange={(e) =>
                    setDraftSettings((d) => ({
                      ...d,
                      keywords: e.target.value,
                    }))
                  }
                  style={{
                    background: 'var(--surface2)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '0.5rem 0.75rem',
                    color: 'var(--text)',
                    fontFamily: "'Space Mono', monospace",
                    fontSize: '13px',
                    width: '100%',
                    outline: 'none',
                    resize: 'vertical',
                  }}
                />
              </div>
              <div className='control-group' style={{ marginTop: '1rem' }}>
                <label>Active Hours</label>
                <label className='checkbox-row'>
                  <input
                    type='checkbox'
                    checked={draftSettings?.scheduleEnabled ?? false}
                    onChange={(e) =>
                      setDraftSettings((s) => ({
                        ...s,
                        scheduleEnabled: e.target.checked,
                      }))
                    }
                  />
                  Enable time window
                </label>
                {draftSettings?.scheduleEnabled && (
                  <div className='time-range-row'>
                    <input
                      type='time'
                      value={draftSettings?.scheduleStart || '09:00'}
                      onChange={(e) =>
                        setDraftSettings((s) => ({
                          ...s,
                          scheduleStart: e.target.value,
                        }))
                      }
                    />
                    <span>to</span>
                    <input
                      type='time'
                      value={draftSettings?.scheduleEnd || '18:00'}
                      onChange={(e) =>
                        setDraftSettings((s) => ({
                          ...s,
                          scheduleEnd: e.target.value,
                        }))
                      }
                    />
                  </div>
                )}
              </div>
              <div style={{ marginTop: '1rem' }}>
                <label className='checkbox-row'>
                  <input
                    type='checkbox'
                    checked={!!draftSettings?.autoCover}
                    onChange={(e) =>
                      setDraftSettings((d) => ({
                        ...d,
                        autoCover: e.target.checked,
                      }))
                    }
                  />
                  Auto-generate cover letter
                </label>
              </div>
              <div
                style={{
                  marginTop: '1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                }}
              >
                <button
                  className='btn-start'
                  disabled={upworkSettingsSaving || !draftSettings}
                  onClick={() => saveUpworkSettings(draftSettings)}
                >
                  {upworkSettingsSaving ? 'Saving…' : 'Save Settings'}
                </button>
                {upworkSettingsSaved && (
                  <span className='badge-ok'>Saved</span>
                )}
              </div>
              <div className='control-group' style={{ marginTop: '1.25rem' }}>
                <button
                  className='btn-ghost'
                  onClick={testUpworkQuery}
                  disabled={upworkTestLoading}
                >
                  {upworkTestLoading ? 'Testing…' : '🔍 Test Query'}
                </button>
                {upworkTestResults && !upworkTestResults.error && (
                  <div className='test-results-card'>
                    <div className='test-results-header'>
                      "{upworkTestResults.keyword}" — {upworkTestResults.count}{' '}
                      jobs found
                    </div>
                    <ul className='test-results-list'>
                      {upworkTestResults.jobs.map((j, i) => (
                        <li key={i}>
                          <a href={j.url} target='_blank' rel='noreferrer'>
                            {j.title}
                          </a>
                          <span className='test-result-meta'>
                            {j.clientCountry} · {j.applicants} applicants ·{' '}
                            {Array.isArray(j.skills)
                              ? j.skills.slice(0, 3).join(', ')
                              : j.skills}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {upworkTestResults?.error && (
                  <div className='test-results-card test-results-error'>
                    {upworkTestResults.error}
                  </div>
                )}
              </div>
            </div>

            {/* Jobs table */}
            <div className='card table-card'>
              <div
                className='bulk-actions'
                style={{ justifyContent: 'space-between', alignItems: 'center' }}
              >
                <h2 style={{ margin: 0 }}>Upwork Jobs</h2>
                <button
                  className='btn-ghost'
                  onClick={() => {
                    fetchUpworkJobs()
                    fetchUpworkStats()
                  }}
                >
                  ↻ Refresh
                </button>
              </div>
              {upworkJobsLoading ? (
                <div className='loading-card'>
                  <div className='spinner' />
                  <p>Loading jobs…</p>
                </div>
              ) : (
                <div className='table-wrapper'>
                  <table>
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Link</th>
                        <th>Skills</th>
                        <th>Country</th>
                        <th>Rating</th>
                        <th>Applicants</th>
                        <th>Contact</th>
                        <th>Confidence</th>
                        <th>Apply</th>
                        <th>Cover Letter</th>
                        <th>Date</th>
                        {!upworkSettings?.autoCover && <th>Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {upworkJobs.map((job) => (
                        <tr key={job.rowIndex}>
                          <td>{job.title}</td>
                          <td>
                            {job.url && (
                              <a
                                href={job.url}
                                target='_blank'
                                rel='noreferrer'
                                className='link'
                              >
                                View
                              </a>
                            )}
                          </td>
                          <td>{job.skills}</td>
                          <td>{job.clientCountry}</td>
                          <td>{job.clientRating}</td>
                          <td>{job.applicants}</td>
                          <td>{job.contactName}</td>
                          <td>{job.contactConfidence}</td>
                          <td>
                            {job.applyLink && (
                              <a
                                href={job.applyLink}
                                target='_blank'
                                rel='noreferrer'
                                className='link'
                              >
                                Apply
                              </a>
                            )}
                          </td>
                          <td>
                            {job.coverLetter && job.coverLetter.trim() ? (
                              <span
                                className='cover-preview'
                                onClick={() => setCoverModal(job.coverLetter)}
                              >
                                {job.coverLetter.slice(0, 80)}…
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td>{job.dateFound}</td>
                          {!upworkSettings?.autoCover && (
                            <td>
                              {!job.coverLetter?.trim() &&
                                (rowBusy.has(job.rowIndex) ? (
                                  <span
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '0.5rem',
                                    }}
                                  >
                                    <span className='spinner' /> Generating…
                                  </span>
                                ) : (
                                  <button
                                    className='btn-preview'
                                    onClick={() => generateCover(job.rowIndex)}
                                  >
                                    Generate Cover
                                  </button>
                                ))}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
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
