import React, { useCallback, useEffect, useState } from 'react'
import axios, { API } from '../../api'

const EMPTY_MEMBER = { name: '', phone: '', registrationId: '', notes: '', isActive: true }

// A single clickable task tag. Pending = colored; done = grey + ✓ + strikethrough;
// skipped = dashed. Click toggles pending↔done; Shift+click marks skipped.
function Tag({ tag, onToggle, onSkip, busy }) {
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '2px 9px',
    margin: '2px',
    borderRadius: 999,
    fontSize: 12,
    cursor: busy ? 'wait' : 'pointer',
    border: '1px solid transparent',
    userSelect: 'none',
  }
  let style
  if (tag.status === 'done') {
    style = { ...base, background: 'rgba(148,163,184,0.15)', color: 'var(--muted)', textDecoration: 'line-through', borderColor: 'rgba(148,163,184,0.3)' }
  } else if (tag.status === 'skipped') {
    style = { ...base, background: 'transparent', color: 'var(--muted)', borderStyle: 'dashed', borderColor: 'rgba(148,163,184,0.5)' }
  } else {
    const c = tag.tagColor || '#60a5fa'
    style = { ...base, background: c + '22', color: c, borderColor: c + '66' }
  }
  return (
    <span
      style={style}
      title={
        tag.status === 'pending'
          ? 'Click to mark done · Shift+click to skip'
          : 'Click to undo'
      }
      onClick={(e) => (e.shiftKey && tag.status === 'pending' ? onSkip(tag) : onToggle(tag))}
    >
      {tag.status === 'done' ? '✓ ' : tag.status === 'skipped' ? '⊘ ' : ''}
      {tag.title}
    </span>
  )
}

