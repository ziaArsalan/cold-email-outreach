import React, { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { WEEKDAYS } from '../utils'

// New / edit campaign form — a nested route (/campaigns/new, /campaigns/:id/edit)
// off the Campaigns list. On an edit route it loads the target campaign into the
// shared form state; on the new route it resets to a blank form. Saving returns
// to the list.
export default function CampaignForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const {
    campaigns,
    editingCampaignId,
    openEditCampaign,
    cancelEditCampaign,
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
  } = useApp()

  // Sync the shared form state to the route: load the campaign on an edit route,
  // reset to blank on the new route. `campaigns` is loaded by the route-driven
  // fetch in AppContext, so on a hard refresh we wait for it to arrive.
  useEffect(() => {
    if (id) {
      if (editingCampaignId === id) return
      const c = campaigns.find((x) => x._id === id)
      if (c) openEditCampaign(c)
    } else {
      cancelEditCampaign()
    }
  }, [id, campaigns])

  const isEdit = !!id
  // On an edit route, don't render the form until the campaign is loaded.
  const notReady = isEdit && editingCampaignId !== id

  const onSubmit = async (e) => {
    const ok = await createCampaign(e)
    if (ok) navigate('/campaigns')
  }

  const onCancel = () => {
    cancelEditCampaign()
    navigate('/campaigns')
  }

  return (
    <div className='tab-content'>
      <div className='page-header'>
        <button className='btn-ghost' onClick={onCancel}>
          ← Back to Campaigns
        </button>
        <h1>{isEdit ? 'Edit Campaign' : 'New Campaign'}</h1>
        <p>Launch and control AI-personalized outreach</p>
      </div>

      {notReady ? (
        <div className='card loading-card'>
          <div className='spinner' />
          <p>Loading campaign…</p>
        </div>
      ) : (
        <div className='card'>
          <form onSubmit={onSubmit}>
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
                  : isEdit
                    ? 'Save Changes'
                    : '+ Create Campaign'}
              </button>
              <button
                className='btn-ghost'
                type='button'
                onClick={onCancel}
                disabled={campaignBusy}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
