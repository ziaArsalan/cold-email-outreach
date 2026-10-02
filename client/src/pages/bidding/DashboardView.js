import React from 'react'
import { useApp } from '../../context/AppContext'
import { pct, numOrNA, money, DATE_PRESETS } from '../../utils'
import { KpiCard, KpiGrid, BreakdownTable } from './Kpi'
import { Bars, Lines } from './charts'

const r0 = (v) => (v == null ? 0 : Math.round(v * 1000) / 10) // rate → % number

const REC_COLOR = {
  warn: 'rgba(239,68,68,0.15)',
  suggest: 'rgba(245,158,11,0.15)',
  good: 'rgba(34,197,94,0.15)',
  info: 'rgba(59,130,246,0.15)',
}

export default function DashboardView() {
  const {
    bidAnalytics,
    bidAnalyticsLoading,
    analyticsRange,
    changeAnalyticsRange,
    recommendations,
  } = useApp()

  const a = bidAnalytics
  const k = a && a.kpis

  // Cumulative revenue vs connects series from the weekly data.
  const cumulative = []
  if (a && a.weekly) {
    let cr = 0
    let cc = 0
    for (const w of a.weekly) {
      cr += w.revenue || 0
      cc += w.connects || 0
      cumulative.push({ week: w.week, revenue: cr, connects: cc })
    }
  }

  const bvo = a && a.boostedVsOrganic
  const rateCompare = bvo
    ? [
        { name: 'View rate', Boosted: r0(bvo.boosted.viewRate), Organic: r0(bvo.organic.viewRate) },
        { name: 'Reply rate', Boosted: r0(bvo.boosted.replyRate), Organic: r0(bvo.organic.replyRate) },
        { name: 'Hire rate', Boosted: r0(bvo.boosted.hireRate), Organic: r0(bvo.organic.hireRate) },
      ]
    : []

  const laneRevenue = a ? a.byLane.map((l) => ({ key: l.key, Revenue: l.revenue })) : []
  const laneHireRate = a ? a.byLane.map((l) => ({ key: l.key, 'Hire rate %': r0(l.hireRate) })) : []

  return (
    <div>
      {/* Date filter */}
      <div
        className='card'
        style={{ background: 'var(--bg-alt)', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}
      >
        <strong style={{ marginRight: '0.5rem' }}>Range:</strong>
        <select value={analyticsRange.preset} onChange={(e) => changeAnalyticsRange({ preset: e.target.value })}>
          {DATE_PRESETS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        {analyticsRange.preset === 'Custom' && (
          <>
            <input type='date' value={analyticsRange.from || ''} onChange={(e) => changeAnalyticsRange({ from: e.target.value })} />
            <span style={{ color: 'var(--muted)' }}>to</span>
            <input type='date' value={analyticsRange.to || ''} onChange={(e) => changeAnalyticsRange({ to: e.target.value })} />
          </>
        )}
      </div>

      {bidAnalyticsLoading ? (
        <div className='card loading-card'>
          <div className='spinner' />
          <p>Loading analytics…</p>
        </div>
      ) : !a || a.totalProposals === 0 ? (
        <div className='card' style={{ textAlign: 'center', padding: '2rem' }}>
          <p style={{ color: 'var(--muted)' }}>No proposals in this range yet.</p>
        </div>
      ) : (
        <>
          {/* Recommendations */}
          {recommendations && recommendations.length > 0 && (
            <div className='card' style={{ marginTop: '1rem' }}>
              <h4 style={{ marginTop: 0 }}>Recommendations</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {recommendations.map((rec, i) => (
                  <div
                    key={i}
                    style={{
                      background: REC_COLOR[rec.level] || REC_COLOR.info,
                      borderRadius: 8,
                      padding: '0.6rem 0.8rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: '1rem',
                    }}
                  >
                    <span>{rec.message}</span>
                    <span style={{ color: 'var(--muted)', fontSize: 12, whiteSpace: 'nowrap' }}>
                      n = {rec.sampleSize}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* KPI cards */}
          <h3 style={{ margin: '1.25rem 0 0.5rem' }}>Key metrics</h3>
          <KpiGrid>
            <KpiCard label='Total proposals' value={a.totalProposals} />
            <KpiCard label='Connects used' value={k.connects} />
            <KpiCard label='Boost Connects' value={k.boostConnects} />
            <KpiCard label='Views' value={k.views} sub={`View rate ${pct(k.viewRate)}`} />
            <KpiCard label='Replies' value={k.replies} sub={`Reply rate ${pct(k.replyRate)}`} />
            <KpiCard label='Interviews' value={k.interviews} sub={`Interview rate ${pct(k.interviewRate)}`} />
            <KpiCard label='Offers' value={k.offers} />
            <KpiCard label='Hires' value={k.hires} sub={`Hire rate ${pct(k.hireRate)}`} />
            <KpiCard label='Revenue' value={money(k.revenue)} />
            <KpiCard label='Revenue / proposal' value={money(k.revenuePerProposal)} />
            <KpiCard label='Revenue / Connect' value={numOrNA(k.revenuePerConnect)} />
            <KpiCard label='Cost / view' value={numOrNA(k.costPerView)} sub='Connects' />
            <KpiCard label='Cost / reply' value={numOrNA(k.costPerReply)} sub='Connects' />
            <KpiCard label='Cost / interview' value={numOrNA(k.costPerInterview)} sub='Connects' />
            <KpiCard label='Cost / hire' value={numOrNA(k.costPerHire)} sub='Connects' />
          </KpiGrid>

          {/* Charts */}
          <h3 style={{ margin: '1.5rem 0 0.5rem' }}>Trends</h3>
          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
            <Lines
              title='Funnel by week'
              data={a.weekly}
              xKey='week'
              lines={[
                { key: 'proposals', name: 'Proposals' },
                { key: 'views', name: 'Views' },
                { key: 'replies', name: 'Replies' },
                { key: 'hires', name: 'Hires' },
              ]}
            />
            <Lines title='Connects spent by week' data={a.weekly} xKey='week' lines={[{ key: 'connects', name: 'Connects' }]} />
            <Lines
              title='Cumulative revenue vs Connects'
              data={cumulative}
              xKey='week'
              lines={[
                { key: 'revenue', name: 'Revenue' },
                { key: 'connects', name: 'Connects' },
              ]}
            />
            <Bars title='Boosted vs Organic (rates %)' data={rateCompare} xKey='name' bars={[{ key: 'Boosted', name: 'Boosted', color: '#fbbf24' }, { key: 'Organic', name: 'Organic', color: '#60a5fa' }]} />
            <Bars title='Revenue by service lane' data={laneRevenue} xKey='key' bars={[{ key: 'Revenue', name: 'Revenue', color: '#34d399' }]} />
            <Bars title='Hire rate by service lane (%)' data={laneHireRate} xKey='key' bars={[{ key: 'Hire rate %', name: 'Hire rate %', color: '#a78bfa' }]} />
          </div>

          {/* Boosted vs Organic + lane tables */}
          <h3 style={{ margin: '1.5rem 0 0.5rem' }}>Boosted vs Organic</h3>
          <div className='card'>
            <BreakdownTable
              keyLabel='Type'
              rows={[
                { key: 'Boosted', ...bvo.boosted },
                { key: 'Organic', ...bvo.organic },
              ]}
            />
          </div>

          <h3 style={{ margin: '1.5rem 0 0.5rem' }}>Service lane performance</h3>
          <div className='card'>
            <BreakdownTable keyLabel='Lane' rows={a.byLane} />
          </div>
        </>
      )}
    </div>
  )
}
