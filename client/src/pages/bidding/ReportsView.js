import React, { useEffect, useRef } from 'react'
import { useApp } from '../../context/AppContext'
import { pct, numOrNA } from '../../utils'
import { BreakdownTable } from './Kpi'

export default function ReportsView() {
  const {
    bidAnalytics,
    bidAnalyticsLoading,
    fetchBidAnalytics,
    analyticsRange,
    importProposalsCsv,
    importResult,
    setImportResult,
    bidImportBusy,
    exportProposals,
    downloadImportTemplate,
  } = useApp()
  const fileRef = useRef(null)

  useEffect(() => {
    if (!bidAnalytics) fetchBidAnalytics()
  }, [])

  const a = bidAnalytics
  const tta = a && a.timeToApply

  return (
    <div>
      {/* CSV import / export */}
      <div className='card' style={{ background: 'var(--bg-alt)' }}>
        <h4 style={{ marginTop: 0 }}>Import / export (CSV)</h4>
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>
          Internal analytics data only. Exports escape formula characters
          (=, +, -, @) to prevent spreadsheet injection. Import never pulls from
          Upwork — you supply the file.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button className='btn-ghost' onClick={downloadImportTemplate}>
            ↓ Download import template
          </button>
          <input
            ref={fileRef}
            type='file'
            accept='.csv,text/csv'
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files && e.target.files[0]
              if (f) importProposalsCsv(f)
              e.target.value = ''
            }}
          />
          <button className='btn-start' disabled={bidImportBusy} onClick={() => fileRef.current && fileRef.current.click()}>
            {bidImportBusy ? 'Importing…' : '↑ Import CSV'}
          </button>
          <button className='btn-ghost' onClick={() => exportProposals()}>
            ↓ Export all proposals
          </button>
          <button
            className='btn-ghost'
            onClick={() => exportProposals({ from: analyticsRange.from, to: analyticsRange.to })}
          >
            ↓ Export current range
          </button>
        </div>
        {importResult && (
          <div style={{ marginTop: '0.75rem', fontSize: 13 }}>
            <strong>Import summary:</strong> {importResult.inserted} inserted ·{' '}
            {importResult.duplicates} duplicate(s) skipped · {importResult.failed} failed (of {importResult.total}).
            {importResult.errors && importResult.errors.length > 0 && (
              <ul style={{ marginTop: '0.5rem' }}>
                {importResult.errors.slice(0, 10).map((e, i) => (
                  <li key={i} style={{ color: 'var(--error)' }}>
                    Row {e.row}: {e.error}
                  </li>
                ))}
              </ul>
            )}
            <button className='btn-ghost' style={{ marginTop: '0.5rem' }} onClick={() => setImportResult(null)}>
              Dismiss
            </button>
          </div>
        )}
      </div>

      {bidAnalyticsLoading ? (
        <div className='card loading-card'>
          <div className='spinner' />
          <p>Loading reports…</p>
        </div>
      ) : !a || a.totalProposals === 0 ? (
        <div className='card' style={{ marginTop: '1rem', textAlign: 'center', padding: '2rem' }}>
          <p style={{ color: 'var(--muted)' }}>No proposals in this range yet.</p>
        </div>
      ) : (
        <>
          <h3 style={{ margin: '1.25rem 0 0.5rem' }}>Profile title performance</h3>
          <div className='card'><BreakdownTable keyLabel='Profile title' rows={a.byProfile} /></div>

          <h3 style={{ margin: '1.25rem 0 0.5rem' }}>Proposal template performance</h3>
          <div className='card'><BreakdownTable keyLabel='Template' rows={a.byTemplate} /></div>

          <h3 style={{ margin: '1.25rem 0 0.5rem' }}>Portfolio item performance</h3>
          <div className='card'><BreakdownTable keyLabel='Portfolio item' rows={a.byPortfolio} /></div>

          <h3 style={{ margin: '1.25rem 0 0.5rem' }}>Client quality</h3>
          <div className='card'>
            <h4 style={{ marginTop: 0 }}>By country</h4>
            <BreakdownTable keyLabel='Country' rows={a.clientQuality.byCountry} />
            <h4>By verified payment</h4>
            <BreakdownTable keyLabel='Payment' rows={a.clientQuality.byVerifiedPayment} />
            <h4>By budget type</h4>
            <BreakdownTable keyLabel='Budget type' rows={a.clientQuality.byBudgetType} />
            <h4>By job type</h4>
            <BreakdownTable keyLabel='Job type' rows={a.clientQuality.byJobType} />
          </div>

          <h3 style={{ margin: '1.25rem 0 0.5rem' }}>Time to apply</h3>
          <div className='card'>
            {tta.sampleSize === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: 13 }}>
                No proposals have both a job-posted and submitted time yet.
              </p>
            ) : (
              <>
                <p style={{ color: 'var(--muted)', fontSize: 13 }}>
                  {tta.sampleSize} proposals with timing · average {numOrNA(tta.avgHours, 1)} hours from post to apply.
                </p>
                <div className='table-wrapper'>
                  <table>
                    <thead>
                      <tr>
                        <th>Window</th>
                        <th>Proposals</th>
                        <th>Replies</th>
                        <th>Reply rate</th>
                        <th>Hires</th>
                        <th>Hire rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tta.buckets.map((b) => (
                        <tr key={b.label}>
                          <td>{b.label}</td>
                          <td>{b.proposals}</td>
                          <td>{b.replies}</td>
                          <td>{pct(b.replyRate)}</td>
                          <td>{b.hires}</td>
                          <td>{pct(b.hireRate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
