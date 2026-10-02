import React from 'react'
import { pct, numOrNA, money } from '../../utils'

// A single KPI stat card.
export function KpiCard({ label, value, sub }) {
  return (
    <div
      className='card'
      style={{
        background: 'var(--bg-alt)',
        padding: '0.9rem 1rem',
        minWidth: 0,
      }}
    >
      <div style={{ color: 'var(--muted)', fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{value}</div>
      {sub ? (
        <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 2 }}>{sub}</div>
      ) : null}
    </div>
  )
}

// Responsive grid of KPI cards.
export function KpiGrid({ children }) {
  return (
    <div
      style={{
        display: 'grid',
        gap: '0.75rem',
        gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
      }}
    >
      {children}
    </div>
  )
}

// The standard per-group metric table used by every breakdown (boosted/organic,
// lane, profile, template, portfolio, client). `rows` carry a `key` label plus
// the metricsFor fields. `keyLabel` names the first column.
export function BreakdownTable({ rows, keyLabel = 'Group' }) {
  if (!rows || rows.length === 0)
    return (
      <p style={{ color: 'var(--muted)', fontSize: 13 }}>No data in this range.</p>
    )
  return (
    <div className='table-wrapper'>
      <table>
        <thead>
          <tr>
            <th>{keyLabel}</th>
            <th>Proposals</th>
            <th>Connects</th>
            <th>Avg/prop</th>
            <th>Views</th>
            <th>View rate</th>
            <th>Replies</th>
            <th>Reply rate</th>
            <th>Interviews</th>
            <th>Hires</th>
            <th>Hire rate</th>
            <th>Revenue</th>
            <th>Rev/Connect</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>{r.key}</td>
              <td>{r.proposals}</td>
              <td>{r.connects}</td>
              <td>{numOrNA(r.avgConnects)}</td>
              <td>{r.views}</td>
              <td>{pct(r.viewRate)}</td>
              <td>{r.replies}</td>
              <td>{pct(r.replyRate)}</td>
              <td>{r.interviews}</td>
              <td>{r.hires}</td>
              <td>{pct(r.hireRate)}</td>
              <td>{money(r.revenue)}</td>
              <td>{numOrNA(r.revenuePerConnect)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
