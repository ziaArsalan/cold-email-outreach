import React from 'react'
import { useApp } from '../context/AppContext'

export default function LogsPage() {
  const { logs, logsCategory, setLogsCategory, logsSince, setLogsSince, fetchLogs } =
    useApp()

  return (
          <div className='tab-content'>
            <div className='page-header'>
              <h1>Logs</h1>
              <p>Send activity — newest first</p>
            </div>

            <div className='card table-card'>
              <div className='queue-controls' style={{ marginBottom: '1rem' }}>
                <select
                  value={logsCategory}
                  onChange={(e) => {
                    setLogsCategory(e.target.value)
                    fetchLogs(e.target.value, 1, logsSince)
                  }}
                >
                  <option value=''>All categories</option>
                  {[
                    'smtp',
                    'queue',
                    'campaign',
                    'ai',
                    'rotation',
                    'retry',
                    'error',
                  ].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <input
                  type='date'
                  value={logsSince}
                  onChange={(e) => {
                    setLogsSince(e.target.value)
                    fetchLogs(logsCategory, 1, e.target.value)
                  }}
                />
                <button
                  className='btn-ghost'
                  onClick={() => fetchLogs(logsCategory, logs.page, logsSince)}
                >
                  Refresh
                </button>
              </div>

              {logs.items.length === 0 ? (
                <p style={{ color: 'var(--muted)', fontSize: '13px' }}>
                  No log entries.
                </p>
              ) : (
                <div className='table-wrapper'>
                  <table>
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Category</th>
                        <th>Level</th>
                        <th>Campaign / Template</th>
                        <th>Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.items.map((l) => (
                        <tr key={l._id}>
                          <td>{new Date(l.timestamp).toLocaleString()}</td>
                          <td>
                            <span
                              className={`status-badge badge-${l.category}`}
                            >
                              {l.category || '—'}
                            </span>
                            {l.test && (
                              <span
                                className='status-badge badge-paused'
                                style={{ marginLeft: 6 }}
                              >
                                TEST
                              </span>
                            )}
                          </td>
                          <td>{l.level || '—'}</td>
                          <td>
                            {l.campaignName ||
                              (l.templateName
                                ? `Template: ${l.templateName}`
                                : '—')}
                          </td>
                          <td className='cell-trunc' title={l.message}>
                            {l.message}
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
                  disabled={logs.page <= 1}
                  onClick={() =>
                    fetchLogs(logsCategory, logs.page - 1, logsSince)
                  }
                >
                  ← Prev
                </button>
                <span className='queue-page-label'>
                  Page {logs.page} of {logs.pages}
                </span>
                <button
                  className='btn-ghost'
                  disabled={logs.page >= logs.pages}
                  onClick={() =>
                    fetchLogs(logsCategory, logs.page + 1, logsSince)
                  }
                >
                  Next →
                </button>
              </div>
            </div>
          </div>
  )
}
