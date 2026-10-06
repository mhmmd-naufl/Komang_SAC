import { useEffect, useRef, useState } from 'react'
import { LogOut, ShieldAlert, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { cn } from '../utils/helpers'

/**
 * Konfirmasi logout.
 *
 * Untuk admin dan teknisi: harus mengetik KELUAR. Alasannya praktis, bukan
 * sandera -- HP dipakai bareng di outlet, dan logout tidak sengaja berarti
 * pekerjaan yang sedang jalan hilang dari layar orang berikutnya.
 *
 * Konsumen dan drop point cukup menekan tombol, karena tidak memegang data
 * sensitif di perangkatnya.
 */

const KATA_KONFIRMASI = 'KELUAR'
const PERAN_KETAT = ['admin', 'technician']

export default function LogoutConfirm({ open, onClose }) {
  const { user, logout } = useAuth()
  const [teks, setTeks] = useState('')
  const inputRef = useRef(null)

  const ketat = PERAN_KETAT.includes(user?.role)

  useEffect(() => {
    if (!open) {
      setTeks('')
      return undefined
    }
    // Fokuskan input supaya bisa langsung mengetik (biar tidak perlu klik dulu).
    const t = setTimeout(() => inputRef.current?.focus(), 60)
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

  const boleh = !ketat || teks.trim().toUpperCase() === KATA_KONFIRMASI

  const konfirmasi = () => {
    if (!boleh) return
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
          <div
            className={cn(
              'h-12 w-12 rounded-2xl flex items-center justify-center mb-4',
              ketat ? 'bg-rose-50' : 'bg-slate-100'
            )}
          >
            {ketat ? (
              <ShieldAlert className="h-6 w-6 text-rose-600" />
            ) : (
              <LogOut className="h-6 w-6 text-slate-600" />
            )}
          </div>

          <h3 id="logout-judul" className="text-lg font-bold text-slate-900">
            Yakin keluar dari akun?
          </h3>

          <p className="text-sm text-slate-600 mt-2">
            Kamu masuk sebagai <span className="font-medium text-slate-800">{user?.full_name}</span>
            {' '}({user?.phone}). Kalau HP ini dipakai bersama, pastikan tidak ada pekerjaan
            yang belum disimpan.
          </p>

          {ketat && (
            <div className="mt-5">
              <label htmlFor="logout-konfirmasi" className="label">
                Ketik <span className="font-bold text-rose-600">{KATA_KONFIRMASI}</span> untuk melanjutkan
              </label>
              <input
                id="logout-konfirmasi"
                ref={inputRef}
                type="text"
                value={teks}
                onChange={(e) => setTeks(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && konfirmasi()}
                className={cn(
                  'input font-medium',
                  teks.length > 0 && !boleh && 'input-error'
                )}
                placeholder={KATA_KONFIRMASI}
                autoComplete="off"
                autoCapitalize="characters"
              />
              {teks.length > 0 && !boleh && (
                <p className="text-xs text-rose-600 mt-1.5">
                  Tulis persis {KATA_KONFIRMASI} (huruf besar).
                </p>
              )}
            </div>
          )}

          <div className="mt-6 flex gap-3">
            <button onClick={onClose} className="btn-secondary flex-1">
              Batal, tetap di sini
            </button>
            <button
              onClick={konfirmasi}
              disabled={!boleh}
              className={cn('flex-1', ketat ? 'btn-danger' : 'btn-primary')}
            >
              <LogOut className="h-4 w-4" />
              Keluar
            </button>
          </div>

          {ketat && (
            <p className="text-[11px] text-slate-500 mt-4 text-center">
              Verifikasi ekstra ini hanya untuk admin dan teknisi.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
