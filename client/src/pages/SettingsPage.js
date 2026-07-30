import React from 'react'
import { useApp } from '../context/AppContext'

export default function SettingsPage() {
  const {
    outreachDraft,
    setOutreachDraft,
    outreachSaving,
    outreachSaved,
    saveOutreachSettings,
  } = useApp()

  return (
          <div className='tab-content'>
            <div className='page-header'>
              <h1>Settings</h1>
              <p>Configure your server environment variables</p>
            </div>

            {/* Outreach engine settings (worker/delays/verification) — stored in
                the DB, effective without a restart. Delays shown in minutes, idle
                in seconds; converted to ms on save. */}
            <div className='card settings-card'>
              <h2>Outreach Settings</h2>

              {/* Worker */}
              <div className='cron-control-row'>
                <label>Queue Worker</label>
                <label className='toggle-switch'>
                  <input
                    type='checkbox'
                    checked={outreachDraft?.queueWorkerEnabled ?? false}
                    onChange={(e) =>
                      setOutreachDraft((s) => ({
                        ...s,
                        queueWorkerEnabled: e.target.checked,
                      }))
                    }
                  />
                  <span className='toggle-slider' />
                  <span className='toggle-label'>
                    {(outreachDraft?.queueWorkerEnabled ?? false)
                      ? 'ON'
                      : 'OFF'}
                  </span>
                </label>
              </div>

              <div className='settings-fields-grid'>
                <div className='control-group'>
                  <label>Send Mode</label>
                  <select
                    value={outreachDraft?.sendMode ?? 'warmup'}
                    onChange={(e) =>
                      setOutreachDraft((s) => ({
                        ...s,
                        sendMode: e.target.value,
                      }))
                    }
                  >
                    <option value='warmup'>warmup</option>
                    <option value='production'>production</option>
                  </select>
                  <span className='field-note'>
                    Picks which delay range the worker uses.
                  </span>
                </div>

                {/* Delays — displayed in MINUTES, stored as ms */}
                {['warmup', 'production'].map((mode) => (
                  <React.Fragment key={mode}>
                    <div className='control-group'>
                      <label>{mode} delay — min (minutes)</label>
                      <input
                        type='number'
                        min='0'
                        step='0.1'
                        value={
                          outreachDraft
                            ? (outreachDraft.delays[mode].minMs || 0) / 60000
                            : 0
                        }
                        onChange={(e) =>
                          setOutreachDraft((s) => ({
                            ...s,
                            delays: {
                              ...s.delays,
                              [mode]: {
                                ...s.delays[mode],
                                minMs: Math.round(
                                  Number(e.target.value) * 60000,
                                ),
                              },
                            },
                          }))
                        }
                      />
                    </div>
                    <div className='control-group'>
                      <label>{mode} delay — max (minutes)</label>
                      <input
                        type='number'
                        min='0'
                        step='0.1'
                        value={
                          outreachDraft
                            ? (outreachDraft.delays[mode].maxMs || 0) / 60000
                            : 0
                        }
                        onChange={(e) =>
                          setOutreachDraft((s) => ({
                            ...s,
                            delays: {
                              ...s.delays,
                              [mode]: {
                                ...s.delays[mode],
                                maxMs: Math.round(
                                  Number(e.target.value) * 60000,
                                ),
                              },
                            },
                          }))
                        }
                      />
                    </div>
                  </React.Fragment>
                ))}

                {/* Retry / idle */}
                <div className='control-group'>
                  <label>Max Retries</label>
                  <input
                    type='number'
                    min='0'
                    max='10'
                    value={outreachDraft?.maxRetries ?? 0}
                    onChange={(e) =>
                      setOutreachDraft((s) => ({
                        ...s,
                        maxRetries: Number(e.target.value),
                      }))
                    }
                  />
                  <span className='field-note'>0–10</span>
                </div>
                <div className='control-group'>
                  <label>Worker Idle (seconds)</label>
                  <input
                    type='number'
                    min='1'
                    value={
                      outreachDraft
                        ? (outreachDraft.workerIdleMs || 0) / 1000
                        : 0
                    }
                    onChange={(e) =>
                      setOutreachDraft((s) => ({
                        ...s,
                        workerIdleMs: Math.round(Number(e.target.value) * 1000),
                      }))
                    }
                  />
                  <span className='field-note'>
                    Poll interval when idle (1–600s)
                  </span>
                </div>
              </div>

              {/* Warm-up ramp table */}
              <h2 style={{ marginTop: '1.5rem' }}>Warm-up Ramp</h2>
              <div className='settings-fields-grid'>
                {(outreachDraft?.warmupWeeks ?? []).map((row, i) => (
                  <React.Fragment key={i}>
                    <div className='control-group'>
                      <label>Week {row.week} — min</label>
                      <input
                        type='number'
                        min='0'
                        value={row.min}
                        onChange={(e) =>
                          setOutreachDraft((s) => ({
                            ...s,
                            warmupWeeks: s.warmupWeeks.map((r, j) =>
                              j === i
                                ? { ...r, min: Number(e.target.value) }
                                : r,
                            ),
                          }))
                        }
                      />
                    </div>
                    <div className='control-group'>
                      <label>Week {row.week} — max</label>
                      <input
                        type='number'
                        min='0'
                        value={row.max}
                        onChange={(e) =>
                          setOutreachDraft((s) => ({
                            ...s,
                            warmupWeeks: s.warmupWeeks.map((r, j) =>
                              j === i
                                ? { ...r, max: Number(e.target.value) }
                                : r,
                            ),
                          }))
                        }
                      />
                    </div>
                  </React.Fragment>
                ))}
              </div>

              {/* Email verification checks */}
              <h2 style={{ marginTop: '1.5rem' }}>Email Verification</h2>
              <div className='settings-fields-grid'>
                {[
                  ['checkMX', 'Require MX record'],
                  ['blockDisposable', 'Block disposable domains'],
                  [
                    'blockRoleBased',
                    'Block role-based inboxes (info@, admin@)',
                  ],
                ].map(([key, label]) => (
                  <div className='control-group' key={key}>
                    <label className='checkbox-row'>
                      <input
                        type='checkbox'
                        checked={
                          outreachDraft?.emailVerification?.[key] ?? false
                        }
                        onChange={(e) =>
                          setOutreachDraft((s) => ({
                            ...s,
                            emailVerification: {
                              ...s.emailVerification,
                              [key]: e.target.checked,
                            },
                          }))
                        }
                      />
                      {label}
                    </label>
                  </div>
                ))}
              </div>

              <div
                style={{
                  marginTop: '1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                }}
              >
                <button
                  className='btn-start'
                  disabled={outreachSaving || !outreachDraft}
                  onClick={saveOutreachSettings}
                >
                  {outreachSaving ? 'Saving…' : 'Save Settings'}
                </button>
                {outreachSaved && <span className='badge-ok'>Saved ✓</span>}
              </div>
            </div>

            <div className='card settings-card'>
              <h2>Required Environment Variables</h2>
              <p>
                Set these in your <code>server/.env</code> file:
              </p>
              <div className='env-table'>
                {[
                  ['GOOGLE_SHEET_ID', 'Your Google Sheet ID from the URL'],
                  [
                    'GOOGLE_SERVICE_ACCOUNT_EMAIL',
                    'Service account email from Google Cloud',
                  ],
                  [
                    'GOOGLE_PRIVATE_KEY',
                    'Private key from service account JSON',
                  ],
                  [
                    'ANTHROPIC_API_KEY',
                    'Your Claude API key from console.anthropic.com',
                  ],
                  ['SMTP_HOST', 'e.g. mail.devtronics.co'],
                  ['SMTP_PORT', '465 for SSL, 587 for TLS'],
                  ['SMTP_USER', 'zia@devtronics.co'],
                  ['SMTP_PASS', 'Your email password'],
                ].map(([key, desc]) => (
                  <div key={key} className='env-row'>
                    <code>{key}</code>
                    <span>{desc}</span>
                  </div>
                ))}
              </div>
              <h2 style={{ marginTop: '2rem' }}>Google Sheet Setup</h2>
              <p>Your sheet must have these columns in order:</p>
              <div className='env-table'>
                {[
                  'A: Email',
                  'B: Name',
                  'C: Business',
                  'D: Website',
                  'E: Status',
                  'F: Reference',
                ].map((col) => (
                  <div key={col} className='env-row'>
                    <code>{col.split(':')[0]}</code>
                    <span>{col.split(':')[1]}</span>
                  </div>
                ))}
              </div>
              <div className='settings-note'>
                <strong>Note:</strong> Share your Google Sheet with the service
                account email and give it Editor access.
              </div>
            </div>
          </div>
  )
}
