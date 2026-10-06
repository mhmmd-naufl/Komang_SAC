import { useState, useEffect, useCallback } from 'react'
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react'
import { cn } from '../utils/helpers'

/* ------------------------------------------------------------------ */
/* Store (module-level, simple pub/sub)                                */
/* ------------------------------------------------------------------ */

let items = []
const listeners = new Set()
let nextId = 1

function emit() {
  const snapshot = [...items]
  listeners.forEach((fn) => fn(snapshot))
}

function dismiss(id) {
  items = items.filter((t) => t.id !== id)
  emit()
}

function push({ title, message, type = 'info', duration = 5000 }) {
  const id = nextId++
  items = [...items, { id, title, message, type }]
  emit()
  if (duration > 0) setTimeout(() => dismiss(id), duration)
  return id
}

/** Public API */
export const toast = Object.assign(push, {
  success: (title, message, opts) => push({ title, message, type: 'success', ...opts }),
  error: (title, message, opts) => push({ title, message, type: 'error', ...opts }),
  warning: (title, message, opts) => push({ title, message, type: 'warning', ...opts }),
  info: (title, message, opts) => push({ title, message, type: 'info', ...opts }),
})

/* ------------------------------------------------------------------ */
/* Toast item                                                          */
/* ------------------------------------------------------------------ */

const STYLES = {
  success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  error: 'bg-rose-50 border-rose-200 text-rose-800',
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
  info: 'bg-blue-50 border-blue-200 text-blue-800',
}

const ICONS = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
}

function ToastItem({ item }) {
  const [leaving, setLeaving] = useState(false)
  const Icon = ICONS[item.type] || Info

  const close = useCallback(() => {
    setLeaving(true)
    setTimeout(() => dismiss(item.id), 200)
  }, [item.id])

  return (
    <div
      role="alert"
      className={cn(
        'pointer-events-auto flex items-start gap-3 p-4 rounded-xl border shadow-lg max-w-sm w-full transition-all duration-200',
        STYLES[item.type],
        leaving ? 'opacity-0 translate-x-4' : 'opacity-100'
      )}
    >
      <Icon className="h-5 w-5 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{item.title}</p>
        {item.message && <p className="text-sm mt-0.5 opacity-90">{item.message}</p>}
      </div>
      <button
        onClick={close}
        className="flex-shrink-0 p-1 rounded hover:bg-black/10 transition-colors"
        aria-label="Tutup notifikasi"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Toaster                                                             */
/* ------------------------------------------------------------------ */

export function Toaster() {
  const [list, setList] = useState(items)

  useEffect(() => {
    listeners.add(setList)
    return () => listeners.delete(setList)
  }, [])

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none">
      {list.map((item) => (
        <ToastItem key={item.id} item={item} />
      ))}
    </div>
  )
}
