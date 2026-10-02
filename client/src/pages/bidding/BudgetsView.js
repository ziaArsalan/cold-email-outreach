import React, { useEffect, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { MONTH_NAMES, pct, money, numOrNA } from '../../utils'

const now = new Date()
const BLANK = {
  month: now.getMonth() + 1,
  year: now.getFullYear(),
  totalConnectsBudget: '',
  organicConnectsBudget: '',
  boostedConnectsBudget: '',
  maxConnectsPerProposal: '',
  maxBoostConnectsPerProposal: '',
  targetProposals: '',
  targetInterviews: '',
  targetHires: '',
  targetRevenue: '',
  notes: '',
}

const numFields = [
  'totalConnectsBudget', 'organicConnectsBudget', 'boostedConnectsBudget',
  'maxConnectsPerProposal', 'maxBoostConnectsPerProposal', 'targetProposals',
  'targetInterviews', 'targetHires', 'targetRevenue',
]

export default function BudgetsView() {
  const {
    budgets,
    budgetReports,
    fetchBudgets,
    fetchBudgetReport,
    saveBudget,
    deleteBudget,
    copyBudgetNext,
  } = useApp()
  const [form, setForm] = useState(BLANK)
  const [editingId, setEditingId] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetchBudgets()
  }, [])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const openEdit = (b) => {
    setEditingId(b._id)
    const next = { ...BLANK, month: b.month, year: b.year }
    for (const k of numFields) next[k] = b[k] ?? ''
    next.notes = b.notes || ''
    setForm(next)
  }
  const resetForm = () => {
    setEditingId(null)
    setForm(BLANK)
  }

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    const payload = { month: Number(form.month), year: Number(form.year), notes: form.notes }
    for (const k of numFields) if (form[k] !== '') payload[k] = Number(form[k])
    const ok = await saveBudget(payload, editingId)
    setBusy(false)
    if (ok) resetForm()
  }

  return (
    <div>
      <form onSubmit={submit} className='card' style={{ background: 'var(--bg-alt)' }}>
        <h4 style={{ marginTop: 0 }}>{editingId ? 'Edit budget' : 'New monthly budget'}</h4>
        <div className='settings-fields-grid'>
          <div className='control-group'>
            <label>Month</label>
            <select value={form.month} onChange={(e) => set('month', e.target.value)} disabled={!!editingId}>
              {MONTH_NAMES.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className='control-group'>
            <label>Year</label>
            <input type='number' value={form.year} onChange={(e) => set('year', e.target.value)} disabled={!!editingId} />
          </div>
          <div className='control-group'>
            <label>Total Connects budget</label>
            <input type='number' value={form.totalConnectsBudget} onChange={(e) => set('totalConnectsBudget', e.target.value)} />
          </div>
          <div className='control-group'>
            <label>Organic Connects budget</label>
            <input type='number' value={form.organicConnectsBudget} onChange={(e) => set('organicConnectsBudget', e.target.value)} />
          </div>
          <div className='control-group'>
            <label>Boosted Connects budget</label>
            <input type='number' value={form.boostedConnectsBudget} onChange={(e) => set('boostedConnectsBudget', e.target.value)} />
          </div>
          <div className='control-group'>
            <label>Max Connects / proposal</label>
            <input type='number' value={form.maxConnectsPerProposal} onChange={(e) => set('maxConnectsPerProposal', e.target.value)} />
          </div>
          <div className='control-group'>
            <label>Max boost Connects / proposal</label>
            <input type='number' value={form.maxBoostConnectsPerProposal} onChange={(e) => set('maxBoostConnectsPerProposal', e.target.value)} />
          </div>
          <div className='control-group'>
            <label>Target proposals</label>
            <input type='number' value={form.targetProposals} onChange={(e) => set('targetProposals', e.target.value)} />
          </div>
          <div className='control-group'>
            <label>Target interviews</label>
            <input type='number' value={form.targetInterviews} onChange={(e) => set('targetInterviews', e.target.value)} />
          </div>
          <div className='control-group'>
            <label>Target hires</label>
            <input type='number' value={form.targetHires} onChange={(e) => set('targetHires', e.target.value)} />
          </div>
          <div className='control-group'>
            <label>Target revenue</label>
            <input type='number' value={form.targetRevenue} onChange={(e) => set('targetRevenue', e.target.value)} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
          <button className='btn-start' type='submit' disabled={busy}>
            {busy ? 'Saving…' : editingId ? 'Save changes' : '+ Create budget'}
          </button>
          {editingId && (
            <button className='btn-ghost' type='button' onClick={resetForm}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <h3 style={{ margin: '1.25rem 0 0.5rem' }}>Budgets</h3>
      {budgets.length === 0 ? (
        <div className='card'>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>No budgets yet.</p>
        </div>
      ) : (
        budgets.map((b) => {
          const rep = budgetReports[b._id]
          return (
            <div key={b._id} className='card' style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <h4 style={{ margin: 0 }}>
                  {MONTH_NAMES[b.month - 1]} {b.year}
                  <span style={{ color: 'var(--muted)', fontWeight: 400, marginLeft: '0.5rem', fontSize: 13 }}>
                    budget {b.totalConnectsBudget} Connects
                  </span>
                </h4>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className='btn-ghost' onClick={() => fetchBudgetReport(b._id)}>
                    View report
                  </button>
                  <button className='btn-ghost' onClick={() => openEdit(b)}>
                    Edit
                  </button>
                  <button className='btn-ghost' onClick={() => copyBudgetNext(b)}>
                    Copy to next month
                  </button>
                  <button className='btn-stop' onClick={() => deleteBudget(b)}>
                    Delete
                  </button>
                </div>
              </div>

              {rep && (
                <div style={{ marginTop: '0.75rem' }}>
                  {rep.warnings.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.75rem' }}>
                      {rep.warnings.map((w, i) => (
                        <div key={i} style={{ background: 'rgba(245,158,11,0.15)', borderRadius: 8, padding: '0.5rem 0.75rem', fontSize: 13 }}>
                          ⚠ {w}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className='table-wrapper'>
                    <table>
                      <tbody>
                        <tr><td>Connects used</td><td>{rep.connectsUsed} / {rep.totalConnectsBudget}</td></tr>
                        <tr><td>Remaining</td><td>{rep.remaining}</td></tr>
                        <tr><td>Utilization</td><td>{pct(rep.utilization)}</td></tr>
                        <tr><td>Organic used</td><td>{rep.organicConnectsUsed}</td></tr>
                        <tr><td>Boosted used</td><td>{rep.boostedConnectsUsed}</td></tr>
                        <tr><td>Revenue</td><td>{money(rep.revenue)}</td></tr>
                        <tr><td>Hires</td><td>{rep.hires}</td></tr>
                        <tr><td>Cost / hire</td><td>{numOrNA(rep.costPerHire)} Connects</td></tr>
                        <tr><td>On track</td><td>{rep.onTrack === null ? 'N/A' : rep.onTrack ? 'Yes' : 'Over budget'}</td></tr>
                        {rep.targets && (
                          <tr>
                            <td>Targets (proposals / interviews / hires / revenue)</td>
                            <td>
                              {rep.progress.proposals}/{rep.targets.proposals || 0} · {rep.progress.interviews}/{rep.targets.interviews || 0} ·{' '}
                              {rep.progress.hires}/{rep.targets.hires || 0} · {money(rep.progress.revenue)}/{money(rep.targets.revenue || 0)}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
