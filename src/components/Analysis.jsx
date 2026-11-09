import { useMemo, useState } from 'react'
import { CATEGORIES, formatAmount } from '../storage'

const monthLabel = (ym) =>
  new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

// Each category keeps a fixed color slot (never by rank); "Other" is neutral gray.
const colorFor = (category) => {
  const i = CATEGORIES.indexOf(category)
  return i >= 0 && category !== 'Other' ? `var(--series-${i + 1})` : 'var(--series-other)'
}

const pct = (v, total) => (total ? `${((v / total) * 100).toFixed(1)}%` : '0%')

function slicePath(cx, cy, r, a0, a1) {
  const x0 = cx + r * Math.cos(a0)
  const y0 = cy + r * Math.sin(a0)
  const x1 = cx + r * Math.cos(a1)
  const y1 = cy + r * Math.sin(a1)
  const large = a1 - a0 > Math.PI ? 1 : 0
  return `M${cx},${cy} L${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} Z`
}

function PieChart({ slices, total, active, setActive, selected, onSelect }) {
  const [tip, setTip] = useState(null)
  const size = 240
  const c = size / 2
  const r = c - 4
  let angle = -Math.PI / 2

  return (
    <div className="pie-wrap" onMouseLeave={() => { setTip(null); setActive(null) }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="pie" role="img" aria-label="Spending by category">
        {slices.map((s) => {
          const a0 = angle
          const a1 = angle + (s.value / total) * Math.PI * 2
          angle = a1
          const focus = active || selected
          const dim = focus && focus !== s.label
          const common = {
            fill: s.color,
            stroke: 'var(--card)',
            strokeWidth: 2,
            opacity: dim ? 0.35 : 1,
            onClick: () => onSelect(s.label),
            onMouseMove: (e) => {
              const box = e.currentTarget.ownerSVGElement.parentNode.getBoundingClientRect()
              setTip({ x: e.clientX - box.left, y: e.clientY - box.top, s })
              setActive(s.label)
            },
          }
          return slices.length === 1 ? (
            <circle key={s.label} cx={c} cy={c} r={r} {...common} />
          ) : (
            <path key={s.label} d={slicePath(c, c, r, a0, a1)} {...common} />
          )
        })}
      </svg>
      {tip && (
        <div className="tooltip" style={{ left: tip.x + 12, top: tip.y + 12 }}>
          <span className="swatch" style={{ background: tip.s.color }} />
          <strong>{tip.s.label}</strong>
          <div>{formatAmount(tip.s.value)} · {pct(tip.s.value, total)}</div>
        </div>
      )}
    </div>
  )
}

export default function Analysis({ history }) {
  const [month, setMonth] = useState('all')
  const [active, setActive] = useState(null)
  const [selected, setSelected] = useState(null)
  const toggle = (label) => setSelected((cur) => (cur === label ? null : label))

  const months = useMemo(
    () => [...new Set(history.map((h) => h.paidOn.slice(0, 7)))].sort().reverse(),
    [history]
  )
  const rows = month === 'all' ? history : history.filter((h) => h.paidOn.startsWith(month))
  const withAmount = rows.filter((h) => h.amount)
  const missing = rows.length - withAmount.length
  const total = withAmount.reduce((s, h) => s + h.amount, 0)

  const sumBy = (key) =>
    withAmount.reduce((acc, h) => {
      acc[h[key]] = (acc[h[key]] || 0) + h.amount
      return acc
    }, {})

  // Slices in fixed category order so neighbouring colors never change.
  const byCategory = sumBy('category')
  const slices = Object.keys(byCategory)
    .sort((a, b) => {
      const ia = CATEGORIES.includes(a) ? CATEGORIES.indexOf(a) : 99
      const ib = CATEGORIES.includes(b) ? CATEGORIES.indexOf(b) : 99
      return ia - ib
    })
    .map((label) => ({ label, value: byCategory[label], color: colorFor(label) }))

  // A clicked category filters the per-payment list; drop it if the period no longer has it.
  const category = slices.some((s) => s.label === selected) ? selected : null
  const paymentRows = category ? withAmount.filter((h) => h.category === category) : withAmount
  const byPayment = Object.entries(
    paymentRows.reduce((acc, h) => {
      acc[h.name] = (acc[h.name] || 0) + h.amount
      return acc
    }, {})
  ).sort((a, b) => b[1] - a[1])
  const paymentTotal = paymentRows.reduce((s, h) => s + h.amount, 0)
  const maxPayment = byPayment[0]?.[1] || 1

  if (!history.length) {
    return <p className="empty">No expenses yet. Mark a payment as paid to see the analysis.</p>
  }

  return (
    <div>
      <div className="history-head">
        <select value={month} onChange={(e) => setMonth(e.target.value)}>
          <option value="all">All time</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </select>
        <div className="total">
          Total spent: <strong>{formatAmount(total)}</strong>
        </div>
      </div>

      {total === 0 ? (
        <p className="empty">No amounts recorded for this period.</p>
      ) : (
        <div className="analysis">
          <div className="card">
            <h2>Spending by category</h2>
            <p className="muted hint-line">Click a slice to filter payments</p>
            <div className="pie-layout">
              <PieChart
                slices={slices}
                total={total}
                active={active}
                setActive={setActive}
                selected={category}
                onSelect={toggle}
              />
              <ul className="legend">
                {slices.map((s) => (
                  <li
                    key={s.label}
                    className={`${(active || category) && (active || category) !== s.label ? 'dim' : ''} ${category === s.label ? 'selected' : ''}`}
                    onClick={() => toggle(s.label)}
                    onMouseEnter={() => setActive(s.label)}
                    onMouseLeave={() => setActive(null)}
                  >
                    <span className="swatch" style={{ background: s.color }} />
                    <span className="legend-name">{s.label}</span>
                    <span className="legend-pct">{pct(s.value, total)}</span>
                    <span className="legend-amt">{formatAmount(s.value)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h2>
                Spending by payment
                {category && <span className="filter-tag">{category} · {formatAmount(paymentTotal)}</span>}
              </h2>
              <button className="ghost small" onClick={() => setSelected(null)} disabled={!category}>
                Show all
              </button>
            </div>
            <ul className="bars">
              {byPayment.map(([name, value]) => (
                <li key={name} title={`${name}: ${formatAmount(value)} (${pct(value, paymentTotal)})`}>
                  <span className="bar-name">{name}</span>
                  <span className="bar-track">
                    <span className="bar" style={{ width: `${(value / maxPayment) * 100}%` }} />
                  </span>
                  <span className="bar-amt">{formatAmount(value)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {missing > 0 && (
        <p className="muted">
          {missing} payment{missing > 1 ? 's' : ''} without an amount {missing > 1 ? 'are' : 'is'} not included.
        </p>
      )}
    </div>
  )
}
