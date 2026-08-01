import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { scheduleSummary } from '../utils'

export default function CampaignsPage() {
  const navigate = useNavigate()
  const {
    campaigns,
    fetchCampaigns,
    openCampaignView,
    campaignActionId,
    campaignAction,
    duplicateCampaignToList,
    deleteCampaign,
    lists,
  } = useApp()

  return (
    <div className='tab-content'>
      <div className='page-header'>
        <h1>Campaigns</h1>
        <p>Launch and control AI-personalized outreach</p>
      </div>

      {/* How it works — plain-language flow */}
      <div className='card legend-card'>
        <div className='legend-flow'>
          <span className='legend-step'>
            1 · <strong>Start</strong> → all target leads join the queue
          </span>
          <span className='legend-arrow'>→</span>
          <span className='legend-step'>
            2 · Emails send <strong>one at a time</strong>, every few
            minutes
          </span>
          <span className='legend-arrow'>→</span>
          <span className='legend-step'>
            3 · Stops at the <strong>daily limit</strong>, resumes next
            day
          </span>
        </div>
        <div className='legend-statuses'>
          <span>
            <span className='status-badge badge-draft'>draft</span> not
            started
          </span>
          <span>
            <span className='status-badge badge-running'>running</span>{' '}
            actively sending
          </span>
          <span>
            <span className='status-badge badge-paused'>paused</span>{' '}
            temporarily halted
          </span>
          <span>
            <span className='status-badge badge-completed'>
              completed
            </span>{' '}
            all sent
          </span>
        </div>
      </div>

      {/* Existing campaigns */}
      <div className='card'>
        <div
          className='bulk-actions'
          style={{
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h2 style={{ margin: 0 }}>Your Campaigns</h2>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className='btn-ghost' onClick={fetchCampaigns}>
              ↻ Refresh
            </button>
            <button
              className='btn-start'
              onClick={() => navigate('/campaigns/new')}
            >
              + New Campaign
            </button>
          </div>
        </div>
        {campaigns.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '13px' }}>
            No campaigns yet. Create one below.
          </p>
        ) : (
          <div className='campaign-list'>
            {campaigns.map((c) => {
              const counts = c.counts || {}
              const sent = counts.sent || 0
              const pending =
                (counts.pending || 0) +
                (counts.scheduled || 0) +
                (counts.sending || 0)
              const failed = (counts.failed || 0) + (counts.bounced || 0)
              const cancelled = counts.cancelled || 0
              const total = sent + pending + failed + cancelled
              const pct = total ? Math.round((sent / total) * 100) : 0
              return (
                <div key={c._id} className='campaign-row'>
                  <div className='campaign-main'>
                    <div className='campaign-title'>
                      <span className='campaign-name'>{c.name}</span>
                      <span className={`status-badge badge-${c.status}`}>
                        {c.status}
                      </span>
                      {c.status === 'running' && pending > 0 && (
                        <span className='field-note'>
                          sending…{' '}
                          {c.warmupEnabled
                            ? 'warm-up pace'
                            : 'one every few min'}
                        </span>
                      )}
                    </div>

                    {/* Progress: sent vs total targeted */}
                    <div className='campaign-progress'>
                      <div className='progress-bar'>
                        <div
                          className='progress-fill'
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className='progress-label'>
                        {sent} of {total} sent ({pct}%)
                      </span>
                    </div>

                    <div className='campaign-meta'>
                      <span>{c.stepCount || 1} step(s)</span>
                      {c.listName && <span>List: {c.listName}</span>}
                      <span className='chip chip-pending'>
                        {pending} waiting
                      </span>
                      <span className='chip chip-sent'>{sent} sent</span>
                      {failed > 0 && (
                        <span className='chip chip-failed'>
                          {failed} failed
                        </span>
                      )}
                      {cancelled > 0 && (
                        <span className='chip'>{cancelled} stopped</span>
                      )}
                      <span>limit {c.dailyLimit || 0}/day</span>
                      <span>
                        warm-up {c.warmupEnabled ? 'on' : 'off'}
                      </span>
                      <span>{scheduleSummary(c.schedule)}</span>
                    </div>
                  </div>
                  <div className='campaign-actions'>
                    <button
                      className='btn-ghost'
                      onClick={() => openCampaignView(c)}
                    >
                      ⊙ View
                    </button>
                    {/* Copy the same campaign config to another list (draft). */}
                    <select
                      className='btn-ghost'
                      value=''
                      disabled={campaignActionId === c._id || !lists.length}
                      title='Copy this campaign to another list'
                      onChange={(e) => {
                        if (e.target.value)
                          duplicateCampaignToList(c, e.target.value)
                        e.target.value = ''
                      }}
                    >
                      <option value=''>⧉ Copy to list…</option>
                      {lists.map((l) => (
                        <option key={l._id} value={l._id}>
                          {l.name} ({l.leadCount} leads)
                        </option>
                      ))}
                    </select>
                    {c.status === 'draft' && (
                      <>
                        <button
                          className='btn-start'
                          disabled={campaignActionId === c._id}
                          onClick={() => campaignAction(c._id, 'start')}
                        >
                          {campaignActionId === c._id
                            ? 'Starting…'
                            : '▶ Start'}
                        </button>
                        <button
                          className='btn-ghost'
                          disabled={campaignActionId === c._id}
                          onClick={() => navigate(`/campaigns/${c._id}/edit`)}
                        >
                          Edit
                        </button>
                        <button
                          className='btn-stop'
                          disabled={campaignActionId === c._id}
                          onClick={() => deleteCampaign(c)}
                        >
                          Delete
                        </button>
                      </>
                    )}
                    {c.status === 'running' && (
                      <>
                        <button
                          className='btn-ghost'
                          disabled={campaignActionId === c._id}
                          onClick={() => campaignAction(c._id, 'pause')}
                        >
                          ❚❚ Pause
                        </button>
                        <button
                          className='btn-stop'
                          disabled={campaignActionId === c._id}
                          onClick={() => campaignAction(c._id, 'stop')}
                        >
                          ■ Stop
                        </button>
                      </>
                    )}
                    {c.status === 'paused' && (
                      <>
                        <button
                          className='btn-start'
                          disabled={campaignActionId === c._id}
                          onClick={() => campaignAction(c._id, 'resume')}
                        >
                          {campaignActionId === c._id
                            ? 'Resuming…'
                            : '▶ Resume'}
                        </button>
                        <button
                          className='btn-stop'
                          disabled={campaignActionId === c._id}
                          onClick={() => campaignAction(c._id, 'stop')}
                        >
                          ■ Stop
                        </button>
                      </>
                    )}
                    {(c.status === 'stopped' ||
                      c.status === 'completed') && (
                      <>
                        <button
                          className='btn-start'
                          disabled={campaignActionId === c._id}
                          onClick={() => campaignAction(c._id, 'reopen')}
                        >
                          {campaignActionId === c._id
                            ? 'Restarting…'
                            : '↻ Restart'}
                        </button>
                        <button
                          className='btn-stop'
                          disabled={campaignActionId === c._id}
                          onClick={() => deleteCampaign(c)}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
