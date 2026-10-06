import { useEffect, useRef } from 'react'
import { LogOut, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

/**
 * Konfirmasi logout untuk semua peran.
 *
 * Sengaja sederhana: tombol "Batal" dan "Keluar", tanpa mengetik kata
 * sandera. Alasannya praktis -- HP dipakai bareng di outlet, jadi yang perlu
 * dicegah adalah logout tidak sengaja, dan itu sudah tertangani oleh dialog
 * konfirmasi. Menu di HP tidak bisa terklik tanpa sengaja.
 *
 * Tekan Escape atau klik area gelap untuk batal.
 */

export default function LogoutConfirm({ open, onClose }) {
  const { user, logout } = useAuth()
  const tombolKeluarRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    // Fokuskan tombol utama supaya Enter langsung jalan tanpa perlu klik dulu.
    const t = setTimeout(() => tombolKeluarRef.current?.focus(), 60)
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null

  const konfirmasi = () => {
    onClose()
    logout()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="logout-judul"
        className="relative w-full max-w-md bg-white rounded-2xl shadow-xl animate-slide-up"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Batal"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="p-6">
          <div className="h-12 w-12 rounded-2xl flex items-center justify-center mb-4 bg-primary-50">
            <LogOut className="h-6 w-6 text-primary-600" />
          </div>

          <h3 id="logout-judul" className="text-lg font-bold text-slate-900">
            Yakin keluar dari akun?
          </h3>

          <p className="text-sm text-slate-600 mt-2">
            Kamu masuk sebagai{' '}
            <span className="font-medium text-slate-800">{user?.full_name}</span>
            {user?.phone ? ` (${user.phone})` : ''}. Kalau HP ini dipakai bareng,
            pastikan tidak ada pekerjaan yang belum disimpan.
          </p>

          <div className="mt-6 flex gap-3">
            <button onClick={onClose} className="btn-secondary flex-1">
              Batal
            </button>
            <button ref={tombolKeluarRef} onClick={konfirmasi} className="btn-danger flex-1">
              <LogOut className="h-4 w-4" />
              Keluar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}