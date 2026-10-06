import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Inbox, Loader2, X } from 'lucide-react'
import { cn } from '../utils/helpers'

/**
 * Shell modal untuk form admin.
 *
 * Menutup dengan Escape atau klik area gelap, dan memusatkan fokus ke dialog
 * supaya keyboard user tidak terjebak di halaman di belakang. Scroll body
 * dikunci selama modal terbuka supaya halaman belakang tidak ikut bergeser.
 */
export default function Modal({ open, onClose, title, description, children, footer, lebar = 'max-w-lg' }) {
  const dialogRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined

    const overflowAwal = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const timer = setTimeout(() => {
      const fokusable = dialogRef.current?.querySelector(
        'input:not([type=hidden]), select, textarea, button',
      )
      fokusable?.focus()
    }, 60)

    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)

    return () => {
      clearTimeout(timer)
      document.body.style.overflow = overflowAwal
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade-in" onClick={onClose} />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative w-full bg-white rounded-2xl shadow-xl animate-slide-up flex flex-col max-h-[90vh]',
          lebar,
        )}
      >
        <div className="flex items-start gap-4 border-b border-slate-100 p-5">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold text-slate-900">{title}</h3>
            {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Tutup"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">{children}</div>

        {footer && <div className="border-t border-slate-100 p-5">{footer}</div>}
      </div>
    </div>
  )
}

/** Baris label + input. Dipakai seragam di semua form admin. */
export function Field({ label, required, error, hint, children, className }) {
  return (
    <div className={className}>
      <label className="label">
        {label}
        {required && <span className="text-rose-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  )
}

/** Dialog konfirmasi untuk aksi yang tidak bisa dibatalkan (hapus, nonaktif). */
export function KonfirmasiDialog({ open, onClose, onKonfirmasi, judul, pesan, labelKonfirmasi = 'Hapus' }) {
  const [sibuk, setSibuk] = useState(false)
  if (!open) return null

  const jalankan = async () => {
    setSibuk(true)
    try {
      await onKonfirmasi()
    } finally {
      setSibuk(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={judul}
      lebar="max-w-md"
      footer={
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1" disabled={sibuk}>
            Batal
          </button>
          <button onClick={jalankan} className="btn-danger flex-1" disabled={sibuk}>
            {sibuk && <Loader2 className="h-4 w-4 animate-spin" />}
            {labelKonfirmasi}
          </button>
        </div>
      }
    >
      <div className="flex gap-4">
        <div className="h-10 w-10 shrink-0 rounded-xl bg-rose-50 flex items-center justify-center">
          <AlertCircle className="h-5 w-5 text-rose-600" />
        </div>
        <p className="text-sm text-slate-600 pt-2">{pesan}</p>
      </div>
    </Modal>
  )
}

/** Placeholder tabel saat sedang memuat. */
export function Memuat({ baris = 6 }) {
  return (
    <div className="p-8 space-y-3" aria-busy="true" aria-label="Memuat data">
      {Array.from({ length: Math.min(baris, 6) }).map((_, i) => (
        <div
          key={i}
          className="h-9 animate-pulse rounded-lg bg-slate-100"
          style={{ animationDelay: `${i * 90}ms` }}
        />
      ))}
    </div>
  )
}

/** Tabel gagal memuat, dengan tombol coba lagi. */
export function GagalMuat({ pesan, onCobaLagi }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <div className="h-12 w-12 rounded-2xl bg-rose-50 flex items-center justify-center">
        <AlertCircle className="h-6 w-6 text-rose-600" />
      </div>
      <div>
        <p className="font-semibold text-slate-900">Gagal memuat data</p>
        <p className="mt-1 text-sm text-slate-500">{pesan}</p>
      </div>
      {onCobaLagi && (
        <button onClick={onCobaLagi} className="btn-secondary mt-1">
          Coba lagi
        </button>
      )}
    </div>
  )
}

/** Tabel kosong, dengan pesan yang menyesuaikan filter aktif. */
export function Kosong({ judul = 'Belum ada data', pesan, action }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center">
        <Inbox className="h-6 w-6 text-slate-400" />
      </div>
      <div>
        <p className="font-semibold text-slate-900">{judul}</p>
        {pesan && <p className="mt-1 text-sm text-slate-500 max-w-sm">{pesan}</p>}
      </div>
      {action}
    </div>
  )
}

/** Lencana aktif / nonaktif. */
export function BadgeAktif({ aktif }) {
  return <span className={aktif ? 'badge-received' : 'badge-canceled'}>{aktif ? 'Aktif' : 'Nonaktif'}</span>
}

/** Tombol tambah di header kartu, supaya keempat halaman konsisten. */
export function TombolTambah({ onClick, children = 'Tambah' }) {
  return (
    <button onClick={onClick} className="btn-primary">
      <span aria-hidden="true">+</span>
      {children}
    </button>
  )
}