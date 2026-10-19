import React, { useCallback, useEffect, useState } from 'react'
import axios, { API } from '../../api'

export default function RemindersView() {
  const [tasks, setTasks] = useState([])
  const [scope, setScope] = useState({ type: 'all', taskId: '' })
  const [force, setForce] = useState(false)
  const [preview, setPreview] = useState(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [queue, setQueue] = useState(null) // last send result { provider, items, ... }
  const [sendBusy, setSendBusy] = useState(false)
  const [markedSent, setMarkedSent] = useState(new Set())
  const [log, setLog] = useState({ items: [], total: 0 })
  const [settings, setSettings] = useState(null)
  const [timezone, setTimezone] = useState('')
  const [settingsBusy, setSettingsBusy] = useState(false)
  const [settingsMsg, setSettingsMsg] = useState('')

  const fetchTasks = useCallback(async () => {
    const { data } = await axios.get(`${API}/followups/tasks`, { params: { active: 'true' } })
    if (data.success) setTasks(data.tasks)
  }, [])
  const fetchLog = useCallback(async () => {
    const { data } = await axios.get(`${API}/followups/reminders/log`, { params: { limit: 50 } })
    if (data.success) setLog({ items: data.items, total: data.total })
  }, [])
  const fetchSettings = useCallback(async () => {
    const { data } = await axios.get(`${API}/followups/settings`)
    if (data.success) {
      setSettings(data.settings)
      setTimezone(data.timezone || '')
    }
  }, [])

  useEffect(() => {
    fetchTasks()
    fetchLog()
    fetchSettings()
  }, [fetchTasks, fetchLog, fetchSettings])

  const buildScope = () =>
    scope.type === 'task' && scope.taskId ? { type: 'task', taskId: scope.taskId } : { type: 'all' }

  const runPreview = async () => {
    setPreviewBusy(true)
    setQueue(null)
    try {
      const { data } = await axios.post(`${API}/followups/reminders/preview`, { scope: buildScope(), force })
      setPreview(data)
    } finally {
      setPreviewBusy(false)
    }
  }
  const runSend = async () => {
    setSendBusy(true)
    try {
      const { data } = await axios.post(`${API}/followups/reminders/send`, { scope: buildScope(), force })
      setQueue(data)
      setMarkedSent(new Set())
      setPreview(null)
      await fetchLog()
    } finally {
      setSendBusy(false)
    }
  }
  const markSent = async (item) => {
    await axios.post(`${API}/followups/reminders/${item.logId}/mark-sent`)
    setMarkedSent((s) => new Set(s).add(item.logId))
    await fetchLog()
  }

  const removeReminder = async (logId) => {
    if (!window.confirm('Delete this reminder entry?')) return
    await axios.delete(`${API}/followups/reminders/${logId}`)
    setQueue((q) => (q ? { ...q, items: q.items.filter((it) => it.logId !== logId) } : q))
    await fetchLog()
  }

  const saveSettings = async () => {
    setSettingsBusy(true)
    setSettingsMsg('')
    try {
      const { data } = await axios.put(`${API}/followups/settings`, settings)
      if (data.success) {
        setSettings(data.settings)
        setSettingsMsg('Saved.')
      }
    } catch (e) {
      setSettingsMsg(e.response?.data?.error || 'Save failed')
    } finally {
      setSettingsBusy(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      {/* Send panel */}
      <section>
        <h3 style={{ marginTop: 0 }}>Send reminders</h3>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 0 }}>
          Each member gets ONE message listing all their pending tasks. People with nothing pending are never messaged.
          {settings && <> Active channel: <strong>{settings.provider}</strong>.</>}
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={scope.type} onChange={(e) => setScope((s) => ({ ...s, type: e.target.value }))}>
            <option value='all'>All pending members</option>
            <option value='task'>Members pending on a task</option>
          </select>
          {scope.type === 'task' && (
            <select value={scope.taskId} onChange={(e) => setScope((s) => ({ ...s, taskId: e.target.value }))}>
              <option value=''>Select a task…</option>
              {tasks.map((t) => (
                <option key={t._id} value={t._id}>{t.title}</option>
              ))}
            </select>
          )}
          <label style={{ fontWeight: 400, fontSize: 13 }}>
            <input type='checkbox' checked={force} onChange={(e) => setForce(e.target.checked)} /> Ignore throttle
          </label>
          <button className='btn-ghost' disabled={previewBusy} onClick={runPreview}>
            {previewBusy ? 'Previewing…' : 'Preview'}
          </button>
        </div>

        {preview && (
          <div style={{ marginTop: 12, padding: '0.75rem', background: 'rgba(148,163,184,0.08)', borderRadius: 8 }}>
            <p style={{ margin: '0 0 6px' }}>
              <strong>{preview.recipientCount}</strong> recipient(s)
              {preview.throttledCount > 0 && <> · {preview.throttledCount} skipped (throttled)</>}
            </p>
            {preview.sample ? (
              <pre style={sample}>{preview.sample}</pre>
            ) : (
              <p style={{ color: 'var(--muted)', fontSize: 13 }}>No one to remind.</p>
            )}
            <button className='btn-start' disabled={sendBusy || preview.recipientCount === 0} onClick={runSend}>
              {sendBusy ? 'Sending…' : preview.provider === 'wa_link' ? `Build send queue (${preview.recipientCount})` : `Send to ${preview.recipientCount}`}
            </button>
          </div>
        )}
      </section>

      {/* wa_link send queue */}
      {queue && (
        <section>
          <h3 style={{ marginTop: 0 }}>
            {queue.provider === 'wa_link' ? 'Send queue' : 'Send result'}{' '}
            <span style={{ fontWeight: 400, fontSize: 13, color: 'var(--muted)' }}>
              ({queue.sent} sent · {queue.queued} queued · {queue.failed} failed · {queue.throttled} throttled)
            </span>
          </h3>
          {queue.provider === 'wa_link' && (
            <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 0 }}>
              Click each link (WhatsApp opens prefilled), then "Mark sent" to log it.
            </p>
          )}
          <div className='table-wrapper' style={{ maxHeight: 320, overflowY: 'auto' }}>
            <table>
              <thead><tr><th>Member</th><th>Phone</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {queue.items.map((it) => (
                  <tr key={it.logId}>
                    <td>{it.name}</td>
                    <td className='td-email'>+{it.phone}</td>
                    <td>
                      <span className={`status-badge badge-${markedSent.has(it.logId) || it.status === 'sent' ? 'sent' : it.status === 'failed' ? 'failed' : 'pending'}`}>
                        {markedSent.has(it.logId) ? 'sent' : it.status}
                      </span>
                      {it.error && <span style={{ color: 'var(--error,#ef4444)', fontSize: 12, marginLeft: 6 }}>{it.error}</span>}
                    </td>
                    <td>
                      {it.link && (
                        <a className='btn-ghost' style={{ padding: '2px 8px', textDecoration: 'none' }} href={it.link} target='_blank' rel='noreferrer'>Open</a>
                      )}
                      {it.link && !markedSent.has(it.logId) && (
                        <button className='btn-ghost' style={{ padding: '2px 8px' }} onClick={() => markSent(it)}>Mark sent</button>
                      )}
                      <button className='btn-ghost' style={{ padding: '2px 8px' }} onClick={() => removeReminder(it.logId)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Settings */}
      {settings && (
        <section>
          <h3 style={{ marginTop: 0 }}>Settings</h3>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className='control-group' style={{ minWidth: 180 }}>
              <label>Channel</label>
              <select value={settings.provider} onChange={(e) => setSettings((s) => ({ ...s, provider: e.target.value }))}>
                <option value='wa_link'>wa_link (manual click-to-send)</option>
                <option value='whatsapp_cloud'>whatsapp_cloud (Meta API)</option>
              </select>
            </div>
            <div className='control-group' style={{ minWidth: 140 }}>
              <label>Throttle (hours)</label>
              <input type='number' min='0' value={settings.throttleHours} onChange={(e) => setSettings((s) => ({ ...s, throttleHours: e.target.value }))} />
            </div>
          </div>
          <div className='control-group'>
            <label style={{ fontWeight: 400 }}>
              <input type='checkbox' checked={!!settings.autoRemindersEnabled} onChange={(e) => setSettings((s) => ({ ...s, autoRemindersEnabled: e.target.checked }))} />{' '}
              Enable scheduled auto-reminders (kill switch)
            </label>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className='control-group' style={{ minWidth: 160 }}>
              <label>Primary nudge</label>
              <input value={settings.schedulePrimary || ''} onChange={(e) => setSettings((s) => ({ ...s, schedulePrimary: e.target.value }))} placeholder='mon 10:00' />
            </div>
            <div className='control-group' style={{ minWidth: 160 }}>
              <label>Second nudge (optional)</label>
              <input value={settings.scheduleSecondary || ''} onChange={(e) => setSettings((s) => ({ ...s, scheduleSecondary: e.target.value }))} placeholder='thu 10:00' />
            </div>
          </div>
          <p style={{ color: 'var(--muted)', fontSize: 12 }}>
            Schedule is in <strong>{timezone || 'the configured timezone'}</strong>. Format: <code>day HH:MM</code> (e.g. <code>mon 10:00</code>); blank disables a nudge.
          </p>
          <button className='btn-start' disabled={settingsBusy} onClick={saveSettings}>{settingsBusy ? 'Saving…' : 'Save settings'}</button>
          {settingsMsg && <span style={{ marginLeft: 10, fontSize: 13 }}>{settingsMsg}</span>}
        </section>
      )}

      {/* Reminder history */}
      <section>
        <h3 style={{ marginTop: 0 }}>Reminder history <span style={{ fontWeight: 400, fontSize: 13, color: 'var(--muted)' }}>({log.total})</span></h3>
        {log.items.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>No reminders sent yet.</p>
        ) : (
          <div className='table-wrapper' style={{ maxHeight: 360, overflowY: 'auto' }}>
            <table>
              <thead><tr><th>Time</th><th>Member</th><th>Channel</th><th>Status</th><th>Covered</th><th></th></tr></thead>
              <tbody>
                {log.items.map((r) => (
                  <tr key={r._id}>
                    <td>{new Date(r.createdAt).toLocaleString()}</td>
                    <td>{r.member ? r.member.name : '—'}</td>
                    <td>{r.channel}</td>
                    <td><span className={`status-badge badge-${r.status === 'sent' ? 'sent' : r.status === 'failed' ? 'failed' : 'pending'}`}>{r.status}</span></td>
                    <td>{(r.assignmentIds || []).length} task(s)</td>
                    <td><button className='btn-ghost' style={{ padding: '2px 8px' }} onClick={() => removeReminder(r._id)}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

const sample = { whiteSpace: 'pre-wrap', background: 'var(--field-bg,rgba(0,0,0,0.2))', padding: 10, borderRadius: 6, fontSize: 13, margin: '0 0 10px' }
