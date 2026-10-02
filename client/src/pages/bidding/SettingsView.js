import React, { useEffect, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { fmtDay } from '../../utils'

export default function SettingsView() {
  const {
    lanes,
    fetchLanes,
    newLaneName,
    setNewLaneName,
    createLane,
    renameLane,
    toggleLaneArchived,
    deleteLane,
    bidTemplates,
    fetchBidTemplates,
    saveBidTemplate,
    deleteBidTemplate,
    profileVariants,
    fetchProfileVariants,
    saveProfileVariant,
    deleteProfileVariant,
  } = useApp()

  const [tpl, setTpl] = useState({ name: '', lane: '', openingText: '', fullTemplate: '', active: true })
  const [pv, setPv] = useState({ title: '', descriptionVersion: '', activeFrom: '', activeTo: '', notes: '' })

  useEffect(() => {
    if (!lanes.length) fetchLanes()
    fetchBidTemplates()
    fetchProfileVariants()
  }, [])

  const addTpl = async (e) => {
    e.preventDefault()
    if (!tpl.name.trim()) return
    const ok = await saveBidTemplate({ ...tpl, name: tpl.name.trim() })
    if (ok) setTpl({ name: '', lane: '', openingText: '', fullTemplate: '', active: true })
  }
  const addPv = async (e) => {
    e.preventDefault()
    if (!pv.title.trim()) return
    const payload = { ...pv, title: pv.title.trim() }
    if (!payload.activeFrom) delete payload.activeFrom
    if (!payload.activeTo) delete payload.activeTo
    const ok = await saveProfileVariant(payload)
    if (ok) setPv({ title: '', descriptionVersion: '', activeFrom: '', activeTo: '', notes: '' })
  }

  return (
    <div>
      {/* Lanes */}
      <div className='card'>
        <h4 style={{ marginTop: 0 }}>Service lanes</h4>
        <form onSubmit={createLane} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <input type='text' placeholder='New lane name' value={newLaneName} onChange={(e) => setNewLaneName(e.target.value)} style={{ maxWidth: 260 }} />
          <button className='btn-start' type='submit'>+ Add lane</button>
        </form>
        {lanes.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>No lanes yet.</p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {lanes.map((l) => (
              <span
                key={l._id}
                className='status-badge'
                style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center', opacity: l.archived ? 0.55 : 1, padding: '0.3rem 0.5rem' }}
              >
                {l.name}{l.archived ? ' (archived)' : ''}
                <button className='btn-ghost' style={{ padding: '0 0.3rem' }} title='Rename' onClick={() => renameLane(l)}>✎</button>
                <button className='btn-ghost' style={{ padding: '0 0.3rem' }} title={l.archived ? 'Unarchive' : 'Archive'} onClick={() => toggleLaneArchived(l)}>{l.archived ? '⤺' : '🗄'}</button>
                <button className='btn-stop' style={{ padding: '0 0.3rem' }} title='Delete' onClick={() => deleteLane(l)}>✕</button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Proposal templates */}
      <div className='card' style={{ marginTop: '1rem' }}>
        <h4 style={{ marginTop: 0 }}>Proposal templates</h4>
        <form onSubmit={addTpl} className='settings-fields-grid'>
          <div className='control-group'>
            <label>Name</label>
            <input value={tpl.name} onChange={(e) => setTpl((t) => ({ ...t, name: e.target.value }))} />
          </div>
          <div className='control-group'>
            <label>Lane</label>
            <select value={tpl.lane} onChange={(e) => setTpl((t) => ({ ...t, lane: e.target.value }))}>
              <option value=''>—</option>
              {lanes.map((l) => (
                <option key={l._id} value={l.name}>{l.name}</option>
              ))}
            </select>
          </div>
          <div className='control-group full-width'>
            <label>Opening text</label>
            <textarea rows={2} value={tpl.openingText} onChange={(e) => setTpl((t) => ({ ...t, openingText: e.target.value }))} />
          </div>
          <div className='control-group full-width'>
            <label>Full template</label>
            <textarea rows={4} value={tpl.fullTemplate} onChange={(e) => setTpl((t) => ({ ...t, fullTemplate: e.target.value }))} />
          </div>
          <div className='control-group'>
            <button className='btn-start' type='submit'>+ Add template</button>
          </div>
        </form>
        {bidTemplates.length > 0 && (
          <div className='table-wrapper' style={{ marginTop: '0.75rem' }}>
            <table>
              <thead><tr><th>Name</th><th>Lane</th><th>Active</th><th></th></tr></thead>
              <tbody>
                {bidTemplates.map((t) => (
                  <tr key={t._id}>
                    <td>{t.name}</td>
                    <td>{t.lane || '—'}</td>
                    <td>{t.active !== false ? 'Yes' : 'No'}</td>
                    <td><button className='btn-stop' onClick={() => deleteBidTemplate(t)}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Profile variants */}
      <div className='card' style={{ marginTop: '1rem' }}>
        <h4 style={{ marginTop: 0 }}>Profile variants</h4>
        <form onSubmit={addPv} className='settings-fields-grid'>
          <div className='control-group'>
            <label>Title</label>
            <input value={pv.title} onChange={(e) => setPv((v) => ({ ...v, title: e.target.value }))} />
          </div>
          <div className='control-group'>
            <label>Description version</label>
            <input value={pv.descriptionVersion} onChange={(e) => setPv((v) => ({ ...v, descriptionVersion: e.target.value }))} />
          </div>
          <div className='control-group'>
            <label>Active from</label>
            <input type='date' value={pv.activeFrom} onChange={(e) => setPv((v) => ({ ...v, activeFrom: e.target.value }))} />
          </div>
          <div className='control-group'>
            <label>Active to</label>
            <input type='date' value={pv.activeTo} onChange={(e) => setPv((v) => ({ ...v, activeTo: e.target.value }))} />
          </div>
          <div className='control-group full-width'>
            <label>Notes</label>
            <input value={pv.notes} onChange={(e) => setPv((v) => ({ ...v, notes: e.target.value }))} />
          </div>
          <div className='control-group'>
            <button className='btn-start' type='submit'>+ Add variant</button>
          </div>
        </form>
        {profileVariants.length > 0 && (
          <div className='table-wrapper' style={{ marginTop: '0.75rem' }}>
            <table>
              <thead><tr><th>Title</th><th>Version</th><th>From</th><th>To</th><th></th></tr></thead>
              <tbody>
                {profileVariants.map((v) => (
                  <tr key={v._id}>
                    <td>{v.title}</td>
                    <td>{v.descriptionVersion || '—'}</td>
                    <td>{fmtDay(v.activeFrom)}</td>
                    <td>{fmtDay(v.activeTo)}</td>
                    <td><button className='btn-stop' onClick={() => deleteProfileVariant(v)}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className='card' style={{ marginTop: '1rem' }}>
        <h4 style={{ marginTop: 0 }}>Data & privacy</h4>
        <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
          All records here are internal, owner-only analytics behind authentication.
          Deletes (proposals, lanes, Connects, budgets) are recorded in the audit
          log. No Upwork passwords, cookies, or session tokens are ever stored, and
          nothing is collected from Upwork automatically. Back up the MongoDB
          database regularly — see <code>.claude/docs/BID-ANALYTICS.md</code>.
        </p>
      </div>
    </div>
  )
}
