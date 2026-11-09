import { useRef, useState } from 'react'
import PaymentForm from './components/PaymentForm'
import PaymentList from './components/PaymentList'
import History from './components/History'
import Analysis from './components/Analysis'
import { useStore, formatAmount } from './storage'
import { daysUntil, prettyDate, todayISO } from './dates'
import { useTheme } from './theme'

export default function App() {
  const store = useStore()
  const { payments, history } = store
  const [theme, toggleTheme] = useTheme()
  const [tab, setTab] = useState('payments')
  const [editing, setEditing] = useState(null) // null | 'new' | payment
  const [importError, setImportError] = useState('')
  const fileRef = useRef()

  const next = payments.filter((p) => p.dueDate).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]
  const thisMonth = todayISO().slice(0, 7)
  const upcoming30 = payments
    .filter((p) => p.dueDate && daysUntil(p.dueDate) <= 30)
    .reduce((s, p) => s + (p.amount || 0), 0)
  const spentThisMonth = history
    .filter((h) => h.paidOn.startsWith(thisMonth))
    .reduce((s, h) => s + (h.amount || 0), 0)

  // paidOn is set when the form's "Paid?" is Yes: log the expense right away.
  const save = (p, paidOn) => {
    const saved = store.savePayment(p)
    if (paidOn) store.markPaid(saved, saved.amount, paidOn)
    setEditing(null)
  }

  const exportJSON = () => {
    const blob = new Blob([store.exportData()], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `payment-reminder-backup-${todayISO()}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const importJSON = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    try {
      store.importData(await file.text())
      setImportError('')
    } catch (err) {
      setImportError(`Import failed: ${err.message}`)
    }
    e.target.value = ''
  }

  return (
    <div className="app">
      <header>
        <h1>🔔 Payment Reminder</h1>
        <div className="header-actions">
          <button
            className="ghost theme-toggle"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button className="ghost" onClick={exportJSON}>Export</button>
          <button className="ghost" onClick={() => fileRef.current.click()}>Import</button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={importJSON} />
        </div>
      </header>
      {importError && <p className="error">{importError}</p>}
      {store.error && (
        <p className="error">
          {store.error}{' '}
          <button className="ghost small" onClick={store.clearError}>Dismiss</button>
        </p>
      )}
      {store.loading && <p className="muted">Loading from Google Sheets…</p>}

      <section className="stats">
        <div className="stat">
          <span>Next payment</span>
          <strong>{next ? next.name : '—'}</strong>
          <small>{next ? `${prettyDate(next.dueDate)} · ${formatAmount(next.amount)}` : ''}</small>
        </div>
        <div className="stat">
          <span>Spent this month</span>
          <strong>{formatAmount(spentThisMonth)}</strong>
        </div>
      </section>

      <nav className="tabs">
        <button className={tab === 'payments' ? 'active' : ''} onClick={() => setTab('payments')}>
          Upcoming payments
        </button>
        <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
          Expense history ({history.length})
        </button>
        <button className={tab === 'analysis' ? 'active' : ''} onClick={() => setTab('analysis')}>
          Analysis
        </button>
      </nav>

      {tab === 'payments' && (
        <section>
          {editing ? (
            <PaymentForm
              key={editing === 'new' ? 'new' : editing.id}
              initial={editing === 'new' ? null : editing}
              onSave={save}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <button className="add" onClick={() => setEditing('new')}>+ Add payment</button>
          )}
          <PaymentList
            payments={payments}
            onEdit={setEditing}
            onDelete={store.deletePayment}
            onPaid={store.markPaid}
          />
        </section>
      )}

      {tab === 'history' && <History history={history} onDelete={store.deleteHistory} />}

      {tab === 'analysis' && <Analysis history={history} />}
    </div>
  )
}
