import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
} from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import axios, { API, setUnauthorizedHandler } from '../api'
import { BLANK_CAMPAIGN } from '../utils'

export const AppContext = createContext(null)

export const useApp = () => useContext(AppContext)

export function AppProvider({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [leads, setLeads] = useState([])
  // Lead lists (T-017)
  const [lists, setLists] = useState([])
  const [openList, setOpenList] = useState(null)
  const [listLeads, setListLeads] = useState({
    items: [],
    page: 1,
    pages: 1,
    total: 0,
  })
  const [selectedLeadIds, setSelectedLeadIds] = useState(new Set())
  const [leadSearch, setLeadSearch] = useState('')
  const [leadStatusFilter, setLeadStatusFilter] = useState('')
  const [addLeadOpen, setAddLeadOpen] = useState(false)
  const [addLeadBusy, setAddLeadBusy] = useState(false)
  const emptyLead = {
    firstName: '',
    lastName: '',
    email: '',
    company: '',
    title: '',
    website: '',
  }
  const [addLeadForm, setAddLeadForm] = useState(emptyLead)
  // Bulk/all intro regeneration in flight (one AI call per lead — can be slow).
  const [regenBusy, setRegenBusy] = useState(false)
  const [newListForm, setNewListForm] = useState({ name: '', description: '' })
  const [assignTarget, setAssignTarget] = useState('')
  const [importBusy, setImportBusy] = useState(false)
  const [importSummary, setImportSummary] = useState(null)
  const [sheetImport, setSheetImport] = useState({ sheetId: '', tab: '' })
  const [mapsImport, setMapsImport] = useState({
    query: '',
    maxResults: 20,
    skipRoleBased: true,
  })
  // Separate flag for the Google Maps fetch so its long-running loading UI shows
  // only for that import (CSV/Sheet imports are fast and share importBusy).
  const [mapsBusy, setMapsBusy] = useState(false)
  const [emailModal, setEmailModal] = useState(null)
  // Logs viewer (SendLog)
  const [logs, setLogs] = useState({ items: [], total: 0, page: 1, pages: 1 })
  const [logsCategory, setLogsCategory] = useState('')
  const [logsSince, setLogsSince] = useState('')
  const [campaigns, setCampaigns] = useState([])
  const [templates, setTemplates] = useState([])
  const [mailboxes, setMailboxes] = useState([])
  const [newCampaign, setNewCampaign] = useState(BLANK_CAMPAIGN)
  const [campaignBusy, setCampaignBusy] = useState(false)
  // null = create mode; an id = editing that (draft) campaign in the same form.
  const [editingCampaignId, setEditingCampaignId] = useState(null)
  // Which campaign has an in-flight start/pause/resume/stop (disables its buttons).
  const [campaignActionId, setCampaignActionId] = useState(null)
  // Synchronous lock so a fast double-click fires the action only once, before
  // React re-renders the disabled button.
  const campaignActionLock = useRef(new Set())
  const [previewLead, setPreviewLead] = useState(null)
  const [preview, setPreview] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [tab, setTab] = useState('dashboard')
  const [navOpen, setNavOpen] = useState(false)
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
  // Outreach V2 settings (worker/delay/verification tunables). The server stores
  // ms/ints; this UI shows minutes (delays) and seconds (idle) and converts on the
  // wire — see the field handlers below.
  const [outreachSettings, setOutreachSettings] = useState(null)
  const [outreachDraft, setOutreachDraft] = useState(null)
  const [outreachSaving, setOutreachSaving] = useState(false)
  const [outreachSaved, setOutreachSaved] = useState(false)
  const [upworkTestLoading, setUpworkTestLoading] = useState(false)
  const [upworkTestResults, setUpworkTestResults] = useState(null)
  const [authed, setAuthed] = useState(!!localStorage.getItem('token'))
  // Dashboard analytics + live queue (T-012)
  const [analytics, setAnalytics] = useState(null)
  const [queueActivity, setQueueActivity] = useState({
    sending: [],
    next: [],
    sent: [],
  })
  const [queue, setQueue] = useState({ items: [], total: 0, page: 1, pages: 1 })
  const [queueStatus, setQueueStatus] = useState('')
  const [queuePage, setQueuePage] = useState(1)
  // Live Queue sort — server-side (the table is paginated, so a client sort would
  // only reorder the visible page). Whitelisted fields mirror the API.
  const [queueSort, setQueueSort] = useState({ field: 'createdAt', dir: 'desc' })
  // Replies (inbound, detected by the IMAP worker) for the Replies tab.
  const [replies, setReplies] = useState({ items: [], total: 0, page: 1, pages: 1 })
  const [replyMailbox, setReplyMailbox] = useState('') // '' = all inboxes
  const [repliesBusy, setRepliesBusy] = useState(false)

  // Mailbox management (add/edit/test/pause)
  const [mailboxForm, setMailboxForm] = useState(null) // null = closed; {} = new; {...mb} = editing
  const [mailboxBusy, setMailboxBusy] = useState(false)
  const [mailboxTestResult, setMailboxTestResult] = useState(null) // { id, success, warnings }

  // Template management (add/edit/delete)
  const [templateForm, setTemplateForm] = useState(null) // null = closed
  const [templateBusy, setTemplateBusy] = useState(false)
  // Template test modal: send the real template to every lead in a tester list.
  const [templateTest, setTemplateTest] = useState(null)
  // Campaign View modal: per-campaign queue items + logs.
  const [campaignView, setCampaignView] = useState(null)

  const logout = () => {
    localStorage.removeItem('token')
    delete axios.defaults.headers.common['Authorization']
    setAuthed(false)
  }

  // Register the global 401 handler so interceptor can bounce to login
  useEffect(() => {
    setUnauthorizedHandler(() => setAuthed(false))
    return () => setUnauthorizedHandler(null)
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

  // ── Lead lists (T-017) ──
  const fetchLists = async () => {
    try {
      const { data } = await axios.get(`${API}/lists`)
      setLists(data.lists || [])
    } catch (e) {}
  }

  const fetchListLeads = async (
    id,
    page = 1,
    q = leadSearch,
    status = leadStatusFilter,
  ) => {
    try {
      const { data } = await axios.get(
        `${API}/lists/${id}/leads?page=${page}&limit=25${
          q ? `&q=${encodeURIComponent(q)}` : ''
        }${status ? `&status=${encodeURIComponent(status)}` : ''}`,
      )
      setListLeads({
        items: data.items || [],
        page: data.page || 1,
        pages: data.pages || 1,
        total: data.total || 0,
      })
      setSelectedLeadIds(new Set())
    } catch (e) {}
  }

  const openListView = (list) => {
    setOpenList(list)
    setImportSummary(null)
    setSheetImport({ sheetId: '', tab: '' })
    setLeadSearch('')
    setLeadStatusFilter('')
    fetchListLeads(list._id, 1, '', '')
  }

  const submitLeadSearch = (e) => {
    if (e) e.preventDefault()
    if (openList) fetchListLeads(openList._id, 1, leadSearch, leadStatusFilter)
  }

  const changeStatusFilter = (status) => {
    setLeadStatusFilter(status)
    if (openList) fetchListLeads(openList._id, 1, leadSearch, status)
  }

  const addLead = async (e) => {
    if (e) e.preventDefault()
    if (!openList) return
    const email = addLeadForm.email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      alert('Please enter a valid email address.')
      return
    }
    setAddLeadBusy(true)
    try {
      const { data } = await axios.post(
        `${API}/lists/${openList._id}/leads`,
        addLeadForm,
      )
      setAddLeadForm(emptyLead)
      setAddLeadOpen(false)
      setLeadSearch('')
      await Promise.all([fetchListLeads(openList._id, 1, ''), fetchLists()])
      if (data.moved)
        alert('That email already existed — moved it into this list.')
    } catch (err) {
      alert('Failed to add lead: ' + (err.response?.data?.error || err.message))
    } finally {
      setAddLeadBusy(false)
    }
  }

  const closeListView = () => {
    setOpenList(null)
    setImportSummary(null)
    setSelectedLeadIds(new Set())
  }

  const createList = async (e) => {
    if (e) e.preventDefault()
    if (!newListForm.name.trim()) return
    try {
      await axios.post(`${API}/lists`, {
        name: newListForm.name.trim(),
        description: newListForm.description,
      })
      setNewListForm({ name: '', description: '' })
      await fetchLists()
    } catch (err) {
      alert(
        'Failed to create list: ' + (err.response?.data?.error || err.message),
      )
    }
  }

  const deleteList = async (list) => {
    if (
      !window.confirm(
        `Delete list "${list.name}"? Its leads become unassigned.`,
      )
    )
      return
    try {
      await axios.delete(`${API}/lists/${list._id}`)
      await fetchLists()
    } catch (err) {
      alert(err.response?.data?.error || err.message)
    }
  }

  const toggleLeadSelected = (id) => {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Toggle every lead on the current page (header checkbox).
  const pageLeadIds = listLeads.items.map((l) => l._id)
  const allPageSelected =
    pageLeadIds.length > 0 && pageLeadIds.every((id) => selectedLeadIds.has(id))
  const toggleSelectPage = () => {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev)
      if (allPageSelected) pageLeadIds.forEach((id) => next.delete(id))
      else pageLeadIds.forEach((id) => next.add(id))
      return next
    })
  }

  // Select every lead in the whole list (across all pages).
  const selectAllInList = async () => {
    if (!openList) return
    try {
      const { data } = await axios.get(`${API}/lists/${openList._id}/lead-ids`)
      setSelectedLeadIds(new Set(data.ids || []))
    } catch (e) {}
  }

  const clearSelection = () => setSelectedLeadIds(new Set())

  const assignSelected = async () => {
    if (!assignTarget || selectedLeadIds.size === 0) return
    try {
      await axios.post(`${API}/lists/${assignTarget}/assign`, {
        leadIds: [...selectedLeadIds],
      })
      setAssignTarget('')
      if (openList) await fetchListLeads(openList._id, listLeads.page)
      await fetchLists()
    } catch (err) {
      alert(
        'Failed to assign leads: ' + (err.response?.data?.error || err.message),
      )
    }
  }

  const importCsv = (file) => {
    if (!file || !openList) return
    setImportBusy(true)
    setImportSummary(null)
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const { data } = await axios.post(
          `${API}/lists/${openList._id}/import-csv`,
          { csv: reader.result },
        )
        setImportSummary({
          inserted: data.inserted,
          updated: data.updated,
          skipped: data.skipped,
          duplicatesInFile: data.duplicatesInFile,
        })
        await fetchListLeads(openList._id)
        await fetchLists()
      } catch (err) {
        alert(
          'CSV import failed: ' + (err.response?.data?.error || err.message),
        )
      } finally {
        setImportBusy(false)
      }
    }
    reader.onerror = () => {
      alert('Could not read file')
      setImportBusy(false)
    }
    reader.readAsText(file)
  }

  const importSheet = async () => {
    if (!openList) return
    setImportBusy(true)
    setImportSummary(null)
    try {
      const { data } = await axios.post(
        `${API}/lists/${openList._id}/import-sheet`,
        {
          sheetId: sheetImport.sheetId.trim() || undefined,
          tab: sheetImport.tab.trim() || undefined,
        },
      )
      setImportSummary({
        inserted: data.inserted,
        updated: data.updated,
        skipped: data.skipped,
        duplicatesInFile: data.duplicatesInFile,
      })
      await fetchListLeads(openList._id)
      await fetchLists()
    } catch (err) {
      alert(
        'Sheet import failed: ' + (err.response?.data?.error || err.message),
      )
    } finally {
      setImportBusy(false)
    }
  }

  // Fetch real business leads from Google Maps via Apify. Long-running (the
  // actor crawls Maps + each site), so importBusy gates the whole panel.
  const importMaps = async () => {
    if (!openList) return
    const query = mapsImport.query.trim()
    if (!query) {
      alert('Enter a search query, e.g. "restaurants in Riyadh"')
      return
    }
    setImportBusy(true)
    setMapsBusy(true)
    setImportSummary(null)
    try {
      const { data } = await axios.post(
        `${API}/lists/${openList._id}/import-maps`,
        {
          query,
          maxResults: mapsImport.maxResults,
          skipRoleBased: mapsImport.skipRoleBased,
        },
      )
      setImportSummary({
        inserted: data.inserted,
        updated: data.updated,
        skipped: data.skipped,
        duplicatesInFile: data.duplicatesInFile,
        foundPlaces: data.foundPlaces,
        withEmail: data.withEmail,
        roleBasedSkipped: data.roleBasedSkipped,
      })
      await fetchListLeads(openList._id)
      await fetchLists()
    } catch (err) {
      alert(
        'Google Maps import failed: ' +
          (err.response?.data?.error || err.message),
      )
    } finally {
      setImportBusy(false)
      setMapsBusy(false)
    }
  }

  // Open the editable email modal for a lead — loads what will actually send.
  const openLeadEmail = async (lead) => {
    setEmailModal({ leadId: lead._id, email: lead.email, loading: true })
    try {
      const { data } = await axios.post(`${API}/leads/${lead._id}/preview`)
      setEmailModal({
        leadId: lead._id,
        email: lead.email,
        subject: data.subject,
        body: data.body,
        overridden: !!data.overridden,
        loading: false,
        saving: false,
      })
    } catch (err) {
      setEmailModal({
        leadId: lead._id,
        email: lead.email,
        subject: 'Error',
        body: err.response?.data?.error || err.message,
        overridden: false,
        loading: false,
        saving: false,
      })
    }
  }

  // Save the edited email as a per-lead full body override.
  const saveLeadEmail = async () => {
    if (!emailModal) return
    setEmailModal((m) => ({ ...m, saving: true }))
    try {
      await axios.put(`${API}/leads/${emailModal.leadId}/email`, {
        subject: emailModal.subject,
        body: emailModal.body,
      })
      setEmailModal(null)
      if (openList) await fetchListLeads(openList._id, listLeads.page)
    } catch (err) {
      alert(
        'Failed to save email: ' + (err.response?.data?.error || err.message),
      )
      setEmailModal((m) => ({ ...m, saving: false }))
    }
  }

  // Revert to the template + AI intro, then refresh the modal from a fresh preview.
  const revertLeadEmail = async () => {
    if (!emailModal) return
    const leadId = emailModal.leadId
    const email = emailModal.email
    setEmailModal((m) => ({ ...m, saving: true }))
    try {
      await axios.delete(`${API}/leads/${leadId}/email`)
      await openLeadEmail({ _id: leadId, email })
      if (openList) await fetchListLeads(openList._id, listLeads.page)
    } catch (err) {
      alert(
        'Failed to revert email: ' + (err.response?.data?.error || err.message),
      )
      setEmailModal((m) => ({ ...m, saving: false }))
    }
  }

  // Regenerate this lead's AI intro, then refresh the modal from a fresh preview.
  const regenerateLeadIntro = async () => {
    if (!emailModal) return
    const leadId = emailModal.leadId
    const email = emailModal.email
    setEmailModal((m) => ({ ...m, saving: true }))
    try {
      await axios.post(`${API}/leads/${leadId}/regenerate`)
      await openLeadEmail({ _id: leadId, email })
    } catch (err) {
      alert(
        'Failed to regenerate intro: ' +
          (err.response?.data?.error || err.message),
      )
      setEmailModal((m) => ({ ...m, saving: false }))
    }
  }

  // Regenerate the AI intro for every lead in the open list.
  // Regenerate AI intros for the whole list, or just the checkbox selection
  // when `onlySelected` is true (bulk action).
  const regenerateListIntros = async (onlySelected = false) => {
    if (!openList) return
    const count = onlySelected ? selectedLeadIds.size : null
    if (onlySelected && !count) return
    if (
      !window.confirm(
        onlySelected
          ? `Regenerate AI intros for the ${count} selected lead(s)? This calls the AI once per lead.`
          : 'Regenerate AI intros for every lead in this list? This calls the AI once per lead.',
      )
    )
      return
    setRegenBusy(true)
    try {
      const { data } = await axios.post(
        `${API}/lists/${openList._id}/regenerate`,
        onlySelected ? { leadIds: [...selectedLeadIds] } : {},
      )
      alert(`Regenerated ${data.regenerated} intros (${data.failed} failed)`)
      await fetchListLeads(openList._id, listLeads.page)
    } catch (err) {
      alert(
        'Failed to regenerate intros: ' +
          (err.response?.data?.error || err.message),
      )
    } finally {
      setRegenBusy(false)
    }
  }

  // Delete a single lead (and its queued emails) after confirmation.
  const deleteLead = async (lead) => {
    if (
      !window.confirm(
        `Delete lead ${lead.email}? This removes the lead and any queued emails for them. This cannot be undone.`,
      )
    )
      return
    try {
      await axios.delete(`${API}/leads/${lead._id}`)
      setSelectedLeadIds((prev) => {
        const next = new Set(prev)
        next.delete(lead._id)
        return next
      })
      await Promise.all([
        fetchListLeads(openList._id, listLeads.page),
        fetchLists(),
      ])
    } catch (err) {
      alert(
        'Failed to delete lead: ' + (err.response?.data?.error || err.message),
      )
    }
  }

  // Reset a lead to 'new' so a campaign re-queues it.
  const resendLead = async (lead) => {
    if (
      !window.confirm(
        `Resend to ${lead.email}? This marks the lead new so a campaign will email them again.`,
      )
    )
      return
    try {
      await axios.post(`${API}/leads/${lead._id}/resend`)
      if (openList) await fetchListLeads(openList._id, listLeads.page)
    } catch (err) {
      alert('Failed to resend: ' + (err.response?.data?.error || err.message))
    }
  }

  const markListLead = async (leadId, action) => {
    await markLead(leadId, action)
    if (openList) await fetchListLeads(openList._id, listLeads.page)
  }

  // ── Logs viewer (SendLog) ──
  const fetchLogs = async (
    category = logsCategory,
    page = 1,
    since = logsSince,
  ) => {
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50' })
      if (category) params.set('category', category)
      if (since) params.set('since', new Date(since).toISOString())
      const { data } = await axios.get(`${API}/logs?${params.toString()}`)
      setLogs({
        items: data.items || [],
        total: data.total || 0,
        page: data.page || 1,
        pages: data.pages || 1,
      })
    } catch (e) {}
  }

  // ── Dashboard analytics + live queue (T-012) ──
  const fetchAnalytics = async () => {
    try {
      const { data } = await axios.get(`${API}/analytics`)
      setAnalytics(data.analytics || null)
    } catch (e) {}
  }

  const fetchQueue = async (
    status = queueStatus,
    page = queuePage,
    sort = queueSort,
  ) => {
    try {
      const { data } = await axios.get(
        `${API}/queue?status=${status}&page=${page}&limit=25&sort=${sort.field}&dir=${sort.dir}`,
      )
      setQueue({
        items: data.items || [],
        total: data.total || 0,
        page: data.page || 1,
        pages: data.pages || 1,
      })
    } catch (e) {}
  }

  // Toggle sort on a Live Queue column: same field flips direction, a new field
  // starts descending. Resets to page 1 and refetches (sort is server-side).
  const sortQueue = (field) => {
    const next =
      queueSort.field === field
        ? { field, dir: queueSort.dir === 'asc' ? 'desc' : 'asc' }
        : { field, dir: 'desc' }
    setQueueSort(next)
    setQueuePage(1)
    fetchQueue(queueStatus, 1, next)
  }

  const fetchReplies = async (page = 1, mailboxId = replyMailbox) => {
    setRepliesBusy(true)
    try {
      const url =
        `${API}/replies?page=${page}&limit=25` +
        (mailboxId ? `&mailboxId=${mailboxId}` : '')
      const { data } = await axios.get(url)
      setReplies({
        items: data.items || [],
        total: data.total || 0,
        page: data.page || 1,
        pages: data.pages || 1,
      })
    } catch (e) {
    } finally {
      setRepliesBusy(false)
    }
  }

  // Change the inbox filter and refetch from page 1.
  const filterRepliesByMailbox = (mailboxId) => {
    setReplyMailbox(mailboxId)
    fetchReplies(1, mailboxId)
  }

  const fetchQueueActivity = async () => {
    try {
      const { data } = await axios.get(`${API}/queue/activity`)
      setQueueActivity({
        sending: data.sending || [],
        next: data.next || [],
        sent: data.sent || [],
      })
    } catch (e) {}
  }

  const fetchDashboardAll = async () => {
    await Promise.all([fetchAnalytics(), fetchQueue(), fetchQueueActivity()])
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

  // Re-queue a failed email from the Live Queue so the worker retries it.
  const resendQueueItem = async (id) => {
    if (!id) return
    if (!window.confirm('Re-queue this failed email so it sends again?')) return
    try {
      await axios.post(`${API}/queue/${id}/resend`)
      await Promise.all([
        fetchQueue(queueStatus, queuePage),
        fetchQueueActivity(),
      ])
    } catch (err) {
      alert(
        'Failed to resend: ' + (err.response?.data?.error || err.message),
      )
    }
  }

  // Route-driven data loading + tab sync. Runs on login and on every URL change,
  // so a direct visit/refresh to any route loads that section's data (the old
  // per-nav-click fetches are now keyed off the pathname instead). `tab` stays
  // in sync for the effects that still read it (e.g. the dashboard poll below).
  // The first path segment is the section; nested routes (e.g. /campaigns/new)
  // resolve to their parent section so the parent's data is loaded for the form.
  useEffect(() => {
    if (!authed) return
    const seg = location.pathname.split('/')[1] || 'dashboard'
    setTab(seg)
    switch (seg) {
      case 'dashboard':
        fetchDashboardAll()
        break
      case 'leads':
        fetchLists()
        break
      case 'campaigns':
        fetchCampaignsAll()
        break
      case 'templates':
        fetchTemplates()
        break
      case 'upwork':
        fetchUpworkAll()
        break
      case 'settings':
        fetchOutreachSettings()
        break
      case 'logs':
        fetchLogs()
        break
      case 'replies':
        fetchReplies()
        break
      default:
        break
    }
  }, [authed, location.pathname])

  // Keep the dashboard live — refresh the queue activity + mailbox health every
  // 15s while it's open, so "sending / next / sent" reflects reality.
  useEffect(() => {
    if (!authed || tab !== 'dashboard') return
    const id = setInterval(() => {
      fetchQueueActivity()
      fetchAnalytics()
    }, 15000)
    return () => clearInterval(id)
  }, [authed, tab])

  // ── Mailboxes (add / edit / test / pause / warm-up) ──
  const BLANK_MAILBOX = {
    name: '',
    email: '',
    signature: '',
    provider: 'smtp',
    apiKey: '',
    imapEnabled: false,
    imapHost: 'mail.privateemail.com',
    imapPort: 993,
    imapUser: '',
    imapPassword: '',
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
      signature: mb.signature || '',
      provider: mb.provider || 'smtp',
      apiKey: '', // never prefilled — blank means "keep existing"
      imapEnabled: !!mb.imapEnabled,
      imapHost: mb.imapHost || 'mail.privateemail.com',
      imapPort: mb.imapPort || 993,
      imapUser: mb.imapUser || '',
      imapPassword: '', // never prefilled — blank means "keep existing"
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
      const isBrevo = mailboxForm.provider === 'brevo'
      const payload = {
        name: mailboxForm.name,
        email: mailboxForm.email,
        signature: mailboxForm.signature || '',
        provider: mailboxForm.provider || 'smtp',
        imapEnabled: !!mailboxForm.imapEnabled,
        imapHost: mailboxForm.imapHost,
        imapPort: Number(mailboxForm.imapPort) || 993,
        imapUser: mailboxForm.imapUser,
        dailyLimit: Number(mailboxForm.dailyLimit),
        hourlyLimit: Number(mailboxForm.hourlyLimit),
        warmupEnabled: !!mailboxForm.warmupEnabled,
        warmupStartDate: mailboxForm.warmupEnabled
          ? mailboxForm.warmupStartDate
          : null,
      }
      // SMTP providers need host/port/username/password; Brevo (HTTP API) needs
      // only an API key (optional — server falls back to its env key).
      if (isBrevo) {
        if (mailboxForm.apiKey) payload.apiKey = mailboxForm.apiKey
      } else {
        payload.host = mailboxForm.host
        payload.port = Number(mailboxForm.port)
        payload.secure = !!mailboxForm.secure
        payload.username = mailboxForm.username
        // Only send a password when the user actually typed one — on edit, a
        // blank field means "keep the existing password" (never overwrite with '').
        if (mailboxForm.password) payload.password = mailboxForm.password
      }
      // IMAP reply-detection password — only when typed (blank = keep existing).
      if (mailboxForm.imapPassword)
        payload.imapPassword = mailboxForm.imapPassword

      if (mailboxForm._id) {
        await axios.put(`${API}/mailboxes/${mailboxForm._id}`, payload)
      } else {
        await axios.post(`${API}/mailboxes`, payload)
      }
      closeMailboxForm()
      await Promise.all([fetchMailboxes(), fetchDashboardAll()])
    } catch (err) {
      alert(
        'Failed to save mailbox: ' + (err.response?.data?.error || err.message),
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
        'Failed to test mailbox: ' + (err.response?.data?.error || err.message),
      )
    } finally {
      setMailboxBusy(false)
    }
  }

  // Test a mailbox's IMAP (reply-detection) login. Uses the form's typed values
  // when editing an unsaved change; otherwise the saved mailbox. Alerts result.
  const testMailboxImap = async (id) => {
    setMailboxBusy(true)
    try {
      const { data } = await axios.post(`${API}/mailboxes/${id}/imap-test`)
      alert(
        `IMAP OK — connected and read the inbox (${data.messages} message(s)).`,
      )
      await fetchMailboxes()
    } catch (err) {
      alert(
        'IMAP test failed: ' + (err.response?.data?.error || err.message),
      )
    } finally {
      setMailboxBusy(false)
    }
  }

  const toggleMailboxPause = async (mb) => {
    setMailboxBusy(true)
    // Treat both 'paused' AND 'error' as "needs reactivation" — /resume clears
    // either. Otherwise an errored mailbox has no way back from the UI.
    const needsReactivate =
      mb.healthStatus === 'paused' || mb.healthStatus === 'error'
    try {
      const action = needsReactivate ? 'resume' : 'pause'
      // Manual pause defaults to 24h (vs. the short rate-limit backoff the
      // worker itself uses) so it doesn't silently resume mid-review.
      const body = needsReactivate
        ? {}
        : { minutes: 1440, reason: 'manual pause' }
      await axios.post(`${API}/mailboxes/${mb._id}/${action}`, body)
      await Promise.all([fetchMailboxes(), fetchDashboardAll()])
    } catch (err) {
      alert(
        `Failed to ${needsReactivate ? 'reactivate' : 'pause'} mailbox: ` +
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
      active: t.active !== false,
    })

  const closeTemplateForm = () => setTemplateForm(null)

  const saveTemplate = async (e) => {
    e.preventDefault()
    // Explicit guard so save failures always surface a message (not just the
    // browser's native required-field bubble, which is easy to miss).
    if (
      !templateForm.name.trim() ||
      !templateForm.subject.trim() ||
      !templateForm.body.trim()
    ) {
      alert('Name, Subject and Body are all required.')
      return
    }
    setTemplateBusy(true)
    try {
      const payload = {
        name: templateForm.name,
        subject: templateForm.subject,
        body: templateForm.body,
        // Signatures are per-mailbox now (T-034) — the template signature is
        // deprecated, so any save clears it. The send path still falls back to
        // an existing template signature if a mailbox has none.
        signature: '',
        active: templateForm.active,
      }
      if (templateForm._id) {
        await axios.put(`${API}/templates/${templateForm._id}`, payload)
      } else {
        await axios.post(`${API}/templates`, payload)
      }
      closeTemplateForm()
      await fetchTemplates()
      return true
    } catch (err) {
      alert(
        'Failed to save template: ' +
          (err.response?.data?.error || err.message),
      )
      return false
    } finally {
      setTemplateBusy(false)
    }
  }

  const deleteTemplate = async (t) => {
    if (!window.confirm(`Delete template "${t.name}"? This cannot be undone.`))
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

  // Open the template test modal: pick a (tester) list to send the real template
  // email to, plus the history of past test runs for this template.
  const openTemplateTest = async (t) => {
    setTemplateTest({
      templateId: t._id,
      templateName: t.name,
      listId: '',
      mailboxId: '', // '' = default (first active); pick one to test its placement
      sending: false,
      result: null,
      history: [],
    })
    if (!lists.length) fetchLists()
    if (!mailboxes.length) fetchMailboxes()
    loadTemplateTestHistory(t._id)
  }

  const loadTemplateTestHistory = async (templateId) => {
    try {
      const { data } = await axios.get(
        `${API}/templates/${templateId}/tests?limit=50`,
      )
      setTemplateTest((s) =>
        s && s.templateId === templateId
          ? { ...s, history: data.items || [] }
          : s,
      )
    } catch (e) {}
  }

  const sendTemplateTest = async () => {
    if (!templateTest || !templateTest.listId) return
    const list = lists.find((l) => l._id === templateTest.listId)
    const count =
      templateTest.listId === 'unassigned'
        ? '(unassigned)'
        : (list && list.leadCount) || '?'
    const mb = mailboxes.find((m) => m._id === templateTest.mailboxId)
    const fromLabel = mb ? mb.email : 'the default mailbox'
    if (
      !window.confirm(
        `Send the REAL template email to all ${count} lead(s) in "${
          list ? list.name : 'Unassigned'
        }" from ${fromLabel}? These are actual sends (use your tester list).`,
      )
    )
      return
    setTemplateTest((s) => ({ ...s, sending: true, result: null }))
    try {
      const { data } = await axios.post(
        `${API}/templates/${templateTest.templateId}/test`,
        {
          listId: templateTest.listId,
          mailboxId: templateTest.mailboxId || undefined,
        },
      )
      setTemplateTest((s) => ({
        ...s,
        sending: false,
        result: `Test complete — ${data.sent} sent, ${data.failed} failed (of ${data.total}).`,
      }))
      loadTemplateTestHistory(templateTest.templateId)
    } catch (err) {
      setTemplateTest((s) => ({
        ...s,
        sending: false,
        result: 'Failed: ' + (err.response?.data?.error || err.message),
      }))
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
    await Promise.all([
      fetchCampaigns(),
      fetchTemplates(),
      fetchMailboxes(),
      fetchLists(),
    ])
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
          timezone: newCampaign.timezone,
        },
      }
      if (newCampaign.listId) payload.listId = newCampaign.listId
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
      if (editingCampaignId) {
        await axios.put(`${API}/campaigns/${editingCampaignId}`, payload)
      } else {
        await axios.post(`${API}/campaigns`, payload)
      }
      setNewCampaign(BLANK_CAMPAIGN)
      setEditingCampaignId(null)
      await fetchCampaigns()
      return true
    } catch (err) {
      alert(
        `Failed to ${editingCampaignId ? 'save' : 'create'} campaign: ` +
          (err.response?.data?.error || err.message),
      )
      return false
    } finally {
      setCampaignBusy(false)
    }
  }

  // Load a draft campaign into the New Campaign form for editing (PUT is draft-only).
  const openEditCampaign = (c) => {
    const steps = Array.isArray(c.steps) ? c.steps : []
    setEditingCampaignId(c._id)
    setNewCampaign({
      name: c.name || '',
      templateId: c.templateId
        ? String(c.templateId)
        : steps[0]
          ? String(steps[0].templateId)
          : '',
      listId: c.listId ? String(c.listId) : '',
      steps: steps.slice(1).map((s) => ({
        templateId: String(s.templateId),
        delayDays: s.delayDays,
      })),
      aiPrompt: c.aiPrompt || '',
      mailboxIds: (c.mailboxIds || []).map(String),
      dailyLimit: c.dailyLimit ?? 20,
      warmupEnabled: c.warmupEnabled !== false,
      days: (c.schedule && c.schedule.days) || [
        'mon',
        'tue',
        'wed',
        'thu',
        'fri',
      ],
      startTime: (c.schedule && c.schedule.startTime) || '09:00',
      endTime: (c.schedule && c.schedule.endTime) || '17:00',
      // Older campaigns have no saved timezone — fall back to the browser's so
      // the (now timezone-aware) window still matches the user's local hours.
      timezone:
        (c.schedule && c.schedule.timezone) ||
        (typeof Intl !== 'undefined' &&
          Intl.DateTimeFormat().resolvedOptions().timeZone) ||
        'UTC',
    })
  }

  const cancelEditCampaign = () => {
    setEditingCampaignId(null)
    setNewCampaign(BLANK_CAMPAIGN)
  }

  const deleteCampaign = async (c) => {
    if (
      !window.confirm(
        `Delete campaign "${c.name}"? This removes it and its queued emails. This cannot be undone.`,
      )
    )
      return
    if (campaignActionLock.current.has(c._id)) return
    campaignActionLock.current.add(c._id)
    setCampaignActionId(c._id)
    try {
      await axios.delete(`${API}/campaigns/${c._id}`)
      if (editingCampaignId === c._id) cancelEditCampaign()
      await fetchCampaigns()
    } catch (err) {
      alert(
        'Failed to delete campaign: ' +
          (err.response?.data?.error || err.message),
      )
    } finally {
      campaignActionLock.current.delete(c._id)
      setCampaignActionId(null)
    }
  }

  // Open the per-campaign View modal: its queue items + its logs, side by side.
  const openCampaignView = async (c) => {
    setCampaignView({ campaign: c, loading: true, queue: [], logs: [] })
    try {
      const [q, l] = await Promise.all([
        axios.get(`${API}/queue?campaignId=${c._id}&limit=50`),
        axios.get(`${API}/logs?campaignId=${c._id}&limit=50`),
      ])
      setCampaignView((s) =>
        s && s.campaign._id === c._id
          ? {
              ...s,
              loading: false,
              queue: q.data.items || [],
              logs: l.data.items || [],
            }
          : s,
      )
    } catch (err) {
      setCampaignView((s) =>
        s && s.campaign._id === c._id ? { ...s, loading: false } : s,
      )
      alert(
        'Failed to load campaign activity: ' +
          (err.response?.data?.error || err.message),
      )
    }
  }

  const campaignAction = async (id, action) => {
    // Hard synchronous guard against a double-click: the ref updates immediately
    // (unlike setState), so a second click in the same tick is dropped before it
    // can fire a second request. The server also atomically claims draft→running,
    // so a concurrent start can never enqueue twice.
    if (campaignActionLock.current.has(id)) return
    campaignActionLock.current.add(id)
    setCampaignActionId(id)
    try {
      const { data } = await axios.post(`${API}/campaigns/${id}/${action}`)
      if (action === 'start') {
        if (data.enqueued > 0) {
          alert(
            `Campaign started — ${data.enqueued} email(s) queued.` +
              (data.skipped > 0
                ? ` ${data.skipped} lead(s) skipped (invalid email — see server logs).`
                : '') +
              ' Sending runs in the background; watch the Live Queue.',
          )
        } else {
          // Nothing to send — explain why (this is the common "0 queued" case).
          alert(
            `Campaign started, but 0 emails were queued — no eligible leads found.` +
              (data.skipped > 0
                ? ` ${data.skipped} lead(s) were skipped for invalid emails.`
                : '') +
              `\n\nOnly leads with status "new" are sent (already-contacted or in-progress leads are skipped so no one is emailed twice). Add new leads to the target list, or re-open a list's leads and check their status.`,
          )
        }
      }
      await fetchCampaigns()
    } catch (err) {
      alert(
        `Failed to ${action} campaign: ` +
          (err.response?.data?.error || err.message),
      )
    } finally {
      campaignActionLock.current.delete(id)
      setCampaignActionId(null)
    }
  }

  // Clone a campaign's config into a new draft campaign aimed at another list.
  // Non-destructive — the source campaign is untouched. Returns nothing; on
  // success the new draft appears in the list and we jump the user to it.
  const duplicateCampaignToList = async (campaign, listId) => {
    if (!listId || campaignActionLock.current.has(campaign._id)) return
    campaignActionLock.current.add(campaign._id)
    setCampaignActionId(campaign._id)
    try {
      const { data } = await axios.post(
        `${API}/campaigns/${campaign._id}/duplicate`,
        { listId },
      )
      await fetchCampaigns()
      const listName =
        lists.find((l) => l._id === listId)?.name || 'the selected list'
      alert(
        `Created "${data.campaign.name}" as a draft targeting ${listName}. ` +
          'Review it and press Start when ready.',
      )
    } catch (err) {
      alert(
        'Failed to copy campaign: ' +
          (err.response?.data?.error || err.message),
      )
    } finally {
      campaignActionLock.current.delete(campaign._id)
      setCampaignActionId(null)
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
    navigate('/preview')
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

  // ── Outreach V2 settings helpers ──
  const fetchOutreachSettings = async () => {
    try {
      const { data } = await axios.get(`${API}/outreach-settings`)
      setOutreachSettings(data.settings)
      setOutreachDraft(data.settings)
    } catch (e) {}
  }

  const saveOutreachSettings = async () => {
    if (!outreachDraft) return
    setOutreachSaving(true)
    try {
      const { data } = await axios.put(
        `${API}/outreach-settings`,
        outreachDraft,
      )
      setOutreachSettings(data.settings)
      setOutreachDraft(data.settings)
      setOutreachSaved(true)
      setTimeout(() => setOutreachSaved(false), 2000)
    } catch (e) {
      alert(
        'Failed to save settings: ' + (e.response?.data?.error || e.message),
      )
    } finally {
      setOutreachSaving(false)
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

  return (
    <AppContext.Provider
      value={{
        leads,
        setLeads,
        lists,
        setLists,
        openList,
        setOpenList,
        listLeads,
        setListLeads,
        selectedLeadIds,
        setSelectedLeadIds,
        leadSearch,
        setLeadSearch,
        leadStatusFilter,
        setLeadStatusFilter,
        addLeadOpen,
        setAddLeadOpen,
        addLeadBusy,
        setAddLeadBusy,
        emptyLead,
        addLeadForm,
        setAddLeadForm,
        regenBusy,
        setRegenBusy,
        newListForm,
        setNewListForm,
        assignTarget,
        setAssignTarget,
        importBusy,
        setImportBusy,
        importSummary,
        setImportSummary,
        sheetImport,
        setSheetImport,
        mapsImport,
        setMapsImport,
        mapsBusy,
        emailModal,
        setEmailModal,
        logs,
        setLogs,
        logsCategory,
        setLogsCategory,
        logsSince,
        setLogsSince,
        campaigns,
        setCampaigns,
        templates,
        setTemplates,
        mailboxes,
        setMailboxes,
        newCampaign,
        setNewCampaign,
        campaignBusy,
        setCampaignBusy,
        editingCampaignId,
        setEditingCampaignId,
        campaignActionId,
        setCampaignActionId,
        campaignActionLock,
        previewLead,
        setPreviewLead,
        preview,
        setPreview,
        previewLoading,
        setPreviewLoading,
        tab,
        setTab,
        navOpen,
        setNavOpen,
        smtpStatus,
        setSmtpStatus,
        bulkGenerating,
        setBulkGenerating,
        bulkProgress,
        setBulkProgress,
        upworkSettings,
        setUpworkSettings,
        upworkStats,
        setUpworkStats,
        upworkJobs,
        setUpworkJobs,
        upworkJobsLoading,
        setUpworkJobsLoading,
        upworkSettingsSaving,
        setUpworkSettingsSaving,
        upworkSettingsSaved,
        setUpworkSettingsSaved,
        rowBusy,
        setRowBusy,
        coverModal,
        setCoverModal,
        draftSettings,
        setDraftSettings,
        outreachSettings,
        setOutreachSettings,
        outreachDraft,
        setOutreachDraft,
        outreachSaving,
        setOutreachSaving,
        outreachSaved,
        setOutreachSaved,
        upworkTestLoading,
        setUpworkTestLoading,
        upworkTestResults,
        setUpworkTestResults,
        authed,
        setAuthed,
        analytics,
        setAnalytics,
        queueActivity,
        setQueueActivity,
        queue,
        setQueue,
        queueStatus,
        setQueueStatus,
        queuePage,
        setQueuePage,
        queueSort,
        sortQueue,
        replies,
        fetchReplies,
        repliesBusy,
        replyMailbox,
        filterRepliesByMailbox,
        testMailboxImap,
        mailboxForm,
        setMailboxForm,
        mailboxBusy,
        setMailboxBusy,
        mailboxTestResult,
        setMailboxTestResult,
        templateForm,
        setTemplateForm,
        templateBusy,
        setTemplateBusy,
        templateTest,
        setTemplateTest,
        campaignView,
        setCampaignView,
        logout,
        fetchLeads,
        fetchLists,
        fetchListLeads,
        openListView,
        submitLeadSearch,
        changeStatusFilter,
        addLead,
        closeListView,
        createList,
        deleteList,
        toggleLeadSelected,
        pageLeadIds,
        allPageSelected,
        toggleSelectPage,
        selectAllInList,
        clearSelection,
        assignSelected,
        importCsv,
        importSheet,
        importMaps,
        openLeadEmail,
        saveLeadEmail,
        revertLeadEmail,
        regenerateLeadIntro,
        regenerateListIntros,
        deleteLead,
        resendLead,
        markListLead,
        fetchLogs,
        fetchAnalytics,
        fetchQueue,
        fetchQueueActivity,
        fetchDashboardAll,
        markLead,
        resendQueueItem,
        BLANK_MAILBOX,
        BLANK_TEMPLATE,
        openNewMailboxForm,
        openEditMailboxForm,
        closeMailboxForm,
        saveMailbox,
        testMailbox,
        toggleMailboxPause,
        openNewTemplateForm,
        openEditTemplateForm,
        closeTemplateForm,
        saveTemplate,
        deleteTemplate,
        openTemplateTest,
        loadTemplateTestHistory,
        sendTemplateTest,
        fetchCampaigns,
        fetchTemplates,
        fetchMailboxes,
        fetchCampaignsAll,
        createCampaign,
        openEditCampaign,
        cancelEditCampaign,
        deleteCampaign,
        openCampaignView,
        campaignAction,
        duplicateCampaignToList,
        toggleCampaignDay,
        toggleCampaignMailbox,
        addFollowup,
        updateFollowup,
        removeFollowup,
        testSmtp,
        openPreview,
        sendEmail,
        bulkGenerate,
        fetchUpworkSettings,
        fetchUpworkStats,
        fetchUpworkJobs,
        fetchUpworkAll,
        saveUpworkSettings,
        fetchOutreachSettings,
        saveOutreachSettings,
        generateCover,
        testUpworkQuery,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}
