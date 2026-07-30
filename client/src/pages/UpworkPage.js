import React from 'react'
import { useApp } from '../context/AppContext'

export default function UpworkPage() {
  const {
    upworkStats,
    upworkSettings,
    upworkJobs,
    upworkJobsLoading,
    upworkSettingsSaving,
    upworkSettingsSaved,
    upworkTestLoading,
    upworkTestResults,
    draftSettings,
    setDraftSettings,
    rowBusy,
    saveUpworkSettings,
    testUpworkQuery,
    fetchUpworkStats,
    fetchUpworkJobs,
    generateCover,
    setCoverModal,
  } = useApp()

  return (
          <div className='tab-content'>
            <div className='page-header'>
              <h1>Upwork Monitor</h1>
              <p>Tracked jobs, settings, and AI cover letters</p>
            </div>

            {/* Stats */}
            <div className='stats-grid'>
              <div className='stat-card'>
                <span className='stat-num'>
                  {upworkStats?.totalJobs ?? '—'}
                </span>
                <span className='stat-label'>Total Jobs</span>
              </div>
              <div className='stat-card'>
                <span className='stat-num'>
                  {upworkStats?.coverLettersGenerated ?? '—'}
                </span>
                <span className='stat-label'>Cover Letters</span>
              </div>
              <div className='stat-card'>
                <span className='stat-num' style={{ fontSize: '16px' }}>
                  {upworkStats?.activeActor
                    ? upworkStats.activeActor.split('/').pop()
                    : '—'}
                </span>
                <span className='stat-label'>Active Actor</span>
              </div>
              <div className='stat-card'>
                <span className='stat-num'>
                  {upworkStats
                    ? `${upworkStats.dailyCount ?? 0} / ${upworkStats.dailyLimit || '∞'}`
                    : '—'}
                </span>
                <span className='stat-label'>Today's Jobs</span>
              </div>
            </div>

            {/* Settings */}
            <div className='card settings-card'>
              <h2>Monitor Settings</h2>

              {/* Cron toggle — prominent, full width */}
              <div className='cron-control-row'>
                <label>Cron Status</label>
                <label className='toggle-switch'>
                  <input
                    type='checkbox'
                    checked={draftSettings?.cronEnabled ?? true}
                    onChange={(e) =>
                      setDraftSettings((s) => ({
                        ...s,
                        cronEnabled: e.target.checked,
                      }))
                    }
                  />
                  <span className='toggle-slider' />
                  <span className='toggle-label'>
                    {(draftSettings?.cronEnabled ?? true) ? 'ON' : 'OFF'}
                  </span>
                </label>
              </div>

              {/* Two-column grid of fields */}
              <div className='settings-fields-grid'>
                <div className='control-group'>
                  <label>Actor ID</label>
                  <input
                    type='text'
                    value={draftSettings?.actorId ?? ''}
                    onChange={(e) =>
                      setDraftSettings((d) => ({
                        ...d,
                        actorId: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className='control-group'>
                  <label>Cron Interval</label>
                  <input
                    type='text'
                    value={draftSettings?.cronInterval ?? ''}
                    onChange={(e) =>
                      setDraftSettings((d) => ({
                        ...d,
                        cronInterval: e.target.value,
                      }))
                    }
                  />
                  <span className='field-note'>
                    Interval changes apply after server restart.
                  </span>
                </div>
                <div className='control-group'>
                  <label>Daily Job Limit</label>
                  <input
                    type='number'
                    min='0'
                    value={draftSettings?.dailyLimit ?? 0}
                    onChange={(e) =>
                      setDraftSettings((s) => ({
                        ...s,
                        dailyLimit: Number(e.target.value),
                      }))
                    }
                  />
                  <span className='field-note'>
                    Max jobs to append per day (0 = unlimited)
                  </span>
                </div>
                <div className='control-group'>
                  <label>Active Hours</label>
                  <label className='checkbox-row'>
                    <input
                      type='checkbox'
                      checked={draftSettings?.scheduleEnabled ?? false}
                      onChange={(e) =>
                        setDraftSettings((s) => ({
                          ...s,
                          scheduleEnabled: e.target.checked,
                        }))
                      }
                    />
                    Enable time window
                  </label>
                  {draftSettings?.scheduleEnabled && (
                    <div className='time-range-row'>
                      <input
                        type='time'
                        value={draftSettings?.scheduleStart || '09:00'}
                        onChange={(e) =>
                          setDraftSettings((s) => ({
                            ...s,
                            scheduleStart: e.target.value,
                          }))
                        }
                      />
                      <span>to</span>
                      <input
                        type='time'
                        value={draftSettings?.scheduleEnd || '18:00'}
                        onChange={(e) =>
                          setDraftSettings((s) => ({
                            ...s,
                            scheduleEnd: e.target.value,
                          }))
                        }
                      />
                    </div>
                  )}
                </div>
                <div className='control-group'>
                  <label>Auto-cover</label>
                  <label className='checkbox-row'>
                    <input
                      type='checkbox'
                      checked={!!draftSettings?.autoCover}
                      onChange={(e) =>
                        setDraftSettings((d) => ({
                          ...d,
                          autoCover: e.target.checked,
                        }))
                      }
                    />
                    Auto-generate cover letter
                  </label>
                </div>
                <div className='control-group full-width'>
                  <label>Keywords (comma-separated)</label>
                  <textarea
                    className='settings-textarea'
                    rows={3}
                    value={draftSettings?.keywords ?? ''}
                    onChange={(e) =>
                      setDraftSettings((d) => ({
                        ...d,
                        keywords: e.target.value,
                      }))
                    }
                  />
                </div>
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
                  disabled={upworkSettingsSaving || !draftSettings}
                  onClick={() => saveUpworkSettings(draftSettings)}
                >
                  {upworkSettingsSaving ? 'Saving…' : 'Save Settings'}
                </button>
                {upworkSettingsSaved && <span className='badge-ok'>Saved</span>}
              </div>
              <div className='control-group' style={{ marginTop: '1.25rem' }}>
                <button
                  className='btn-ghost'
                  onClick={testUpworkQuery}
                  disabled={upworkTestLoading}
                >
                  {upworkTestLoading ? 'Testing…' : '🔍 Test Query'}
                </button>
                {upworkTestResults && !upworkTestResults.error && (
                  <div className='test-results-card'>
                    <div className='test-results-header'>
                      "{upworkTestResults.keyword}" — {upworkTestResults.count}{' '}
                      jobs found
                    </div>
                    <ul className='test-results-list'>
                      {upworkTestResults.jobs.map((j, i) => (
                        <li key={i}>
                          <a href={j.url} target='_blank' rel='noreferrer'>
                            {j.title}
                          </a>
                          <span className='test-result-meta'>
                            {j.clientCountry} · {j.applicants} applicants ·{' '}
                            {Array.isArray(j.skills)
                              ? j.skills.slice(0, 3).join(', ')
                              : j.skills}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {upworkTestResults?.error && (
                  <div className='test-results-card test-results-error'>
                    {upworkTestResults.error}
                  </div>
                )}
              </div>
            </div>

            {/* Jobs table */}
            <div className='card table-card'>
              <div
                className='bulk-actions'
                style={{
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <h2 style={{ margin: 0 }}>Upwork Jobs</h2>
                <button
                  className='btn-ghost'
                  onClick={() => {
                    fetchUpworkJobs()
                    fetchUpworkStats()
                  }}
                >
                  ↻ Refresh
                </button>
              </div>
              {upworkJobsLoading ? (
                <div className='loading-card'>
                  <div className='spinner' />
                  <p>Loading jobs…</p>
                </div>
              ) : (
                <div className='table-wrapper'>
                  <table>
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Link</th>
                        <th>Skills</th>
                        <th>Country</th>
                        <th>Rating</th>
                        <th>Applicants</th>
                        <th>Contact</th>
                        <th>Confidence</th>
                        <th>Apply</th>
                        <th>Cover Letter</th>
                        <th>Date</th>
                        {!upworkSettings?.autoCover && <th>Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {upworkJobs.map((job) => (
                        <tr key={job.rowIndex}>
                          <td>{job.title}</td>
                          <td>
                            {job.url && (
                              <a
                                href={job.url}
                                target='_blank'
                                rel='noreferrer'
                                className='link'
                              >
                                View
                              </a>
                            )}
                          </td>
                          <td>{job.skills}</td>
                          <td>{job.clientCountry}</td>
                          <td>{job.clientRating}</td>
                          <td>{job.applicants}</td>
                          <td>{job.contactName}</td>
                          <td>{job.contactConfidence}</td>
                          <td>
                            {job.applyLink && (
                              <a
                                href={job.applyLink}
                                target='_blank'
                                rel='noreferrer'
                                className='link'
                              >
                                Apply
                              </a>
                            )}
                          </td>
                          <td>
                            {job.coverLetter && job.coverLetter.trim() ? (
                              <span
                                className='cover-preview'
                                onClick={() => setCoverModal(job.coverLetter)}
                              >
                                {job.coverLetter.slice(0, 80)}…
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td>{job.dateFound}</td>
                          {!upworkSettings?.autoCover && (
                            <td>
                              {!job.coverLetter?.trim() &&
                                (rowBusy.has(job.rowIndex) ? (
                                  <span
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '0.5rem',
                                    }}
                                  >
                                    <span className='spinner' /> Generating…
                                  </span>
                                ) : (
                                  <button
                                    className='btn-preview'
                                    onClick={() => generateCover(job.rowIndex)}
                                  >
                                    Generate Cover
                                  </button>
                                ))}
                            </td>
                          )}
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
