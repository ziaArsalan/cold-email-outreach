import React from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts'

// Shared palette (theme-agnostic, readable on the dark dashboard).
export const COLORS = ['#60a5fa', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#f87171']
const AXIS = '#94a3b8'
const GRID = 'rgba(148,163,184,0.15)'

const tooltipStyle = {
  background: '#0f172a',
  border: '1px solid rgba(148,163,184,0.3)',
  borderRadius: 8,
  color: '#e2e8f0',
  fontSize: 12,
}

// A titled chart card wrapper with a fixed, responsive height.
export function ChartCard({ title, children, height = 240 }) {
  return (
    <div className='card' style={{ background: 'var(--bg-alt)' }}>
      {title ? <h4 style={{ margin: '0 0 0.75rem' }}>{title}</h4> : null}
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>{children}</ResponsiveContainer>
      </div>
    </div>
  )
}

// A grouped/single bar chart. `bars` = [{ key, name, color }].
export function Bars({ title, data, xKey, bars, height }) {
  return (
    <ChartCard title={title} height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 4 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey={xKey} stroke={AXIS} tick={{ fontSize: 11 }} />
        <YAxis stroke={AXIS} tick={{ fontSize: 11 }} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {bars.map((b, i) => (
          <Bar key={b.key} dataKey={b.key} name={b.name} fill={b.color || COLORS[i % COLORS.length]} radius={[3, 3, 0, 0]} />
        ))}
      </BarChart>
    </ChartCard>
  )
}

// A multi-line chart. `lines` = [{ key, name, color }].
export function Lines({ title, data, xKey, lines, height }) {
  return (
    <ChartCard title={title} height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 4 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey={xKey} stroke={AXIS} tick={{ fontSize: 11 }} />
        <YAxis stroke={AXIS} tick={{ fontSize: 11 }} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {lines.map((l, i) => (
          <Line key={l.key} type='monotone' dataKey={l.key} name={l.name} stroke={l.color || COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />
        ))}
      </LineChart>
    </ChartCard>
  )
}
