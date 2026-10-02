import React from 'react'
import { PROPOSAL_STATUS_LABELS } from '../../utils'

// Translucent status chip colored by funnel stage — self-contained so it works
// on the dark theme without new global CSS.
const COLORS = {
  DRAFT: ['rgba(148,163,184,0.18)', '#cbd5e1'],
  SUBMITTED: ['rgba(59,130,246,0.18)', '#93c5fd'],
  VIEWED: ['rgba(14,165,233,0.18)', '#7dd3fc'],
  CLIENT_REPLIED: ['rgba(99,102,241,0.2)', '#a5b4fc'],
  INTERVIEW: ['rgba(168,85,247,0.2)', '#d8b4fe'],
  OFFER: ['rgba(245,158,11,0.2)', '#fcd34d'],
  HIRED: ['rgba(34,197,94,0.2)', '#86efac'],
  DECLINED: ['rgba(239,68,68,0.18)', '#fca5a5'],
  CLIENT_HIRED_OTHER: ['rgba(239,68,68,0.14)', '#fca5a5'],
  NO_RESPONSE: ['rgba(148,163,184,0.16)', '#cbd5e1'],
  WITHDRAWN: ['rgba(148,163,184,0.16)', '#cbd5e1'],
  ARCHIVED: ['rgba(100,116,139,0.16)', '#94a3b8'],
}

export default function StatusChip({ status }) {
  const [bg, fg] = COLORS[status] || COLORS.DRAFT
  return (
    <span
      className='status-badge'
      style={{ background: bg, color: fg, whiteSpace: 'nowrap' }}
    >
      {PROPOSAL_STATUS_LABELS[status] || status}
    </span>
  )
}
