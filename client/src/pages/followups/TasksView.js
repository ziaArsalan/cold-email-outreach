import React, { useCallback, useEffect, useState } from 'react'
import axios, { API } from '../../api'

const EMPTY_TASK = {
  title: '',
  description: '',
  recurrence: 'weekly',
  dueDate: '',
  assignTo: 'all',
  assignees: [],
  reminderTemplate: '',
  tagColor: '#60a5fa',
}

const RECURRENCE_LABEL = { one_time: 'One-time', weekly: 'Weekly', monthly: 'Monthly' }

export default function TasksView() {
  const [tasks, setTasks] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // { id|null, form }
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [detail, setDetail] = useState(null) // { task, periodKey, assignments, loading }

  const fetchTasks = useCallback(async () => {
    setLoading(true)
    try {
      const [t, m] = await Promise.all([
        axios.get(`${API}/followups/tasks`),
        axios.get(`${API}/followups/members`, { params: { active: 'true' } }),
      ])
      if (t.data.success) setTasks(t.data.tasks)
      if (m.data.success) setMembers(m.data.members)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  const openAdd = () => {
    setErr('')
    setModal({ id: null, form: { ...EMPTY_TASK } })
  }
  const openEdit = (t) => {
    setErr('')
    setModal({
      id: t._id,
      form: {
        title: t.title,
        description: t.description || '',
        recurrence: t.recurrence,
        dueDate: t.dueDate ? String(t.dueDate).slice(0, 10) : '',
        assignTo: t.assignTo,
        assignees: (t.assignees || []).map(String),
        reminderTemplate: t.reminderTemplate || '',
        tagColor: t.tagColor || '#60a5fa',
      },
    })
  }

  const save = async () => {
    setBusy(true)
    setErr('')
    try {
      const f = { ...modal.form }
      if (f.recurrence !== 'one_time') f.dueDate = undefined
      if (f.assignTo === 'all') f.assignees = []
      if (modal.id) await axios.put(`${API}/followups/tasks/${modal.id}`, f)
      else await axios.post(`${API}/followups/tasks`, f)
      setModal(null)
      await fetchTasks()
    } catch (e) {
      setErr(e.response?.data?.error || 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  const togglePause = async (t) => {
    await axios.put(`${API}/followups/tasks/${t._id}`, { isActive: !t.isActive })
    await fetchTasks()
  }
  const remove = async (t) => {
    if (!window.confirm(`Delete "${t.title}"? It's a soft delete — history is kept, reminders stop.`)) return
    await axios.delete(`${API}/followups/tasks/${t._id}`)
    await fetchTasks()
  }

  const toggleAssignee = (id) =>
    setModal((s) => {
      const has = s.form.assignees.includes(id)
      return { ...s, form: { ...s.form, assignees: has ? s.form.assignees.filter((x) => x !== id) : [...s.form.assignees, id] } }
    })

  // ── per-task period view ──
  const openDetail = async (t, periodKey) => {
    setDetail({ task: t, periodKey: periodKey || '', assignments: [], loading: true })
    try {
      const { data } = await axios.get(`${API}/followups/tasks/${t._id}/assignments`, {
        params: periodKey ? { periodKey } : {},
      })
      if (data.success) setDetail({ task: t, periodKey: data.periodKey, assignments: data.assignments, loading: false })
    } catch {
      setDetail({ task: t, periodKey: periodKey || '', assignments: [], loading: false })
    }
  }
  // naive period shift for the switcher (monthly: YYYY-MM ±1; weekly: YYYY-Www ±1 within year)
  const shiftPeriod = (key, delta) => {
    let m = /^(\d{4})-(\d{2})$/.exec(key)
    if (m) {
      let y = +m[1]
      let mo = +m[2] + delta
      while (mo < 1) { mo += 12; y-- }
      while (mo > 12) { mo -= 12; y++ }
      return `${y}-${String(mo).padStart(2, '0')}`
    }
    m = /^(\d{4})-W(\d{2})$/.exec(key)
    if (m) {
      const y = +m[1]
      const w = Math.max(1, +m[2] + delta)
      return `${y}-W${String(w).padStart(2, '0')}`
    }
    return key
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
        <button className='btn-start' onClick={openAdd}>+ New task</button>
      </div>

      {loading ? (
        <div className='loading-card'><div className='spinner' /><p>Loading tasks…</p></div>
      ) : tasks.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>No tasks yet. Create one to start tracking.</p>
      ) : (
        <div className='table-wrapper'>
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Recurrence</th>
                <th>Assigned</th>
                <th>Status</th>
                <th style={{ width: 240 }}></th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t._id} style={{ opacity: t.isActive ? 1 : 0.55 }}>
                  <td>
                    <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: t.tagColor || '#60a5fa', marginRight: 6 }} />
                    {t.title}
                  </td>
                  <td>{RECURRENCE_LABEL[t.recurrence]}</td>
                  <td>{t.assignTo === 'all' ? 'All members' : `${(t.assignees || []).length} selected`}</td>
                  <td>
                    <span className={`status-badge badge-${t.isActive ? 'sent' : 'failed'}`}>
                      {t.isActive ? 'active' : 'paused'}
                    </span>
                  </td>
                  <td>
                    <button className='btn-ghost' style={cellBtn} onClick={() => openDetail(t)}>View</button>
                    <button className='btn-ghost' style={cellBtn} onClick={() => openEdit(t)}>Edit</button>
                    <button className='btn-ghost' style={cellBtn} onClick={() => togglePause(t)}>{t.isActive ? 'Pause' : 'Resume'}</button>
                    <button className='btn-ghost' style={cellBtn} onClick={() => remove(t)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Task form modal */}
      {modal && (
        <div className='modal-overlay' onClick={() => setModal(null)}>
          <div className='modal-card' style={{ maxWidth: 560, width: '95%' }} onClick={(e) => e.stopPropagation()}>
            <button className='modal-close btn-ghost' onClick={() => setModal(null)}>✕ Close</button>
            <h3 style={{ marginTop: 0 }}>{modal.id ? 'Edit task' : 'New task'}</h3>
            {err && <p style={{ color: 'var(--error,#ef4444)', fontSize: 13 }}>{err}</p>}
            <div className='control-group'>
              <label>Title * (shows as the tag)</label>
              <input value={modal.form.title} onChange={(e) => setModal((s) => ({ ...s, form: { ...s.form, title: e.target.value } }))} />
            </div>
            <div className='control-group'>
              <label>Description</label>
              <textarea rows={2} value={modal.form.description} onChange={(e) => setModal((s) => ({ ...s, form: { ...s.form, description: e.target.value } }))} />
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <div className='control-group' style={{ flex: 1, minWidth: 140 }}>
                <label>Recurrence</label>
                <select value={modal.form.recurrence} onChange={(e) => setModal((s) => ({ ...s, form: { ...s.form, recurrence: e.target.value } }))}>
                  <option value='one_time'>One-time</option>
                  <option value='weekly'>Weekly</option>
                  <option value='monthly'>Monthly</option>
                </select>
              </div>
              {modal.form.recurrence === 'one_time' && (
                <div className='control-group' style={{ flex: 1, minWidth: 140 }}>
                  <label>Due date *</label>
                  <input type='date' value={modal.form.dueDate} onChange={(e) => setModal((s) => ({ ...s, form: { ...s.form, dueDate: e.target.value } }))} />
                </div>
              )}
              <div className='control-group' style={{ minWidth: 90 }}>
                <label>Tag color</label>
                <input type='color' value={modal.form.tagColor} onChange={(e) => setModal((s) => ({ ...s, form: { ...s.form, tagColor: e.target.value } }))} />
              </div>
            </div>
            <div className='control-group'>
              <label>Assign to</label>
              <div style={{ display: 'flex', gap: 12 }}>
                <label style={{ fontWeight: 400 }}>
                  <input type='radio' checked={modal.form.assignTo === 'all'} onChange={() => setModal((s) => ({ ...s, form: { ...s.form, assignTo: 'all' } }))} /> All members
                </label>
                <label style={{ fontWeight: 400 }}>
                  <input type='radio' checked={modal.form.assignTo === 'selected'} onChange={() => setModal((s) => ({ ...s, form: { ...s.form, assignTo: 'selected' } }))} /> Selected
                </label>
              </div>
            </div>
            {modal.form.assignTo === 'selected' && (
              <div className='control-group'>
                <label>Members ({modal.form.assignees.length} selected)</label>
                <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid rgba(148,163,184,0.25)', borderRadius: 6, padding: 6 }}>
                  {members.map((m) => (
                    <label key={m._id} style={{ display: 'block', fontWeight: 400, fontSize: 13 }}>
                      <input type='checkbox' checked={modal.form.assignees.includes(m._id)} onChange={() => toggleAssignee(m._id)} /> {m.name} (+{m.phone})
                    </label>
                  ))}
                  {members.length === 0 && <span style={{ color: 'var(--muted)', fontSize: 13 }}>No active members.</span>}
                </div>
              </div>
            )}
            <div className='control-group'>
              <label>Custom reminder (optional) — tokens: {'{{name}} {{period_label}} {{tasks}}'}</label>
              <textarea rows={3} value={modal.form.reminderTemplate} onChange={(e) => setModal((s) => ({ ...s, form: { ...s.form, reminderTemplate: e.target.value } }))} placeholder='Leave blank to use the default reminder.' />
            </div>
            <button className='btn-start' disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save task'}</button>
          </div>
        </div>
      )}

      {/* Per-task period detail */}
      {detail && (
        <div className='modal-overlay' onClick={() => setDetail(null)}>
          <div className='modal-card' style={{ maxWidth: 640, width: '95%' }} onClick={(e) => e.stopPropagation()}>
            <button className='modal-close btn-ghost' onClick={() => setDetail(null)}>✕ Close</button>
            <h3 style={{ marginTop: 0 }}>{detail.task.title}</h3>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10 }}>
              <button className='btn-ghost' style={cellBtn} onClick={() => openDetail(detail.task, shiftPeriod(detail.periodKey, -1))} disabled={detail.task.recurrence === 'one_time'}>← Prev</button>
              <strong style={{ fontFamily: 'monospace' }}>{detail.periodKey || '…'}</strong>
              <button className='btn-ghost' style={cellBtn} onClick={() => openDetail(detail.task, shiftPeriod(detail.periodKey, 1))} disabled={detail.task.recurrence === 'one_time'}>Next →</button>
              <button className='btn-ghost' style={cellBtn} onClick={() => openDetail(detail.task)}>Current</button>
            </div>
            {detail.loading ? (
              <div className='loading-card'><div className='spinner' /><p>Loading…</p></div>
            ) : detail.assignments.length === 0 ? (
              <p style={{ color: 'var(--muted)' }}>No assignments for this period.</p>
            ) : (
              <div className='table-wrapper' style={{ maxHeight: 360, overflowY: 'auto' }}>
                <table>
                  <thead><tr><th>Member</th><th>Status</th><th>Completed</th></tr></thead>
                  <tbody>
                    {detail.assignments.map((a) => (
                      <tr key={a._id}>
                        <td>{a.member ? a.member.name : '—'}</td>
                        <td><span className={`status-badge badge-${a.status === 'done' ? 'sent' : a.status === 'skipped' ? 'failed' : 'pending'}`}>{a.status}</span></td>
                        <td>{a.completedAt ? new Date(a.completedAt).toLocaleString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const cellBtn = { padding: '2px 8px' }
