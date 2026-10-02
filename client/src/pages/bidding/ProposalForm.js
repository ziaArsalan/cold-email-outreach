import React, { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import { PROPOSAL_STATUSES, PROPOSAL_STATUS_LABELS } from '../../utils'

// Add / edit a proposal — nested routes (/bid-analytics/new, /bid-analytics/:id/edit).
// On an edit route we hydrate the shared form from the list, or fetch the single
// proposal on a hard refresh. Saving returns to the list.
export default function ProposalForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const {
    lanes,
    proposals,
    proposalForm,
    setProposalForm,
    proposalBusy,
    proposalDetail,
    openNewProposal,
    openEditProposal,
    closeProposalForm,
    saveProposal,
    fetchProposal,
    fetchLanes,
  } = useApp()

  const isEdit = !!id

  // Ensure lanes are loaded (for the dropdown) on a direct visit / refresh.
  useEffect(() => {
    if (!lanes.length) fetchLanes()
  }, [])

  // Hydrate the form to match the route.
  useEffect(() => {
    if (!isEdit) {
      if (!proposalForm || proposalForm._id) openNewProposal()
      return
    }
    if (proposalForm && proposalForm._id === id) return
    const inList = proposals.items.find((p) => p._id === id)
    if (inList) {
      openEditProposal(inList)
    } else if (proposalDetail && proposalDetail._id === id) {
      openEditProposal(proposalDetail)
    } else {
      fetchProposal(id)
    }
  }, [id, proposals.items, proposalDetail])

  const notReady = !proposalForm || (isEdit && proposalForm._id !== id)

  const set = (k, v) => setProposalForm((f) => ({ ...f, [k]: v }))

  const onSubmit = async (e) => {
    const ok = await saveProposal(e)
    if (ok) navigate('/bid-analytics')
  }
  const onCancel = () => {
    closeProposalForm()
    navigate('/bid-analytics')
  }

  const activeLanes = lanes.filter(
    (l) => !l.archived || l.name === (proposalForm && proposalForm.serviceLane),
  )

  return (
    <div className='tab-content'>
      <div className='page-header'>
        <button className='btn-ghost' onClick={onCancel}>
          ← Back to Bid Analytics
        </button>
        <h1>{isEdit ? 'Edit Proposal' : 'Add Proposal'}</h1>
        <p>Internal analytics data — entered manually. No Upwork automation.</p>
      </div>

      {notReady ? (
        <div className='card loading-card'>
          <div className='spinner' />
          <p>Loading proposal…</p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className='card' style={{ background: 'var(--bg-alt)' }}>
          {/* ── Job ── */}
          <h4 style={{ marginTop: 0 }}>Job</h4>
          <div className='settings-fields-grid'>
            <div className='control-group'>
              <label>Job title *</label>
              <input
                value={proposalForm.jobTitle}
                onChange={(e) => set('jobTitle', e.target.value)}
                placeholder='Build a GoHighLevel automation'
                required
              />
            </div>
            <div className='control-group'>
              <label>Service lane *</label>
              <select
                value={proposalForm.serviceLane}
                onChange={(e) => set('serviceLane', e.target.value)}
                required
              >
                <option value=''>Select a lane…</option>
                {activeLanes.map((l) => (
                  <option key={l._id} value={l.name}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            <div className='control-group'>
              <label>Job category</label>
              <input
                value={proposalForm.jobCategory}
                onChange={(e) => set('jobCategory', e.target.value)}
                placeholder='Automation & Integrations'
              />
            </div>
            <div className='control-group full-width'>
              <label>Job URL</label>
              <input
                type='url'
                value={proposalForm.jobUrl}
                onChange={(e) => set('jobUrl', e.target.value)}
                placeholder='https://www.upwork.com/jobs/...'
              />
              <span className='field-note'>Optional — must be a valid URL if entered.</span>
            </div>
            <div className='control-group'>
              <label>Date submitted</label>
              <input
                type='date'
                value={proposalForm.submittedAt}
                onChange={(e) => set('submittedAt', e.target.value)}
              />
            </div>
            <div className='control-group'>
              <label>Job posted at</label>
              <input
                type='date'
                value={proposalForm.jobPostedAt}
                onChange={(e) => set('jobPostedAt', e.target.value)}
              />
              <span className='field-note'>For the time-to-apply report.</span>
            </div>
            <div className='control-group'>
              <label>Job type</label>
              <input
                value={proposalForm.jobType}
                onChange={(e) => set('jobType', e.target.value)}
                placeholder='Ongoing / one-time'
              />
            </div>
            <div className='control-group'>
              <label>Budget type</label>
              <select
                value={proposalForm.budgetType}
                onChange={(e) => set('budgetType', e.target.value)}
              >
                <option value='UNKNOWN'>Unknown</option>
                <option value='FIXED'>Fixed price</option>
                <option value='HOURLY'>Hourly</option>
              </select>
            </div>
            <div className='control-group'>
              <label>Job budget min</label>
              <input
                type='number'
                value={proposalForm.jobBudgetMin}
                onChange={(e) => set('jobBudgetMin', e.target.value)}
              />
            </div>
            <div className='control-group'>
              <label>Job budget max</label>
              <input
                type='number'
                value={proposalForm.jobBudgetMax}
                onChange={(e) => set('jobBudgetMax', e.target.value)}
              />
            </div>
            <div className='control-group full-width'>
              <label>Required skills</label>
              <input
                value={proposalForm.requiredSkills}
                onChange={(e) => set('requiredSkills', e.target.value)}
                placeholder='GoHighLevel, Make, API integration'
              />
              <span className='field-note'>Comma-separated.</span>
            </div>
          </div>

          {/* ── Bid & Connects ── */}
          <h4>Bid &amp; Connects</h4>
          <div className='settings-fields-grid'>
            <div className='control-group'>
              <label>Proposal type</label>
              <select
                value={proposalForm.proposalType}
                onChange={(e) => set('proposalType', e.target.value)}
              >
                <option value='ORGANIC'>Organic</option>
                <option value='BOOSTED'>Boosted</option>
              </select>
            </div>
            <div className='control-group'>
              <label>Connects used</label>
              <input
                type='number'
                min='0'
                value={proposalForm.connectsUsed}
                onChange={(e) => set('connectsUsed', e.target.value)}
              />
            </div>
            <div className='control-group'>
              <label>Boost Connects</label>
              <input
                type='number'
                min='0'
                value={proposalForm.boostConnects}
                onChange={(e) => set('boostConnects', e.target.value)}
              />
              <span className='field-note'>Cannot exceed total Connects used.</span>
            </div>
            <div className='control-group'>
              <label>Hourly rate bid</label>
              <input
                type='number'
                value={proposalForm.hourlyRateBid}
                onChange={(e) => set('hourlyRateBid', e.target.value)}
              />
            </div>
            <div className='control-group'>
              <label>Fixed price bid</label>
              <input
                type='number'
                value={proposalForm.fixedPriceBid}
                onChange={(e) => set('fixedPriceBid', e.target.value)}
              />
            </div>
          </div>

          {/* ── Client ── */}
          <h4>Client</h4>
          <div className='settings-fields-grid'>
            <div className='control-group'>
              <label>Client name</label>
              <input
                value={proposalForm.clientName}
                onChange={(e) => set('clientName', e.target.value)}
              />
            </div>
            <div className='control-group'>
              <label>Client country</label>
              <input
                value={proposalForm.clientCountry}
                onChange={(e) => set('clientCountry', e.target.value)}
              />
            </div>
            <div className='control-group'>
              <label>Client total spent</label>
              <input
                type='number'
                value={proposalForm.clientTotalSpent}
                onChange={(e) => set('clientTotalSpent', e.target.value)}
              />
            </div>
            <div className='control-group'>
              <label>Client hire rate (%)</label>
              <input
                type='number'
                min='0'
                max='100'
                value={proposalForm.clientHireRate}
                onChange={(e) => set('clientHireRate', e.target.value)}
              />
            </div>
            <div className='control-group'>
              <label>
                <input
                  type='checkbox'
                  checked={proposalForm.clientHasVerifiedPayment}
                  onChange={(e) =>
                    set('clientHasVerifiedPayment', e.target.checked)
                  }
                />{' '}
                Payment verified
              </label>
            </div>
          </div>

          {/* ── Proposal content ── */}
          <h4>Proposal content</h4>
          <div className='settings-fields-grid'>
            <div className='control-group'>
              <label>Profile title used</label>
              <input
                value={proposalForm.profileTitleUsed}
                onChange={(e) => set('profileTitleUsed', e.target.value)}
              />
            </div>
            <div className='control-group'>
              <label>Proposal template</label>
              <input
                value={proposalForm.proposalTemplate}
                onChange={(e) => set('proposalTemplate', e.target.value)}
              />
            </div>
            <div className='control-group'>
              <label>Portfolio item shared</label>
              <input
                value={proposalForm.portfolioItemShared}
                onChange={(e) => set('portfolioItemShared', e.target.value)}
              />
            </div>
            <div className='control-group full-width'>
              <label>Proposal opening</label>
              <textarea
                rows={4}
                value={proposalForm.proposalOpening}
                onChange={(e) => set('proposalOpening', e.target.value)}
              />
            </div>
          </div>

          {/* ── Status & outcome ── */}
          <h4>Status &amp; outcome</h4>
          <div className='settings-fields-grid'>
            <div className='control-group'>
              <label>Status</label>
              <select
                value={proposalForm.proposalStatus}
                onChange={(e) => set('proposalStatus', e.target.value)}
              >
                {PROPOSAL_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {PROPOSAL_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            {proposalForm.proposalStatus === 'HIRED' && (
              <div className='control-group'>
                <label>Hired date *</label>
                <input
                  type='date'
                  value={proposalForm.hiredAt || ''}
                  onChange={(e) => set('hiredAt', e.target.value)}
                />
              </div>
            )}
            <div className='control-group'>
              <label>Contract value</label>
              <input
                type='number'
                min='0'
                value={proposalForm.contractValue}
                onChange={(e) => set('contractValue', e.target.value)}
              />
            </div>
            <div className='control-group'>
              <label>Contract currency</label>
              <input
                value={proposalForm.contractCurrency}
                onChange={(e) => set('contractCurrency', e.target.value)}
              />
            </div>
            <div className='control-group'>
              <label>Contract type</label>
              <input
                value={proposalForm.contractType}
                onChange={(e) => set('contractType', e.target.value)}
              />
            </div>
            <div className='control-group'>
              <label>Follow-up date</label>
              <input
                type='date'
                value={proposalForm.followUpDate}
                onChange={(e) => set('followUpDate', e.target.value)}
              />
            </div>
            <div className='control-group full-width'>
              <label>Notes</label>
              <textarea
                rows={3}
                value={proposalForm.notes}
                onChange={(e) => set('notes', e.target.value)}
              />
            </div>
          </div>

          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
            <button className='btn-start' type='submit' disabled={proposalBusy}>
              {proposalBusy
                ? 'Saving…'
                : isEdit
                  ? 'Save Changes'
                  : '+ Add Proposal'}
            </button>
            <button
              className='btn-ghost'
              type='button'
              onClick={onCancel}
              disabled={proposalBusy}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
