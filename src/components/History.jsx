import { useMemo, useState } from 'react'
import { prettyDate } from '../dates'
import { formatAmount } from '../storage'

const monthLabel = (ym) =>
  new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

export default function History({ history, onDelete }) {
  const [month, setMonth] = useState('all')

  const months = useMemo(
    () => [...new Set(history.map((h) => h.paidOn.slice(0, 7)))].sort().reverse(),
    [history]
  )
  const rows = month === 'all' ? history : history.filter((h) => h.paidOn.startsWith(month))
  const sorted = [...rows].sort((a, b) => b.paidOn.localeCompare(a.paidOn))
  const total = rows.reduce((sum, h) => sum + (h.amount || 0), 0)

  const byCategory = rows.reduce((acc, h) => {
    acc[h.category] = (acc[h.category] || 0) + (h.amount || 0)
    return acc
  }, {})

  if (!history.length) {
    return <p className="empty">No expenses recorded yet. Use “Mark paid” on a payment to log it here.</p>
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

      <div className="cat-summary">
        {Object.entries(byCategory)
          .sort((a, b) => b[1] - a[1])
          .map(([cat, amt]) => (
            <div key={cat} className="cat">
              <span>{cat}</span>
              <strong>{formatAmount(amt)}</strong>
            </div>
          ))}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Paid on</th>
              <th>Payment</th>
              <th>Category</th>
              <th>Was due</th>
              <th className="num">Amount</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sorted.map((h) => (
              <tr key={h.id}>
                <td>{prettyDate(h.paidOn)}</td>
                <td>{h.name}</td>
                <td>{h.category}</td>
                <td>{prettyDate(h.dueDate)}</td>
                <td className="num">{formatAmount(h.amount)}</td>
                <td>
                  <button className="ghost small" onClick={() => onDelete(h.id)} title="Remove entry">
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
