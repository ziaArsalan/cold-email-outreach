import React, { useEffect, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { fmtDay, money } from '../../utils'
import { KpiCard, KpiGrid } from './Kpi'

const TYPES = ['PURCHASE', 'MONTHLY_ALLOCATION', 'REFUND', 'BONUS', 'SPENT', 'ADJUSTMENT']
const BLANK = {
  transactionDate: new Date().toISOString().slice(0, 10),
  transactionType: 'PURCHASE',
  connectsAmount: '',
  amountPaid: '',
  currency: 'USD',
  source: '',
  notes: '',
}

export default function ConnectsView() {
  const { connects, fetchConnects, createConnects, deleteConnects } = useApp()
  const [form, setForm] = useState(BLANK)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetchConnects()
  }, [])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    if (form.connectsAmount === '' || isNaN(Number(form.connectsAmount))) {
      alert('Connects amount must be a number.')
      return
    }
    setBusy(true)
    const ok = await createConnects({
      transactionDate: form.transactionDate || undefined,
      transactionType: form.transactionType,
      connectsAmount: Number(form.connectsAmount),
      amountPaid: form.amountPaid === '' ? undefined : Number(form.amountPaid),
      currency: form.currency || 'USD',
      source: form.source || undefined,
      notes: form.notes || undefined,
    })
    setBusy(false)
    if (ok) setForm(BLANK)
  }

  const bal = connects.balance

  return (
    <div>
      <KpiGrid>
        <KpiCard label='Current balance' value={bal ? bal.balance : '—'} sub='Connects' />
        <KpiCard label='Purchased / earned' value={bal ? bal.purchased : '—'} sub='Connects' />
        <KpiCard label='Spent' value={bal ? bal.spent : '—'} sub='Connects' />
        <KpiCard label='Total paid' value={bal ? money(bal.amountPaid) : '—'} />
      </KpiGrid>

      <form onSubmit={submit} className='card' style={{ background: 'var(--bg-alt)', marginTop: '1rem' }}>
        <h4 style={{ marginTop: 0 }}>Add transaction</h4>
        <div className='settings-fields-grid'>
          <div className='control-group'>
            <label>Date</label>
            <input type='date' value={form.transactionDate} onChange={(e) => set('transactionDate', e.target.value)} />
          </div>
          <div className='control-group'>
            <label>Type</label>
            <select value={form.transactionType} onChange={(e) => set('transactionType', e.target.value)}>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
          <div className='control-group'>
            <label>Connects amount</label>
            <input type='number' value={form.connectsAmount} onChange={(e) => set('connectsAmount', e.target.value)} />
            <span className='field-note'>Use the raw count; SPENT is subtracted automatically.</span>
          </div>
          <div className='control-group'>
            <label>Amount paid</label>
            <input type='number' value={form.amountPaid} onChange={(e) => set('amountPaid', e.target.value)} />
          </div>
          <div className='control-group'>
            <label>Currency</label>
            <input value={form.currency} onChange={(e) => set('currency', e.target.value)} />
          </div>
          <div className='control-group'>
            <label>Source</label>
            <input value={form.source} onChange={(e) => set('source', e.target.value)} placeholder='Upwork purchase / monthly plan' />
          </div>
          <div className='control-group full-width'>
            <label>Notes</label>
            <input value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>
        </div>
        <button className='btn-start' type='submit' disabled={busy} style={{ marginTop: '0.75rem' }}>
          {busy ? 'Adding…' : '+ Add transaction'}
        </button>
      </form>

      <div className='card table-card' style={{ marginTop: '1rem' }}>
        <h4 style={{ marginTop: 0 }}>Ledger ({connects.items.length})</h4>
        {connects.items.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>No transactions yet.</p>
        ) : (
          <div className='table-wrapper'>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Connects</th>
                  <th>Paid</th>
                  <th>Source</th>
                  <th>Notes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {connects.items.map((t) => (
                  <tr key={t._id}>
                    <td>{fmtDay(t.transactionDate)}</td>
                    <td>{t.transactionType.replace(/_/g, ' ')}</td>
                    <td>{t.transactionType === 'SPENT' ? `-${t.connectsAmount}` : t.connectsAmount}</td>
                    <td>{t.amountPaid != null ? money(t.amountPaid, t.currency) : '—'}</td>
                    <td>{t.source || '—'}</td>
                    <td>{t.notes || '—'}</td>
                    <td>
                      <button className='btn-stop' onClick={() => deleteConnects(t._id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
