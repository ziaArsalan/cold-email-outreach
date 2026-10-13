import React from 'react'
import { useApp } from '../../context/AppContext'
import MembersView from './MembersView'
import TasksView from './TasksView'
import RemindersView from './RemindersView'

const TABS = [
  ['members', 'Members'],
  ['tasks', 'Tasks'],
  ['reminders', 'Reminders'],
]

// Follow-ups — one sidebar entry hosting all sub-views via internal tabs.
// Member recurring-task tracking + WhatsApp reminders. (Unrelated to campaign
// follow-up email sequences despite the shared word.)
export default function FollowupsPage() {
  const { fuTab, setFuTab } = useApp()
  const active = fuTab || 'members'

  return (
    <div className='tab-content'>
      <div className='page-header'>
        <h1>Follow-ups</h1>
        <p>Track who still has pending recurring tasks and remind only them.</p>
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
            onClick={() => setFuTab(key)}
            className='btn-ghost'
            style={{
              borderRadius: 0,
              borderBottom:
                active === key ? '2px solid var(--accent, #60a5fa)' : '2px solid transparent',
              color: active === key ? 'var(--text, #e2e8f0)' : 'var(--muted)',
              fontWeight: active === key ? 600 : 400,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {active === 'members' && <MembersView />}
      {active === 'tasks' && <TasksView />}
      {active === 'reminders' && <RemindersView />}
    </div>
  )
}
