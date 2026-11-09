import { useState } from 'react'
import { FREQUENCIES, todayISO } from '../dates'
import { CATEGORIES } from '../storage'

const empty = () => ({
  name: '',
  category: 'Utilities',
  amount: '',
  dueDate: todayISO(),
  frequency: 'monthly',
  remindDays: 3,
  lastPaidOn: '',
  notes: '',
})

export default function PaymentForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(() =>
    initial
      ? {
          ...initial,
          amount: initial.amount ?? '',
          dueDate: initial.dueDate ?? todayISO(),
          lastPaidOn: initial.lastPaidOn ?? '',
        }
      : empty()
  )
  const once = form.frequency === 'once'
  const [paid, setPaid] = useState(false)
  const [paidOn, setPaidOn] = useState(todayISO())
  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value })

  const submit = (e) => {
    e.preventDefault()
    if (!form.name.trim() || (!once && !form.dueDate)) return
    onSave({
      ...form,
      name: form.name.trim(),
      amount: form.amount === '' ? null : Number(form.amount),
      // One-time payments have no next due date.
      dueDate: once ? null : form.dueDate,
      remindDays: Number(form.remindDays) || 0,
      lastPaidOn: form.lastPaidOn || null,
    }, paid ? paidOn : null)
  }

  return (
    <form className="card form" onSubmit={submit}>
      <h2>{initial ? 'Edit payment' : 'Add payment'}</h2>
      <div className="grid">
        <label>
          Name *
          <input value={form.name} onChange={set('name')} placeholder="e.g. WiFi, Car EMI" required autoFocus />
        </label>
        <label>
          Category
          <select value={form.category} onChange={set('category')}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Amount (optional)
          <input type="number" min="0" step="0.01" value={form.amount} onChange={set('amount')} placeholder="₹" />
        </label>
        <label>
          Repeats
          <select value={form.frequency} onChange={set('frequency')}>
            {Object.entries(FREQUENCIES).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {once ? 'Next due date (not for one-time)' : 'Next due date *'}
          {once ? (
            <input type="text" value="—" disabled />
          ) : (
            <input type="date" value={form.dueDate} onChange={set('dueDate')} required />
          )}
        </label>
        <label>
          Paid?
          <select value={paid ? 'yes' : 'no'} onChange={(e) => setPaid(e.target.value === 'yes')}>
            <option value="no">No</option>
            <option value="yes">Yes — add to expenses</option>
          </select>
        </label>
        {paid ? (
          <label>
            Paid on *
            <input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} required />
          </label>
        ) : (
          <label>
            Last paid on (optional)
            <input type="date" value={form.lastPaidOn} onChange={set('lastPaidOn')} />
          </label>
        )}
        <label>
          Remind me (days before)
          <input type="number" min="0" max="60" value={form.remindDays} onChange={set('remindDays')} />
        </label>
        <label className="full">
          Notes
          <input value={form.notes} onChange={set('notes')} placeholder="Policy no., account, etc." />
        </label>
      </div>
      <div className="actions">
        <button type="button" className="ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit">Save</button>
      </div>
    </form>
  )
}
