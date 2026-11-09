import { useState } from 'react'
import { FREQUENCIES, daysUntil, dueLabel, nextDueDate, prettyDate, todayISO } from '../dates'
import { formatAmount } from '../storage'

function status(days, remindDays) {
  if (days == null) return 'ok'
  if (days < 0) return 'overdue'
  if (days <= remindDays) return 'soon'
  return 'ok'
}

function PaymentRow({ payment, onEdit, onDelete, onPaid }) {
  const [paying, setPaying] = useState(false)
  const [amount, setAmount] = useState(payment.amount ?? '')
  const [paidOn, setPaidOn] = useState(todayISO())
  const [confirmDelete, setConfirmDelete] = useState(false)

  const days = daysUntil(payment.dueDate)
  const st = status(days, payment.remindDays ?? 3)
  const next = nextDueDate(payment)

  return (
    <li className={`row ${st}`}>
      <div className="row-main">
        <div>
          <div className="name">{payment.name}</div>
          <div className="meta">
            <span className="chip">{payment.category}</span>
            <span>{FREQUENCIES[payment.frequency].label}</span>
            {payment.notes && <span className="notes">{payment.notes}</span>}
          </div>
        </div>
        <div className="amount">{formatAmount(payment.amount)}</div>
        <div className="due">
          <div className={`badge ${st}`}>{days == null ? 'No due date' : dueLabel(days)}</div>
          {payment.dueDate && <div className="date">{prettyDate(payment.dueDate)}</div>}
          <div className="then">
            {payment.lastPaidOn
              ? `Last paid ${prettyDate(payment.lastPaidOn)}${
                  payment.lastPaidAmount != null ? ` · ${formatAmount(payment.lastPaidAmount)}` : ''
                }`
              : 'Not paid yet'}
          </div>
        </div>
        <div className="row-actions">
          <button onClick={() => setPaying(!paying)}>Mark paid</button>
          <button className="ghost" onClick={onEdit}>Edit</button>
          {confirmDelete ? (
            <>
              <button className="danger" onClick={onDelete}>Confirm</button>
              <button className="ghost" onClick={() => setConfirmDelete(false)}>No</button>
            </>
          ) : (
            <button className="ghost" onClick={() => setConfirmDelete(true)}>Delete</button>
          )}
        </div>
      </div>
      {paying && (
        <form
          className="pay-form"
          onSubmit={(e) => {
            e.preventDefault()
            onPaid(amount, paidOn)
            setPaying(false)
          }}
        >
          <label>
            Amount paid
            <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="optional" />
          </label>
          <label>
            Paid on
            <input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} required />
          </label>
          <button type="submit">Confirm payment</button>
          <span className="hint">
            {next ? `Next due date moves to ${prettyDate(next)}` : 'One-time payment will be removed from the list'}
          </span>
        </form>
      )}
    </li>
  )
}

export default function PaymentList({ payments, onEdit, onDelete, onPaid }) {
  if (!payments.length) return <p className="empty">No payments yet. Add your first one above.</p>
  // Payments without a due date (one-time) go to the bottom.
  const sorted = [...payments].sort((a, b) =>
    !a.dueDate ? 1 : !b.dueDate ? -1 : a.dueDate.localeCompare(b.dueDate)
  )
  return (
    <ul className="list">
      {sorted.map((p) => (
        <PaymentRow
          key={p.id}
          payment={p}
          onEdit={() => onEdit(p)}
          onDelete={() => onDelete(p.id)}
          onPaid={(amount, paidOn) => onPaid(p, amount, paidOn)}
        />
      ))}
    </ul>
  )
}
