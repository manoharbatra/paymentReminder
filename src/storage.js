import { useCallback, useEffect, useState } from 'react'
import { FREQUENCIES, addMonths, todayISO } from './dates'
import { api } from './api'

export const CATEGORIES = ['Utilities', 'Vehicle', 'Insurance', 'Loan / EMI', 'Subscription', 'Rent', 'Other']

export const uid = () => crypto.randomUUID()

export const formatAmount = (n) =>
  n == null || n === ''
    ? '—'
    : Number(n).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })

const toAmount = (v) => (v === '' || v == null ? null : Number(v))

export function useStore() {
  const [payments, setPayments] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api('getAll')
      setPayments(data.payments)
      setHistory(data.history)
    } catch (err) {
      setError(`Could not load data from Google Sheets: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  // The screen is already updated; save to the sheet, and resync if that fails.
  const sync = (action, data) =>
    api(action, data).catch((err) => {
      setError(`Save failed: ${err.message}. Data was reloaded from Google Sheets.`)
      reload()
    })

  // Returns the saved payment so callers can act on it (e.g. mark it paid).
  const savePayment = (p) => {
    const anchorDay = p.dueDate ? Number(p.dueDate.slice(8, 10)) : null
    const saved = p.id ? { ...p, anchorDay } : { ...p, anchorDay, id: uid(), createdAt: todayISO() }
    setPayments((list) =>
      list.some((x) => x.id === saved.id)
        ? list.map((x) => (x.id === saved.id ? saved : x))
        : [...list, saved]
    )
    sync('upsertPayment', saved)
    return saved
  }

  const deletePayment = (id) => {
    setPayments((list) => list.filter((x) => x.id !== id))
    sync('deletePayment', { id })
  }

  // Logs the payment as an expense and rolls the due date forward
  // (or removes it, for one-time payments).
  const markPaid = (payment, amountPaid, paidOn) => {
    const entry = {
      id: uid(),
      paymentId: payment.id,
      name: payment.name,
      category: payment.category,
      amount: toAmount(amountPaid),
      dueDate: payment.dueDate,
      paidOn,
    }
    const once = payment.frequency === 'once'
    const updated = once
      ? null
      : {
          ...payment,
          dueDate: addMonths(payment.dueDate, FREQUENCIES[payment.frequency].months, payment.anchorDay),
          lastPaidOn: paidOn,
          lastPaidAmount: toAmount(amountPaid),
        }

    setHistory((h) => [entry, ...h])
    setPayments((list) =>
      once ? list.filter((x) => x.id !== payment.id) : list.map((x) => (x.id === payment.id ? updated : x))
    )
    sync('markPaid', { history: entry, payment: updated, deletePaymentId: once ? payment.id : null })
  }

  const deleteHistory = (id) => {
    setHistory((h) => h.filter((x) => x.id !== id))
    sync('deleteHistory', { id })
  }

  const exportData = () => JSON.stringify({ payments, history }, null, 2)

  const importData = (json) => {
    const data = JSON.parse(json)
    if (!Array.isArray(data.payments) || !Array.isArray(data.history)) {
      throw new Error('File must contain "payments" and "history" arrays')
    }
    setPayments(data.payments)
    setHistory(data.history)
    sync('importAll', data)
  }

  return {
    payments,
    history,
    loading,
    error,
    clearError: () => setError(''),
    reload,
    savePayment,
    deletePayment,
    markPaid,
    deleteHistory,
    exportData,
    importData,
  }
}
