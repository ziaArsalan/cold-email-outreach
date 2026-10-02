import React, { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import { fmtDay } from '../../utils'
import StatusChip from './StatusChip'

// A labelled value row; renders '—' when empty.
const Field = ({ label, value }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
    <span style={{ color: 'var(--muted)', fontSize: 12 }}>{label}</span>
    <span>{value === undefined || value === null || value === '' ? '—' : value}</span>
  </div>
)

// The funnel stages in order, each mapped to its timestamp field.
const FUNNEL = [
  ['Submitted', 'submittedAt'],
  ['Viewed', 'viewedAt'],
  ['Client replied', 'repliedAt'],
  ['Interview', 'interviewAt'],
  ['Offer', 'offerAt'],
  ['Hired', 'hiredAt'],
]

// One-click funnel actions (status buttons).
const ACTIONS = [
  ['Mark viewed', 'VIEWED'],
  ['Mark replied', 'CLIENT_REPLIED'],
  ['Mark interview', 'INTERVIEW'],
  ['Mark offer', 'OFFER'],
  ['Mark hired', 'HIRED'],
  ['No response', 'NO_RESPONSE'],
  ['Archive', 'ARCHIVED'],
]

export default function ProposalDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const {
    proposalDetail,
    proposalDetailLoading,
    fetchProposal,
    markProposalStatus,
    deleteProposal,
  } = useApp()

  useEffect(() => {
    fetchProposal(id)
  }, [id])

  const p = proposalDetail && proposalDetail._id === id ? proposalDetail : null

  if (proposalDetailLoading || !p) {
    return (
      <div className='tab-content'>
        <div className='page-header'>
          <button className='btn-ghost' onClick={() => navigate('/bid-analytics')}>
            ← Back to Bid Analytics
          </button>
          <h1>Proposal</h1>
        </div>
        <div className='card loading-card'>
          <div className='spinner' />
          <p>Loading proposal…</p>
        </div>
      </div>
    )
  }

  const connects = Number(p.connectsUsed || 0)
  const revenue = Number(p.contractValue || 0)
  const revPerConnect =
    connects > 0 && p.contractValue != null
      ? `${p.contractCurrency || 'USD'} ${(revenue / connects).toFixed(2)}`
      : 'N/A'

  return (
    <div className='tab-content'>
      <div className='page-header'>
        <button className='btn-ghost' onClick={() => navigate('/bid-analytics')}>
          ← Back to Bid Analytics
        </button>
        <h1 style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {p.jobTitle} <StatusChip status={p.proposalStatus} />
        </h1>
        <p>
          {p.serviceLane} ·{' '}
          {p.proposalType === 'BOOSTED' ? 'Boosted' : 'Organic'} · submitted{' '}
          {fmtDay(p.submittedAt)}
        </p>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <button className='btn-start' onClick={() => navigate(`/bid-analytics/${id}/edit`)}>
          Edit
        </button>
        <button className='btn-stop' onClick={() => deleteProposal(p)}>
          Delete
        </button>
      </div>

      {/* One-click funnel transitions */}
      <div className='card' style={{ background: 'var(--bg-alt)' }}>
        <h4 style={{ marginTop: 0 }}>Update status</h4>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {ACTIONS.map(([label, status]) => (
            <button
              key={status}
              className='btn-ghost'
              disabled={p.proposalStatus === status}
              onClick={() => markProposalStatus(id, status)}
            >
              {label}
            </button>
          ))}
        </div>
        <p className='field-note' style={{ marginTop: '0.5rem' }}>
          Marking viewed/replied/interview/offer/hired stamps that stage's date
          if it isn't already set.
        </p>
      </div>

      {/* Funnel timeline */}
      <div className='card' style={{ marginTop: '1rem' }}>
        <h4 style={{ marginTop: 0 }}>Funnel timeline</h4>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem' }}>
          {FUNNEL.map(([label, key]) => (
            <div key={key} style={{ minWidth: 110 }}>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>{label}</div>
              <div style={{ fontWeight: p[key] ? 600 : 400, opacity: p[key] ? 1 : 0.5 }}>
                {fmtDay(p[key])}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ROI metrics */}
      <div className='card' style={{ marginTop: '1rem' }}>
        <h4 style={{ marginTop: 0 }}>ROI</h4>
        <div className='settings-fields-grid'>
          <Field label='Connects used' value={connects} />
          <Field label='Boost Connects' value={p.boostConnects || 0} />
          <Field
            label='Contract value'
            value={
              p.contractValue != null && p.contractValue !== ''
                ? `${p.contractCurrency || 'USD'} ${revenue.toLocaleString()}`
                : '—'
            }
          />
          <Field label='Revenue per Connect' value={revPerConnect} />
        </div>
      </div>

      {/* Job + client + content */}
      <div className='card' style={{ marginTop: '1rem' }}>
        <h4 style={{ marginTop: 0 }}>Job</h4>
        <div className='settings-fields-grid'>
          <Field label='Job category' value={p.jobCategory} />
          <Field label='Job type' value={p.jobType} />
          <Field label='Budget type' value={p.budgetType} />
          <Field
            label='Job budget'
            value={
              p.jobBudgetMin || p.jobBudgetMax
                ? `${p.jobBudgetMin ?? '?'} – ${p.jobBudgetMax ?? '?'}`
                : '—'
            }
          />
          <Field label='Hourly rate bid' value={p.hourlyRateBid} />
          <Field label='Fixed price bid' value={p.fixedPriceBid} />
          <Field label='Job posted at' value={fmtDay(p.jobPostedAt)} />
          <Field
            label='Required skills'
            value={(p.requiredSkills || []).join(', ')}
          />
          <Field
            label='Job URL'
            value={
              p.jobUrl ? (
                <a href={p.jobUrl} target='_blank' rel='noreferrer'>
                  Open job ↗
                </a>
              ) : (
                '—'
              )
            }
          />
        </div>
      </div>

      <div className='card' style={{ marginTop: '1rem' }}>
        <h4 style={{ marginTop: 0 }}>Client</h4>
        <div className='settings-fields-grid'>
          <Field label='Client name' value={p.clientName} />
          <Field label='Country' value={p.clientCountry} />
          <Field label='Total spent' value={p.clientTotalSpent} />
          <Field
            label='Hire rate'
            value={p.clientHireRate != null ? `${p.clientHireRate}%` : '—'}
          />
          <Field
            label='Payment verified'
            value={
              p.clientHasVerifiedPayment === true
                ? 'Yes'
                : p.clientHasVerifiedPayment === false
                  ? 'No'
                  : '—'
            }
          />
        </div>
      </div>

      <div className='card' style={{ marginTop: '1rem' }}>
        <h4 style={{ marginTop: 0 }}>Proposal</h4>
        <div className='settings-fields-grid'>
          <Field label='Profile title used' value={p.profileTitleUsed} />
          <Field label='Template' value={p.proposalTemplate} />
          <Field label='Portfolio item' value={p.portfolioItemShared} />
          <Field label='Follow-up date' value={fmtDay(p.followUpDate)} />
          <Field label='Contract type' value={p.contractType} />
          <Field label='Lost reason' value={p.lostReason} />
        </div>
        {p.proposalOpening && (
          <div style={{ marginTop: '1rem' }}>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>Proposal opening</div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{p.proposalOpening}</div>
          </div>
        )}
        {p.notes && (
          <div style={{ marginTop: '1rem' }}>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>Notes</div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{p.notes}</div>
          </div>
        )}
      </div>
    </div>
  )
}
