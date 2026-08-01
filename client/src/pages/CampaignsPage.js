import React from 'react'
import { useApp } from '../context/AppContext'
import { WEEKDAYS, scheduleSummary } from '../utils'

export default function CampaignsPage() {
  const {
    campaigns,
    fetchCampaigns,
    openCampaignView,
    campaignActionId,
    campaignAction,
    duplicateCampaignToList,
    openEditCampaign,
    deleteCampaign,
    editingCampaignId,
    createCampaign,
    newCampaign,
    setNewCampaign,
    templates,
    lists,
    updateFollowup,
    removeFollowup,
    addFollowup,
    toggleCampaignMailbox,
    mailboxes,
    toggleCampaignDay,
    campaignBusy,
    cancelEditCampaign,
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
          <button className='btn-ghost' onClick={fetchCampaigns}>
            ↻ Refresh
          </button>
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
                          onClick={() => openEditCampaign(c)}
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

      {/* New / edit campaign */}
      <div className='card'>
        <h2>{editingCampaignId ? 'Edit Campaign' : 'New Campaign'}</h2>
        <form onSubmit={createCampaign}>
          <div className='settings-fields-grid'>
            <div className='control-group'>
              <label>Name</label>
              <input
                type='text'
                value={newCampaign.name}
                onChange={(e) =>
                  setNewCampaign((c) => ({ ...c, name: e.target.value }))
                }
                placeholder='Q3 SaaS founders'
                required
              />
            </div>
            <div className='control-group'>
              <label>Template (Step 1 — Initial email)</label>
              <select
                value={newCampaign.templateId}
                onChange={(e) =>
                  setNewCampaign((c) => ({
                    ...c,
                    templateId: e.target.value,
                  }))
                }
              >
                <option value=''>Select a template…</option>
                {templates.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className='control-group'>
              <label>List</label>
              <select
                value={newCampaign.listId}
                onChange={(e) =>
                  setNewCampaign((c) => ({
                    ...c,
                    listId: e.target.value,
                  }))
                }
              >
                <option value=''>No list (all new leads)</option>
                {lists.map((l) => (
                  <option key={l._id} value={l._id}>
                    {l.name} ({l.leadCount} leads)
                  </option>
                ))}
              </select>
            </div>
            <div className='control-group full-width'>
              <label>Follow-up steps (optional)</label>
              {newCampaign.steps.length === 0 ? (
                <span className='field-note'>
                  No follow-ups. Add one to send a sequence after the
                  initial email.
                </span>
              ) : (
                newCampaign.steps.map((s, i) => (
                  <div key={i} className='checkbox-row'>
                    <span className='field-note'>Step {i + 2}</span>
                    <select
                      value={s.templateId}
                      onChange={(e) =>
                        updateFollowup(i, { templateId: e.target.value })
                      }
                    >
                      <option value=''>Select a template…</option>
                      {templates.map((t) => (
                        <option key={t._id} value={t._id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    <span className='field-note'>wait</span>
                    <input
                      type='number'
                      min='0'
                      style={{ width: '5rem' }}
                      value={s.delayDays}
                      onChange={(e) =>
                        updateFollowup(i, { delayDays: e.target.value })
                      }
                    />
                    <span className='field-note'>days</span>
                    <button
                      type='button'
                      className='btn-ghost'
                      onClick={() => removeFollowup(i)}
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
              <button
                type='button'
                className='btn-ghost'
                onClick={addFollowup}
                disabled={!newCampaign.templateId}
              >
                + Add follow-up
              </button>
            </div>
            <div className='control-group'>
              <label>Daily Limit</label>
              <input
                type='number'
                min='0'
                value={newCampaign.dailyLimit}
                onChange={(e) =>
                  setNewCampaign((c) => ({
                    ...c,
                    dailyLimit: e.target.value,
                  }))
                }
              />
              <span className='field-note'>0 = unlimited</span>
            </div>
            <div className='control-group'>
              <label>Warm-up</label>
              <label className='checkbox-row'>
                <input
                  type='checkbox'
                  checked={newCampaign.warmupEnabled}
                  onChange={(e) =>
                    setNewCampaign((c) => ({
                      ...c,
                      warmupEnabled: e.target.checked,
                    }))
                  }
                />
                Enable warm-up ramp
              </label>
            </div>
            <div className='control-group full-width'>
              <label>AI Prompt (optional)</label>
              <textarea
                className='settings-textarea'
                rows={12}
                value={newCampaign.aiPrompt}
                onChange={(e) =>
                  setNewCampaign((c) => ({
                    ...c,
                    aiPrompt: e.target.value,
                  }))
                }
                placeholder='Extra instructions for the personalized intro…'
              />
            </div>
            <div className='control-group full-width'>
              <label>Mailboxes</label>
              {mailboxes.length === 0 ? (
                <span className='field-note'>
                  No mailboxes configured.
                </span>
              ) : (
                <div className='checkbox-list'>
                  {mailboxes.map((m) => (
                    <label key={m._id} className='checkbox-row'>
                      <input
                        type='checkbox'
                        checked={newCampaign.mailboxIds.includes(m._id)}
                        onChange={() => toggleCampaignMailbox(m._id)}
                      />
                      {m.email}
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className='control-group full-width'>
              <label>Schedule Days</label>
              <div className='day-toggle-row'>
                {WEEKDAYS.map((d) => (
                  <button
                    type='button'
                    key={d}
                    className={
                      newCampaign.days.includes(d)
                        ? 'day-toggle active'
                        : 'day-toggle'
                    }
                    onClick={() => toggleCampaignDay(d)}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <div className='control-group'>
              <label>Start Time</label>
              <input
                type='time'
                value={newCampaign.startTime}
                onChange={(e) =>
                  setNewCampaign((c) => ({
                    ...c,
                    startTime: e.target.value,
                  }))
                }
              />
            </div>
            <div className='control-group'>
              <label>End Time</label>
              <input
                type='time'
                value={newCampaign.endTime}
                onChange={(e) =>
                  setNewCampaign((c) => ({
                    ...c,
                    endTime: e.target.value,
                  }))
                }
              />
            </div>
          </div>
          <div
            style={{
              marginTop: '1.25rem',
              display: 'flex',
              gap: '0.5rem',
            }}
          >
            <button
              className='btn-start'
              type='submit'
              disabled={campaignBusy || !newCampaign.name.trim()}
            >
              {campaignBusy
                ? 'Saving…'
                : editingCampaignId
                  ? 'Save Changes'
                  : '+ Create Campaign'}
            </button>
            {editingCampaignId && (
              <button
                className='btn-ghost'
                type='button'
                onClick={cancelEditCampaign}
                disabled={campaignBusy}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