export default function MembersView() {
  const [board, setBoard] = useState({ members: [], summary: { totalMembers: 0, membersWithPending: 0, perTask: [] }, tasks: [] })
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ task: '', status: '', q: '' })
  const [searchDraft, setSearchDraft] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [busyTag, setBusyTag] = useState(null)
  const [memberModal, setMemberModal] = useState(null) // { id|null, form }
  const [memberBusy, setMemberBusy] = useState(false)
  const [memberErr, setMemberErr] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [importBusy, setImportBusy] = useState(false)
  const [importSummary, setImportSummary] = useState(null)
  const [bulkTask, setBulkTask] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)

  const fetchBoard = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (filters.task) params.task = filters.task
      if (filters.status) params.status = filters.status
      if (filters.q) params.q = filters.q
      const { data } = await axios.get(`${API}/followups/board`, { params })
      if (data.success) setBoard({ members: data.members, summary: data.summary, tasks: data.tasks })
    } catch (e) {
      // leave previous board
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    fetchBoard()
  }, [fetchBoard])

  const toggleSelect = (id) =>
    setSelected((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  const allSelected = board.members.length > 0 && board.members.every((m) => selected.has(m._id))
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(board.members.map((m) => m._id)))

  const act = async (assignmentId, action) => {
    setBusyTag(assignmentId)
    try {
      await axios.post(`${API}/followups/assignments/${assignmentId}/${action}`)
      await fetchBoard()
    } finally {
      setBusyTag(null)
    }
  }
  const onToggle = (tag) => act(tag.assignmentId, tag.status === 'done' ? 'undo' : 'complete')
  const onSkip = (tag) => act(tag.assignmentId, 'skip')

  // ── member form ──
  const openAdd = () => {
    setMemberErr('')
    setMemberModal({ id: null, form: { ...EMPTY_MEMBER } })
  }
  const openEdit = (m) => {
    setMemberErr('')
    setMemberModal({
      id: m._id,
      form: { name: m.name, phone: m.phone, registrationId: m.registrationId || '', notes: '', isActive: true },
    })
  }
  const saveMember = async () => {
    setMemberBusy(true)
    setMemberErr('')
    try {
      const f = memberModal.form
      if (memberModal.id) await axios.put(`${API}/followups/members/${memberModal.id}`, f)
      else await axios.post(`${API}/followups/members`, f)
      setMemberModal(null)
      await fetchBoard()
    } catch (e) {
      setMemberErr(e.response?.data?.error || 'Save failed')
    } finally {
      setMemberBusy(false)
    }
  }
  const deactivate = async (m) => {
    if (!window.confirm(`Deactivate ${m.name}? They will no longer be reminded or auto-assigned.`)) return
    await axios.delete(`${API}/followups/members/${m._id}`)
    await fetchBoard()
  }

  // ── bulk actions ──
  const selectedIds = [...selected]
  const bulkDeactivate = async () => {
    if (!selectedIds.length) return
    if (!window.confirm(`Deactivate ${selectedIds.length} member(s)?`)) return
    setBulkBusy(true)
    try {
      await axios.post(`${API}/followups/members/bulk`, { memberIds: selectedIds, action: 'deactivate' })
      setSelected(new Set())
      await fetchBoard()
    } finally {
      setBulkBusy(false)
    }
  }
  const bulkCompleteTask = async () => {
    if (!selectedIds.length || !bulkTask) return
    // gather the chosen task's assignment ids for the selected members
    const ids = []
    for (const m of board.members) {
      if (!selected.has(m._id)) continue
      const tag = m.tags.find((t) => t.taskId === bulkTask && t.status !== 'done')
      if (tag) ids.push(tag.assignmentId)
    }
    if (!ids.length) {
      window.alert('No pending assignments for that task among the selected members.')
      return
    }
    setBulkBusy(true)
    try {
      await axios.post(`${API}/followups/assignments/bulk-complete`, { ids })
      setSelected(new Set())
      await fetchBoard()
    } finally {
      setBulkBusy(false)
    }
  }
  const remind = async (scope, label) => {
    setBulkBusy(true)
    try {
      const { data } = await axios.post(`${API}/followups/reminders/send`, { scope })
      const parts = []
      if (data.sent) parts.push(`${data.sent} sent`)
      if (data.queued) parts.push(`${data.queued} queued (open Reminders tab to send)`)
      if (data.failed) parts.push(`${data.failed} failed`)
      if (data.throttled) parts.push(`${data.throttled} skipped (throttled)`)
      window.alert(`${label}: ${parts.join(', ') || 'no one pending'}.`)
      setSelected(new Set())
    } catch (e) {
      window.alert('Reminder failed: ' + (e.response?.data?.error || 'error'))
    } finally {
      setBulkBusy(false)
    }
  }

  const runImport = async () => {
    setImportBusy(true)
    setImportSummary(null)
    try {
      const { data } = await axios.post(`${API}/followups/members/import`, { csv: importText })
      setImportSummary(data.summary)
      await fetchBoard()
    } catch (e) {
      setImportSummary({ error: e.response?.data?.error || 'import failed' })
    } finally {
      setImportBusy(false)
    }
  }
  const onFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setImportText(String(reader.result || ''))
    reader.readAsText(file)
  }

  const { summary } = board

  return (
    <div>
      {/* Summary bar */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div className='stat-card' style={statCard}>
          <div style={statNum}>{summary.totalMembers}</div>
          <div style={statLbl}>Members</div>
        </div>
        <div className='stat-card' style={statCard}>
          <div style={{ ...statNum, color: summary.membersWithPending ? '#f59e0b' : 'var(--success,#22c55e)' }}>
            {summary.membersWithPending}
          </div>
          <div style={statLbl}>With pending</div>
        </div>
        {summary.perTask.map((t) => (
          <div key={t.taskId} className='stat-card' style={statCard}>
            <div style={statNum}>
              {t.done}/{t.total}
            </div>
            <div style={statLbl}>{t.title}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.75rem' }}>
        <select value={filters.task} onChange={(e) => setFilters((f) => ({ ...f, task: e.target.value }))}>
          <option value=''>All tasks</option>
          {board.tasks.map((t) => (
            <option key={t._id} value={t._id}>
              {t.title}
            </option>
          ))}
        </select>
        <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
          <option value=''>Any status</option>
          <option value='pending'>Has pending</option>
          <option value='done'>All done</option>
        </select>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setFilters((f) => ({ ...f, q: searchDraft.trim() }))
          }}
          style={{ display: 'flex', gap: 4 }}
        >
          <input
            type='text'
            placeholder='Search name / phone / reg ID'
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            style={{ minWidth: 200 }}
          />
          <button className='btn-ghost' type='submit'>Search</button>
          {filters.q && (
            <button
              className='btn-ghost'
              type='button'
              onClick={() => {
                setSearchDraft('')
                setFilters((f) => ({ ...f, q: '' }))
              }}
            >
              Clear
            </button>
          )}
        </form>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className='btn-ghost' onClick={() => setImportOpen(true)}>Import CSV</button>
          <button className='btn-start' onClick={openAdd}>+ Add member</button>
        </div>
      </div>

      {/* Bulk bar */}
      {selectedIds.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.75rem', padding: '0.5rem 0.75rem', background: 'rgba(96,165,250,0.08)', borderRadius: 8 }}>
          <strong>{selectedIds.length} selected</strong>
          <button className='btn-ghost' disabled={bulkBusy} onClick={() => remind({ type: 'members', memberIds: selectedIds }, 'Remind selected')}>
            Remind
          </button>
          <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
            <select value={bulkTask} onChange={(e) => setBulkTask(e.target.value)}>
              <option value=''>Mark task done…</option>
              {board.tasks.map((t) => (
                <option key={t._id} value={t._id}>{t.title}</option>
              ))}
            </select>
            <button className='btn-ghost' disabled={bulkBusy || !bulkTask} onClick={bulkCompleteTask}>Apply</button>
          </span>
          <button className='btn-ghost' disabled={bulkBusy} onClick={bulkDeactivate}>Deactivate</button>
        </div>
      )}

      {/* Global remind */}
      <div style={{ marginBottom: '0.5rem' }}>
        <button className='btn-ghost' disabled={bulkBusy} onClick={() => remind({ type: 'all' }, 'Remind all pending')}>
          🔔 Remind all pending
        </button>
      </div>

      {loading ? (
        <div className='loading-card'><div className='spinner' /><p>Loading board…</p></div>
      ) : board.members.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>No members match. Add members or adjust filters.</p>
      ) : (
        <div className='table-wrapper'>
          <table>
            <thead>
              <tr>
                <th style={{ width: 28 }}>
                  <input type='checkbox' checked={allSelected} onChange={toggleAll} />
                </th>
                <th>Name</th>
                <th>Phone</th>
                <th>Reg ID</th>
                <th>Tasks</th>
                <th style={{ width: 120 }}></th>
              </tr>
            </thead>
            <tbody>
              {board.members.map((m) => (
                <tr key={m._id}>
                  <td>
                    <input type='checkbox' checked={selected.has(m._id)} onChange={() => toggleSelect(m._id)} />
                  </td>
                  <td>{m.name}</td>
                  <td className='td-email'>+{m.phone}</td>
                  <td>{m.registrationId || '—'}</td>
                  <td>
                    {m.tags.length === 0 ? (
                      <span style={{ color: 'var(--muted)', fontSize: 12 }}>no tasks</span>
                    ) : (
                      m.tags.map((t) => (
                        <Tag key={t.assignmentId} tag={t} busy={busyTag === t.assignmentId} onToggle={onToggle} onSkip={onSkip} />
                      ))
                    )}
                  </td>
                  <td>
                    <button className='btn-ghost' style={{ padding: '2px 8px' }} onClick={() => openEdit(m)}>Edit</button>
                    <button className='btn-ghost' style={{ padding: '2px 8px' }} onClick={() => deactivate(m)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Member modal */}
      {memberModal && (
        <div className='modal-overlay' onClick={() => setMemberModal(null)}>
          <div className='modal-card' onClick={(e) => e.stopPropagation()}>
            <button className='modal-close btn-ghost' onClick={() => setMemberModal(null)}>✕ Close</button>
            <h3 style={{ marginTop: 0 }}>{memberModal.id ? 'Edit member' : 'Add member'}</h3>
            {memberErr && <p style={{ color: 'var(--error,#ef4444)', fontSize: 13 }}>{memberErr}</p>}
            <div className='control-group'>
              <label>Name *</label>
              <input value={memberModal.form.name} onChange={(e) => setMemberModal((s) => ({ ...s, form: { ...s.form, name: e.target.value } }))} />
            </div>
            <div className='control-group'>
              <label>Phone * (any format — stored as +E.164)</label>
              <input value={memberModal.form.phone} onChange={(e) => setMemberModal((s) => ({ ...s, form: { ...s.form, phone: e.target.value } }))} placeholder='03001234567' />
            </div>
            <div className='control-group'>
              <label>Registration ID</label>
              <input value={memberModal.form.registrationId} onChange={(e) => setMemberModal((s) => ({ ...s, form: { ...s.form, registrationId: e.target.value } }))} />
            </div>
            <div className='control-group'>
              <label>Notes</label>
              <textarea rows={2} value={memberModal.form.notes} onChange={(e) => setMemberModal((s) => ({ ...s, form: { ...s.form, notes: e.target.value } }))} />
            </div>
            <button className='btn-start' disabled={memberBusy} onClick={saveMember}>
              {memberBusy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* CSV import modal */}
      {importOpen && (
        <div className='modal-overlay' onClick={() => setImportOpen(false)}>
          <div className='modal-card' style={{ maxWidth: 640, width: '95%' }} onClick={(e) => e.stopPropagation()}>
            <button className='modal-close btn-ghost' onClick={() => setImportOpen(false)}>✕ Close</button>
            <h3 style={{ marginTop: 0 }}>Import members from CSV</h3>
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>
              Columns: <code>name, phone, registration_id</code>. Duplicate phones are reported, not imported.
            </p>
            <input type='file' accept='.csv,text/csv' onChange={onFile} style={{ marginBottom: 8 }} />
            <textarea
              rows={6}
              placeholder='name,phone,registration_id&#10;Ahmed,03001234567,REG-001'
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              style={{ width: '100%' }}
            />
            <div style={{ marginTop: 8 }}>
              <button className='btn-start' disabled={importBusy || !importText.trim()} onClick={runImport}>
                {importBusy ? 'Importing…' : 'Import'}
              </button>
            </div>
            {importSummary && (
              <div style={{ marginTop: 12, fontSize: 13 }}>
                {importSummary.error ? (
                  <p style={{ color: 'var(--error,#ef4444)' }}>{importSummary.error}</p>
                ) : (
                  <>
                    <p>
                      <strong>{importSummary.inserted}</strong> imported ·{' '}
                      <strong>{importSummary.duplicates.length}</strong> duplicates ·{' '}
                      <strong>{importSummary.failed.length}</strong> failed
                    </p>
                    {importSummary.duplicates.length > 0 && (
                      <details>
                        <summary>Duplicate phones</summary>
                        <ul>
                          {importSummary.duplicates.map((d, i) => (
                            <li key={i}>row {d.row}: {d.name} — {d.phone}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                    {importSummary.failed.length > 0 && (
                      <details>
                        <summary>Failed rows</summary>
                        <ul>
                          {importSummary.failed.map((d, i) => (
                            <li key={i}>row {d.row}: {d.error}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const statCard = { padding: '0.5rem 0.9rem', background: 'rgba(148,163,184,0.08)', borderRadius: 8, minWidth: 90 }
const statNum = { fontSize: 20, fontWeight: 700 }
const statLbl = { fontSize: 12, color: 'var(--muted)' }
