import React, { useState, useEffect } from 'react'
import axios from 'axios'
import './App.css'

const API = 'http://localhost:8080/api'

// Restore token on page load
const _savedToken = localStorage.getItem('token')
if (_savedToken)
  axios.defaults.headers.common['Authorization'] = 'Bearer ' + _savedToken

// Global 401 handler — set by App component
let _onUnauthorized = null

// Request interceptor — re-reads token each call
axios.interceptors.request.use((cfg) => {
  const t = localStorage.getItem('token')
  if (t) cfg.headers = cfg.headers || {}
  if (t) cfg.headers['Authorization'] = 'Bearer ' + t
  return cfg
})

// Response interceptor — redirect to login on 401 (except login route itself)
axios.interceptors.response.use(
  (r) => r,
  (err) => {
    if (
      err.response?.status === 401 &&
      !err.config?.url?.endsWith('/auth/login')
    ) {
      localStorage.removeItem('token')
      delete axios.defaults.headers.common['Authorization']
      if (_onUnauthorized) _onUnauthorized()
    }
    return Promise.reject(err)
  },
)

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

// Default state for the "New Campaign" form.
const BLANK_CAMPAIGN = {
  name: '',
  templateId: '',
  steps: [],
  aiPrompt: '',
  mailboxIds: [],
  dailyLimit: 20,
  warmupEnabled: true,
  days: ['mon', 'tue', 'wed', 'thu', 'fri'],
  startTime: '09:00',
  endTime: '17:00',
}

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

// Sample values used to render the live template preview.
const SAMPLE_VARS = {
  first_name: 'Jane',
  last_name: 'Doe',
  company: 'Acme Co',
  industry: 'SaaS',
  website: 'acme.co',
  ai_intro:
    'I noticed Acme just shipped a new dashboard — clean work.',
}

// Replace {{var}} tokens with the provided values (blank for unknown keys).
const substitute = (text, vars) =>
  String(text ?? '').replace(/{{\s*(\w+)\s*}}/g, (_, k) => vars[k] ?? '')

// Summarize a campaign's schedule for the list row.
const scheduleSummary = (schedule) => {
  if (!schedule) return 'Any time'
  const days = Array.isArray(schedule.days) ? schedule.days : []
  const dayPart = days.length ? days.join(', ') : 'every day'
  const timePart =
    schedule.startTime && schedule.endTime
      ? `${schedule.startTime}–${schedule.endTime}`
      : 'any time'
  return `${dayPart} · ${timePart}`
}

// Compact local date-time for queue/mailbox tables; em dash when absent.
const fmtDate = (d) => (d ? new Date(d).toLocaleString() : '—')

// Truncate long strings for table cells (full value shown via title attr).
const trunc = (s, n = 40) =>
  s && s.length > n ? s.slice(0, n) + '…' : s || ''

