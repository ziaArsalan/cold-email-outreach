import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import {
  PROPOSAL_STATUSES,
  PROPOSAL_STATUS_LABELS,
  fmtDay,
  trunc,
} from '../../utils'
import StatusChip from './StatusChip'

// Proposals workspace: search / filter / sort / paginate the list. The lane
// manager now lives in the Settings sub-tab. Add/edit/detail are separate routes.
export default function ProposalsView() {
  const navigate = useNavigate()
  const {
    proposals,
    proposalsLoading,
    lanes,
    proposalFilters,
    changeProposalFilter,
    sortProposals,
    fetchProposals,
    deleteProposal,
    setBidTab,
  } = useApp()

  const [searchDraft, setSearchDraft] = useState(proposalFilters.q || '')

  const go = (path) => {
    setBidTab('proposals')
    navigate(path)
  }

  const onSearch = (e) => {
    e.preventDefault()
    changeProposalFilter({ q: searchDraft.trim() })
  }

  const SortTh = ({ field, children }) => {
    const active = proposalFilters.sort === field
    return (
      <th style={{ cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => sortProposals(field)}>
        {children}
        {active ? (proposalFilters.dir === 'asc' ? ' ▲' : ' ▼') : ''}
      </th>
    )
  }

  return (
    <div className='card table-card'>
      <div
        className='bulk-actions'
        style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}
      >
        <form onSubmit={onSearch} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type='text'
            placeholder='Search job, client, category…'
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            style={{ minWidth: 220 }}
          />
          <select value={proposalFilters.status} onChange={(e) => changeProposalFilter({ status: e.target.value })}>
            <option value=''>All statuses</option>
            {PROPOSAL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PROPOSAL_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <select value={proposalFilters.lane} onChange={(e) => changeProposalFilter({ lane: e.target.value })}>
            <option value=''>All lanes</option>
            {lanes.map((l) => (
              <option key={l._id} value={l.name}>
                {l.name}
                {l.archived ? ' (archived)' : ''}
              </option>
            ))}
          </select>
          <select value={proposalFilters.type} onChange={(e) => changeProposalFilter({ type: e.target.value })}>
            <option value=''>Organic + Boosted</option>
            <option value='ORGANIC'>Organic</option>
            <option value='BOOSTED'>Boosted</option>
          </select>
          <button className='btn-ghost' type='submit'>
            Search
          </button>
        </form>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className='btn-ghost' onClick={() => fetchProposals()}>
            ↻ Refresh
          </button>
          <button className='btn-start' onClick={() => go('/bid-analytics/new')}>
            + Add Proposal
          </button>
        </div>
      </div>

      {proposalsLoading ? (
        <div className='loading-card'>
          <div className='spinner' />
          <p>Loading proposals…</p>
        </div>
      ) : proposals.items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
          <p style={{ color: 'var(--muted)' }}>
            {proposalFilters.q || proposalFilters.status || proposalFilters.lane || proposalFilters.type
              ? 'No proposals match these filters.'
              : 'No proposals yet. Add your first one to start tracking the funnel.'}
          </p>
          <button className='btn-start' onClick={() => go('/bid-analytics/new')}>
            + Add Proposal
          </button>
        </div>
      ) : (
        <>
          <div className='table-wrapper' style={{ marginTop: '0.75rem' }}>
            <table>
              <thead>
                <tr>
                  <SortTh field='submittedAt'>Submitted</SortTh>
                  <th>Job</th>
                  <SortTh field='serviceLane'>Lane</SortTh>
                  <th>Type</th>
                  <SortTh field='connectsUsed'>Connects</SortTh>
                  <SortTh field='proposalStatus'>Status</SortTh>
                  <SortTh field='contractValue'>Value</SortTh>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {proposals.items.map((p) => (
                  <tr key={p._id} style={{ cursor: 'pointer' }} onClick={() => go(`/bid-analytics/${p._id}`)}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDay(p.submittedAt)}</td>
                    <td title={p.jobTitle}>{trunc(p.jobTitle, 44)}</td>
                    <td>{p.serviceLane}</td>
                    <td>
                      <span
                        className='status-badge'
                        style={{
                          background:
                            p.proposalType === 'BOOSTED' ? 'rgba(245,158,11,0.18)' : 'rgba(148,163,184,0.18)',
                        }}
                      >
                        {p.proposalType === 'BOOSTED' ? 'Boosted' : 'Organic'}
                      </span>
                    </td>
                    <td>
                      {p.connectsUsed || 0}
                      {p.boostConnects ? ` (+${p.boostConnects})` : ''}
                    </td>
                    <td>
                      <StatusChip status={p.proposalStatus} />
                    </td>
                    <td>
                      {p.contractValue != null && p.contractValue !== ''
                        ? `${p.contractCurrency || 'USD'} ${Number(p.contractValue).toLocaleString()}`
                        : '—'}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button className='btn-ghost' onClick={() => go(`/bid-analytics/${p._id}/edit`)}>
                          Edit
                        </button>
                        <button className='btn-stop' onClick={() => deleteProposal(p)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem' }}>
            <span style={{ color: 'var(--muted)', fontSize: 13 }}>
              {proposals.total} proposal{proposals.total === 1 ? '' : 's'} · page {proposals.page} of {proposals.pages}
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className='btn-ghost' disabled={proposals.page <= 1} onClick={() => changeProposalFilter({ page: proposals.page - 1 })}>
                ← Prev
              </button>
              <button className='btn-ghost' disabled={proposals.page >= proposals.pages} onClick={() => changeProposalFilter({ page: proposals.page + 1 })}>
                Next →
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
