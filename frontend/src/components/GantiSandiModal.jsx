import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { authApi } from '../services/api'
import { toast } from './Toast'
import Modal, { Field } from './AdminUi'
import { cn } from '../utils/helpers'

/**
 * Modal "Ganti Sandi" untuk user yang sedang login (semua peran).
 * Meminta sandi lama supaya sesi yang dipinjam/dicuri tidak bisa mengunci
 * pemilik akun. Salah sandi lama dibalas 400 oleh backend (bukan 401, karena
 * 401 memicu logout otomatis di interceptor api.js).
 */
export default function GantiSandiModal({ open, onClose }) {
  const [lama, setLama] = useState('')
  const [baru, setBaru] = useState('')
  const [ulang, setUlang] = useState('')
  const [errors, setErrors] = useState({})
  const [simpan, setSimpan] = useState(false)

  const kosongkan = () => {
    setLama('')
    setBaru('')
    setUlang('')
    setErrors({})
  }

  const tutup = () => {
    if (simpan) return
    kosongkan()
    onClose()
  }

  const kirim = async () => {
    const e = {}
    if (!lama) e.lama = 'Sandi saat ini wajib diisi'
    if (baru.length < 6) e.baru = 'Minimal 6 karakter'
    else if (baru === lama) e.baru = 'Sandi baru harus berbeda dari sandi saat ini'
    if (ulang !== baru) e.ulang = 'Pengulangan sandi tidak sama'
    setErrors(e)
    if (Object.keys(e).length > 0) return

    setSimpan(true)
    try {
      await authApi.changePassword(lama, baru)
      toast.success('Sandi diganti', 'Pakai sandi baru saat masuk berikutnya.')
      kosongkan()
      onClose()
    } catch (err) {
      const pesan = err.friendlyMessage || err.message
      if (err.response?.status === 400) setErrors({ lama: pesan })
      else toast.error('Gagal mengganti sandi', pesan)
    } finally {
      setSimpan(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={tutup}
      title="Ganti Sandi"
      lebar="max-w-md"
      description="Masukkan sandi saat ini, lalu sandi baru yang hanya kamu yang tahu."
      footer={
        <div className="flex gap-3">
          <button onClick={tutup} className="btn-secondary flex-1" disabled={simpan}>
            Batal
          </button>
          <button onClick={kirim} className="btn-primary flex-1" disabled={simpan}>
            {simpan && <Loader2 className="h-4 w-4 animate-spin" />}
            Simpan Sandi
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Sandi saat ini" required error={errors.lama}>
          <input
            type="password"
            value={lama}
            onChange={(e) => setLama(e.target.value)}
            className={cn('input', errors.lama && 'input-error')}
            autoComplete="current-password"
          />
        </Field>
        <Field label="Sandi baru" required error={errors.baru} hint="Minimal 6 karakter.">
          <input
            type="password"
            value={baru}
            onChange={(e) => setBaru(e.target.value)}
            className={cn('input', errors.baru && 'input-error')}
            autoComplete="new-password"
          />
        </Field>
        <Field label="Ulangi sandi baru" required error={errors.ulang}>
          <input
            type="password"
            value={ulang}
            onChange={(e) => setUlang(e.target.value)}
            className={cn('input', errors.ulang && 'input-error')}
            autoComplete="new-password"
          />
        </Field>
      </div>
    </Modal>
  )
}