function LoginScreen({ onSuccess }) {
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState('')
  const [loading, setLoading] = React.useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { data } = await axios.post(`${API}/auth/login`, { email, password })
      localStorage.setItem('token', data.token)
      axios.defaults.headers.common['Authorization'] = 'Bearer ' + data.token
      onSuccess()
    } catch {
      setError('Invalid email or password')
    }
    setLoading(false)
  }

  return (
    <div className='login-screen'>
      <div className='login-card'>
        <div className='login-logo'>
          <span className='logo-d'>D</span>
          <div className='login-logo-text'>
            <span>Devtronics</span>
            <small>Outreach</small>
          </div>
        </div>
        <h2 className='login-title'>Sign in</h2>
        <form onSubmit={handleLogin} className='login-form'>
          <div className='login-field'>
            <label>Email</label>
            <input
              type='email'
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder='admin@example.com'
              required
              autoFocus
            />
          </div>
          <div className='login-field'>
            <label>Password</label>
            <input
              type='password'
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder='••••••••'
              required
            />
          </div>
          {error && <div className='login-error'>{error}</div>}
          <button className='btn-start login-btn' type='submit' disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function App() {
  const [leads, setLeads] = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [templates, setTemplates] = useState([])
  const [mailboxes, setMailboxes] = useState([])
  const [newCampaign, setNewCampaign] = useState(BLANK_CAMPAIGN)
  const [campaignBusy, setCampaignBusy] = useState(false)
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
  const [authed, setAuthed] = useState(!!localStorage.getItem('token'))
  // Dashboard analytics + live queue (T-012)
  const [analytics, setAnalytics] = useState(null)
  const [queue, setQueue] = useState({ items: [], total: 0, page: 1, pages: 1 })
  const [queueStatus, setQueueStatus] = useState('')
  const [queuePage, setQueuePage] = useState(1)

  // Mailbox management (add/edit/test/pause)
  const [mailboxForm, setMailboxForm] = useState(null) // null = closed; {} = new; {...mb} = editing
  const [mailboxBusy, setMailboxBusy] = useState(false)
  const [mailboxTestResult, setMailboxTestResult] = useState(null) // { id, success, warnings }

  // Template management (add/edit/delete)
  const [templateForm, setTemplateForm] = useState(null) // null = closed
  const [templateBusy, setTemplateBusy] = useState(false)

  const logout = () => {
    localStorage.removeItem('token')
    delete axios.defaults.headers.common['Authorization']
    setAuthed(false)
  }

  // Register the global 401 handler so interceptor can bounce to login
  useEffect(() => {
    _onUnauthorized = () => setAuthed(false)
    return () => {
      _onUnauthorized = null
    }
  }, [])

  const fetchLeads = async () => {
    try {
      const { data } = await axios.get(`${API}/leads`)
      setLeads(data.leads || [])
    } catch (e) {}
  }

  useEffect(() => {
    fetchLeads()
  }, [])

  // ── Dashboard analytics + live queue (T-012) ──
  const fetchAnalytics = async () => {
    try {
      const { data } = await axios.get(`${API}/analytics`)
      setAnalytics(data.analytics || null)
    } catch (e) {}
  }

  const fetchQueue = async (status = queueStatus, page = queuePage) => {
    try {
      const { data } = await axios.get(
        `${API}/queue?status=${status}&page=${page}&limit=25`,
      )
      setQueue({
        items: data.items || [],
        total: data.total || 0,
        page: data.page || 1,
        pages: data.pages || 1,
      })
    } catch (e) {}
  }

  const fetchDashboardAll = async () => {
    await Promise.all([fetchAnalytics(), fetchQueue()])
  }

  const markLead = async (leadId, action) => {
    if (!leadId) return
    try {
      await axios.post(`${API}/leads/${leadId}/${action}`)
      await fetchDashboardAll()
    } catch (err) {
      alert(
        `Failed to mark lead ${action}: ` +
          (err.response?.data?.error || err.message),
      )
    }
  }

  // Load dashboard data once authenticated (fires after login, not just on
  // mount — a pre-auth fetch would 401 and leave the dashboard empty).
  useEffect(() => {
    if (authed && tab === 'dashboard') fetchDashboardAll()
  }, [authed])

  // ── Mailboxes (add / edit / test / pause / warm-up) ──
  const BLANK_MAILBOX = {
    name: '',
    email: '',
    host: '',
    port: 465,
    secure: true,
    username: '',
    password: '',
    dailyLimit: 50,
    hourlyLimit: 10,
    warmupEnabled: true,
    warmupStartDate: new Date().toISOString().slice(0, 10),
  }

  const BLANK_TEMPLATE = {
    name: '',
    subject: '',
    body: '',
    signature: '',
    active: true,
  }

  const openNewMailboxForm = () => {
    setMailboxTestResult(null)
    setMailboxForm({ ...BLANK_MAILBOX })
  }

  const openEditMailboxForm = (mb) => {
    setMailboxTestResult(null)
    setMailboxForm({
      _id: mb._id,
      name: mb.name || '',
      email: mb.email || '',
      host: mb.host || '',
      port: mb.port || 465,
      secure: mb.secure !== false,
      username: mb.username || '',
      password: '', // never prefilled — blank means "keep existing"
      dailyLimit: mb.dailyLimit ?? 50,
      hourlyLimit: mb.hourlyLimit ?? 10,
      warmupEnabled: mb.warmupEnabled !== false,
      warmupStartDate: mb.warmupStartDate
        ? new Date(mb.warmupStartDate).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10),
    })
  }

  const closeMailboxForm = () => {
    setMailboxForm(null)
    setMailboxTestResult(null)
  }

  const saveMailbox = async (e) => {
    e.preventDefault()
    if (!mailboxForm) return
    setMailboxBusy(true)
    try {
      const payload = {
        name: mailboxForm.name,
        email: mailboxForm.email,
        host: mailboxForm.host,
        port: Number(mailboxForm.port),
        secure: !!mailboxForm.secure,
        username: mailboxForm.username,
        dailyLimit: Number(mailboxForm.dailyLimit),
        hourlyLimit: Number(mailboxForm.hourlyLimit),
        warmupEnabled: !!mailboxForm.warmupEnabled,
        warmupStartDate: mailboxForm.warmupEnabled
          ? mailboxForm.warmupStartDate
          : null,
      }
      // Only send a password when the user actually typed one — on edit, a
      // blank field means "keep the existing password" (never overwrite with '').
      if (mailboxForm.password) payload.password = mailboxForm.password

      if (mailboxForm._id) {
        await axios.put(`${API}/mailboxes/${mailboxForm._id}`, payload)
      } else {
        await axios.post(`${API}/mailboxes`, payload)
      }
      closeMailboxForm()
      await Promise.all([fetchMailboxes(), fetchDashboardAll()])
    } catch (err) {
      alert(
        'Failed to save mailbox: ' +
          (err.response?.data?.error || err.message),
      )
    } finally {
      setMailboxBusy(false)
    }
  }

  const testMailbox = async (id) => {
    setMailboxBusy(true)
    try {
      const { data } = await axios.post(`${API}/mailboxes/${id}/test`)
      setMailboxTestResult({
        id,
        success: data.success,
        warnings: data.warnings || [],
      })
      await Promise.all([fetchMailboxes(), fetchDashboardAll()])
    } catch (err) {
      alert(
        'Failed to test mailbox: ' +
          (err.response?.data?.error || err.message),
      )
    } finally {
      setMailboxBusy(false)
    }
  }

  const toggleMailboxPause = async (mb) => {
    setMailboxBusy(true)
    try {
      const paused = mb.healthStatus === 'paused'
      const action = paused ? 'resume' : 'pause'
      // Manual pause defaults to 24h (vs. the short rate-limit backoff the
      // worker itself uses) so it doesn't silently resume mid-review.
      const body = paused ? {} : { minutes: 1440, reason: 'manual pause' }
      await axios.post(`${API}/mailboxes/${mb._id}/${action}`, body)
      await Promise.all([fetchMailboxes(), fetchDashboardAll()])
    } catch (err) {
      alert(
        `Failed to ${mb.healthStatus === 'paused' ? 'resume' : 'pause'} mailbox: ` +
          (err.response?.data?.error || err.message),
      )
    } finally {
      setMailboxBusy(false)
    }
  }

  // ── Templates (add / edit / delete) ──
  const openNewTemplateForm = () => setTemplateForm({ ...BLANK_TEMPLATE })

  const openEditTemplateForm = (t) =>
    setTemplateForm({
      _id: t._id,
      name: t.name || '',
      subject: t.subject || '',
      body: t.body || '',
      signature: t.signature || '',
      active: t.active !== false,
    })

  const closeTemplateForm = () => setTemplateForm(null)

  const saveTemplate = async (e) => {
    e.preventDefault()
    // Explicit guard so save failures always surface a message (not just the
    // browser's native required-field bubble, which is easy to miss).
    if (!templateForm.name.trim() || !templateForm.subject.trim() || !templateForm.body.trim()) {
      alert('Name, Subject and Body are all required.')
      return
    }
    setTemplateBusy(true)
    try {
      const payload = {
        name: templateForm.name,
        subject: templateForm.subject,
        body: templateForm.body,
        signature: templateForm.signature,
        active: templateForm.active,
      }
      if (templateForm._id) {
        await axios.put(`${API}/templates/${templateForm._id}`, payload)
      } else {
        await axios.post(`${API}/templates`, payload)
      }
      closeTemplateForm()
      await fetchTemplates()
    } catch (err) {
      alert(
        'Failed to save template: ' +
          (err.response?.data?.error || err.message),
      )
    } finally {
      setTemplateBusy(false)
    }
  }

  const deleteTemplate = async (t) => {
    if (
      !window.confirm(
        `Delete template "${t.name}"? This cannot be undone.`,
      )
    )
      return
    try {
      await axios.delete(`${API}/templates/${t._id}`)
      await fetchTemplates()
    } catch (err) {
      alert(
        'Failed to delete template: ' +
          (err.response?.data?.error || err.message),
      )
    }
  }

  // ── Campaigns ──
  const fetchCampaigns = async () => {
    try {
      const { data } = await axios.get(`${API}/campaigns`)
      setCampaigns(data.campaigns || [])
    } catch (e) {}
  }

  const fetchTemplates = async () => {
    try {
      const { data } = await axios.get(`${API}/templates`)
      setTemplates(data.templates || [])
    } catch (e) {}
  }

  const fetchMailboxes = async () => {
    try {
      const { data } = await axios.get(`${API}/mailboxes`)
      setMailboxes(data.mailboxes || [])
    } catch (e) {}
  }

  const fetchCampaignsAll = async () => {
    await Promise.all([fetchCampaigns(), fetchTemplates(), fetchMailboxes()])
  }

  const createCampaign = async (e) => {
    e.preventDefault()
    if (!newCampaign.name.trim()) return
    setCampaignBusy(true)
    try {
      const payload = {
        name: newCampaign.name.trim(),
        aiPrompt: newCampaign.aiPrompt,
        mailboxIds: newCampaign.mailboxIds,
        dailyLimit: Number(newCampaign.dailyLimit),
        warmupEnabled: newCampaign.warmupEnabled,
        schedule: {
          days: newCampaign.days,
          startTime: newCampaign.startTime,
          endTime: newCampaign.endTime,
        },
      }
      if (newCampaign.templateId) {
        payload.templateId = newCampaign.templateId
        // Build the full sequence: step 0 is the initial email, then any
        // follow-ups with a chosen template. Omit steps entirely when no
        // initial template is picked, preserving the single-email behavior.
        const followups = newCampaign.steps.filter((s) => s.templateId)
        payload.steps = [
          { templateId: newCampaign.templateId, delayDays: 0 },
          ...followups.map((s) => ({
            templateId: s.templateId,
            delayDays: Number(s.delayDays) || 0,
          })),
        ]
      }
      await axios.post(`${API}/campaigns`, payload)
      setNewCampaign(BLANK_CAMPAIGN)
      await fetchCampaigns()
    } catch (err) {
      alert('Failed to create campaign: ' + (err.response?.data?.error || err.message))
    } finally {
      setCampaignBusy(false)
    }
  }

  const campaignAction = async (id, action) => {
    try {
      const { data } = await axios.post(`${API}/campaigns/${id}/${action}`)
      if (action === 'start' && data.skipped > 0) {
        alert(
          `Campaign started: ${data.enqueued} enqueued, ${data.skipped} lead(s) skipped (invalid email — see server logs).`,
        )
      }
      await fetchCampaigns()
    } catch (err) {
      alert(`Failed to ${action} campaign: ` + (err.response?.data?.error || err.message))
    }
  }

  const toggleCampaignDay = (day) => {
    setNewCampaign((c) => ({
      ...c,
      days: c.days.includes(day)
        ? c.days.filter((d) => d !== day)
        : [...c.days, day],
    }))
  }

  const toggleCampaignMailbox = (id) => {
    setNewCampaign((c) => ({
      ...c,
      mailboxIds: c.mailboxIds.includes(id)
        ? c.mailboxIds.filter((m) => m !== id)
        : [...c.mailboxIds, id],
    }))
  }

  // Follow-up sequence editing (steps are follow-ups only; step 0 = the main
  // Template dropdown above).
  const addFollowup = () =>
    setNewCampaign((c) => ({
      ...c,
      steps: [...c.steps, { templateId: '', delayDays: 3 }],
    }))

  const updateFollowup = (i, patch) =>
    setNewCampaign((c) => ({
      ...c,
      steps: c.steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)),
    }))

  const removeFollowup = (i) =>
    setNewCampaign((c) => ({
      ...c,
      steps: c.steps.filter((_, idx) => idx !== i),
    }))

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

  if (!authed) return <LoginScreen onSuccess={() => setAuthed(true)} />

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
              fetchLeads()
            }}
          >
            <span className='nav-icon'>◉</span> Leads
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

            {/* Mailboxes */}
            <div className='card table-card'>
              <div
                className='bulk-actions'
                style={{ justifyContent: 'space-between', alignItems: 'center' }}
              >
                <h2 style={{ margin: 0 }}>Mailboxes</h2>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className='btn-ghost' onClick={fetchDashboardAll}>
                    ↻ Refresh
                  </button>
                  <button className='btn-start' onClick={openNewMailboxForm}>
                    + Add Mailbox
                  </button>
                </div>
              </div>

              {mailboxForm && (
                <form
                  onSubmit={saveMailbox}
                  className='card'
                  style={{ margin: '0 0 1rem', background: 'var(--bg-alt)' }}
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
                          setMailboxForm((f) => ({ ...f, name: e.target.value }))
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
                          setMailboxForm((f) => ({ ...f, email: e.target.value }))
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
                          setMailboxForm((f) => ({ ...f, host: e.target.value }))
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
                          setMailboxForm((f) => ({ ...f, port: e.target.value }))
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
                        Ramps the daily cap 5→10→20→30→40→50 over 4 weeks from
                        the start date below, then uses the plain Daily Limit.
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
                    <>
                      {' '}
                      Warnings: {mailboxTestResult.warnings.join('; ')}
                    </>
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
                        <th>Paused Until</th>
                        <th>Last Error</th>
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
                          <td>{mb.pausedUntil ? fmtDate(mb.pausedUntil) : '—'}</td>
                          <td
                            className='cell-trunc'
                            title={mb.lastError || ''}
                          >
                            {trunc(mb.lastError, 40) || '—'}
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
                                className='btn-ghost'
                                disabled={mailboxBusy}
                                onClick={() => toggleMailboxPause(mb)}
                              >
                                {mb.healthStatus === 'paused'
                                  ? 'Resume'
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
                              <span className={`status-badge badge-${c.status}`}>
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

            {/* Live queue */}
            <div className='card table-card'>
              <div
                className='bulk-actions'
                style={{ justifyContent: 'space-between', alignItems: 'center' }}
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
                            <span className={`status-badge badge-${item.status}`}>
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

            {/* Existing campaigns */}
            <div className='card'>
              <div
                className='bulk-actions'
                style={{ justifyContent: 'space-between', alignItems: 'center' }}
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
                    return (
                      <div key={c._id} className='campaign-row'>
                        <div className='campaign-main'>
                          <div className='campaign-title'>
                            <span className='campaign-name'>{c.name}</span>
                            <span
                              className={`status-badge badge-${c.status}`}
                            >
                              {c.status}
                            </span>
                          </div>
                          <div className='campaign-meta'>
                            <span>{c.stepCount || 1} step(s)</span>
                            <span>pending {counts.pending || 0}</span>
                            <span>sent {counts.sent || 0}</span>
                            <span>cancelled {counts.cancelled || 0}</span>
                            <span>limit {c.dailyLimit || 0}/day</span>
                            <span>
                              warm-up {c.warmupEnabled ? 'on' : 'off'}
                            </span>
                            <span>{scheduleSummary(c.schedule)}</span>
                          </div>
                        </div>
                        <div className='campaign-actions'>
                          {c.status === 'draft' && (
                            <button
                              className='btn-start'
                              onClick={() => campaignAction(c._id, 'start')}
                            >
                              ▶ Start
                            </button>
                          )}
                          {c.status === 'running' && (
                            <>
                              <button
                                className='btn-ghost'
                                onClick={() => campaignAction(c._id, 'pause')}
                              >
                                ❚❚ Pause
                              </button>
                              <button
                                className='btn-stop'
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
                                onClick={() => campaignAction(c._id, 'resume')}
                              >
                                ▶ Resume
                              </button>
                              <button
                                className='btn-stop'
                                onClick={() => campaignAction(c._id, 'stop')}
                              >
                                ■ Stop
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

            {/* New campaign */}
            <div className='card'>
              <h2>New Campaign</h2>
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
                      rows={3}
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
                <div style={{ marginTop: '1.25rem' }}>
                  <button
                    className='btn-start'
                    type='submit'
                    disabled={campaignBusy || !newCampaign.name.trim()}
                  >
                    {campaignBusy ? 'Creating…' : '+ Create Campaign'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── TEMPLATES TAB ── */}
        {tab === 'templates' && (
          <div className='tab-content'>
            <div className='page-header'>
              <h1>Templates</h1>
              <p>Reusable email templates with {'{{variable}}'} substitution</p>
            </div>

            <div className='card table-card'>
              <div
                className='bulk-actions'
                style={{ justifyContent: 'space-between', alignItems: 'center' }}
              >
                <h2 style={{ margin: 0 }}>Your Templates</h2>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className='btn-ghost' onClick={fetchTemplates}>
                    ↻ Refresh
                  </button>
                  <button className='btn-start' onClick={openNewTemplateForm}>
                    + New Template
                  </button>
                </div>
              </div>
              {templates.length === 0 ? (
                <p style={{ color: 'var(--muted)', fontSize: '13px' }}>
                  No templates yet.
                </p>
              ) : (
                <div className='table-wrapper'>
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Subject</th>
                        <th>Status</th>
                        <th>Updated</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {templates.map((t) => (
                        <tr key={t._id}>
                          <td>{t.name}</td>
                          <td
                            style={{
                              maxWidth: '280px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            title={t.subject}
                          >
                            {t.subject}
                          </td>
                          <td>
                            <span
                              className={`status-badge ${
                                t.active !== false
                                  ? 'health-healthy'
                                  : 'health-paused'
                              }`}
                            >
                              {t.active !== false ? 'active' : 'inactive'}
                            </span>
                          </td>
                          <td>
                            {t.updatedAt
                              ? new Date(t.updatedAt).toLocaleDateString()
                              : '—'}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                              <button
                                className='btn-ghost'
                                onClick={() => openEditTemplateForm(t)}
                              >
                                Edit
                              </button>
                              <button
                                className='btn-stop'
                                onClick={() => deleteTemplate(t)}
                              >
                                Delete
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

            {templateForm && (
              <form
                onSubmit={saveTemplate}
                className='card'
                style={{ background: 'var(--bg-alt)' }}
              >
                <h3 style={{ marginTop: 0 }}>
                  {templateForm._id ? 'Edit Template' : 'New Template'}
                </h3>
                <div className='settings-fields-grid'>
                  <div className='control-group'>
                    <label>Name</label>
                    <input
                      value={templateForm.name}
                      onChange={(e) =>
                        setTemplateForm((f) => ({ ...f, name: e.target.value }))
                      }
                      placeholder='Default'
                      required
                    />
                  </div>
                  <div className='control-group'>
                    <label>Subject</label>
                    <input
                      value={templateForm.subject}
                      onChange={(e) =>
                        setTemplateForm((f) => ({
                          ...f,
                          subject: e.target.value,
                        }))
                      }
                      placeholder='Quick question, {{first_name}}'
                      required
                    />
                  </div>
                  <div className='control-group full-width'>
                    <label>Body</label>
                    <textarea
                      rows={8}
                      value={templateForm.body}
                      onChange={(e) =>
                        setTemplateForm((f) => ({ ...f, body: e.target.value }))
                      }
                      required
                    />
                    <span className='field-note'>
                      {
                        'Variables: {{first_name}} {{last_name}} {{company}} {{industry}} {{website}} {{ai_intro}}'
                      }
                    </span>
                  </div>
                  <div className='control-group full-width'>
                    <label>Signature</label>
                    <textarea
                      rows={3}
                      value={templateForm.signature}
                      onChange={(e) =>
                        setTemplateForm((f) => ({
                          ...f,
                          signature: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className='control-group'>
                    <label>
                      <input
                        type='checkbox'
                        checked={templateForm.active}
                        onChange={(e) =>
                          setTemplateForm((f) => ({
                            ...f,
                            active: e.target.checked,
                          }))
                        }
                      />{' '}
                      Active
                    </label>
                  </div>
                </div>

                <div
                  className='card'
                  style={{ background: 'var(--bg-alt)', marginTop: '1rem' }}
                >
                  <h4 style={{ marginTop: 0 }}>Live Preview</h4>
                  <p style={{ margin: '0 0 0.5rem' }}>
                    <strong>Subject:</strong>{' '}
                    {substitute(templateForm.subject, SAMPLE_VARS)}
                  </p>
                  <div style={{ whiteSpace: 'pre-wrap' }}>
                    {substitute(templateForm.body, SAMPLE_VARS)}
                  </div>
                  {templateForm.signature && (
                    <div
                      style={{ whiteSpace: 'pre-wrap', marginTop: '0.75rem' }}
                    >
                      {substitute(templateForm.signature, SAMPLE_VARS)}
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
                    disabled={templateBusy}
                  >
                    {templateBusy
                      ? 'Saving…'
                      : templateForm._id
                        ? 'Save Changes'
                        : '+ Create Template'}
                  </button>
                  <button
                    className='btn-ghost'
                    type='button'
                    onClick={closeTemplateForm}
                    disabled={templateBusy}
                  >
                    Cancel
                  </button>
                </div>
              </form>
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

              {/* Cron toggle — prominent, full width */}
              <div className='cron-control-row'>
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

              {/* Two-column grid of fields */}
              <div className='settings-fields-grid'>
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
                <div className='control-group'>
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
                <div className='control-group'>
                  <label>Auto-cover</label>
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
                <div className='control-group full-width'>
                  <label>Keywords (comma-separated)</label>
                  <textarea
                    className='settings-textarea'
                    rows={3}
                    value={draftSettings?.keywords ?? ''}
                    onChange={(e) =>
                      setDraftSettings((d) => ({
                        ...d,
                        keywords: e.target.value,
                      }))
                    }
                  />
                </div>
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
