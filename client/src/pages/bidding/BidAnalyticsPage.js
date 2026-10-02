import React from 'react'
import { useApp } from '../../context/AppContext'
import DashboardView from './DashboardView'
import ProposalsView from './ProposalsView'
import ConnectsView from './ConnectsView'
import BudgetsView from './BudgetsView'
import ReportsView from './ReportsView'
import SettingsView from './SettingsView'

const TABS = [
  ['dashboard', 'Dashboard'],
  ['proposals', 'Proposals'],
  ['connects', 'Connects'],
  ['budgets', 'Budgets'],
  ['reports', 'Reports'],
  ['settings', 'Settings'],
]

// Bid Analytics — a single sidebar entry hosting all sub-views via internal
// tabs. Add/edit/detail for a proposal are separate routes (ProposalForm /
// ProposalDetail); this shell owns everything else.
export default function BidAnalyticsPage() {
  const { bidTab, setBidTab } = useApp()
  const active = bidTab || 'dashboard'

  return (
    <div className='tab-content'>
      <div className='page-header'>
        <h1>Bid Analytics</h1>
        <p>
          Internal Upwork proposal analytics — manual entry only. No scraping,
          no automation, no stored Upwork credentials.
        </p>
      </div>

      <div
        style={{
          display: 'flex',
          gap: '0.25rem',
          flexWrap: 'wrap',
          borderBottom: '1px solid rgba(148,163,184,0.2)',
          marginBottom: '1rem',
        }}
      >
        {TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setBidTab(key)}
            className='btn-ghost'
            style={{
              borderRadius: 0,
              borderBottom: active === key ? '2px solid var(--accent, #60a5fa)' : '2px solid transparent',
              color: active === key ? 'var(--text, #e2e8f0)' : 'var(--muted)',
              fontWeight: active === key ? 600 : 400,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {active === 'dashboard' && <DashboardView />}
      {active === 'proposals' && <ProposalsView />}
      {active === 'connects' && <ConnectsView />}
      {active === 'budgets' && <BudgetsView />}
      {active === 'reports' && <ReportsView />}
      {active === 'settings' && <SettingsView />}
    </div>
  )
}
