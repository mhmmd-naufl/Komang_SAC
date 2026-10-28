import { Copy, MessageCircle } from 'lucide-react'
import { toast } from '../Toast'
import Modal from '../AdminUi'

/** Tautan wa.me. Nomor harus tanpa tanda +, spasi, atau tanda hubung. */
function tautanWa(nomor, pesan) {
  const bersih = String(nomor || '').replace(/\D/g, '')
  return bersih ? `https://wa.me/${bersih}?text=${encodeURIComponent(pesan)}` : null
}

function susunPesan(akses) {
  const awal = akses.reset
    ? 'Sandi akun Komang SAC kamu sudah diatur ulang.'
    : 'Akun Komang SAC kamu sudah siap. Dengan akun ini kamu bisa melacak status sepatumu.'
  return [
    `Halo ${akses.nama},`,
    '',
    awal,
    '',
    `Nomor: ${akses.phone}`,
    `Sandi sementara: ${akses.password}`,
    '',
    `Masuk di: ${window.location.origin}/login`,
    'Setelah masuk, ganti sandimu lewat menu namamu di pojok kanan atas, lalu pilih Ganti Sandi.',
  ].join('\n')
}

/**
 * Ditampilkan admin sesudah membuat akun atau mengatur ulang sandi.
 * Sandi sementara hanya ada di layar ini: setelah ditutup, satu-satunya
 * jalan adalah Atur Ulang Password. Karena itu pesannya langsung siap
 * dikirim lewat WhatsApp.
 *
 * Props: akses = { nama, phone, password, reset? } atau null.
 */
export default function AksesAkunModal({ akses, onClose }) {
  if (!akses) return null

  const pesan = susunPesan(akses)
  const wa = tautanWa(akses.phone, pesan)

  const salin = async () => {
    try {
      await navigator.clipboard.writeText(pesan)
      toast.success('Pesan disalin', 'Tempel di WhatsApp untuk mengirimnya.')
    } catch {
      toast.error('Gagal menyalin', 'Salin manual dari kotak pesan.')
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={akses.reset ? 'Sandi Diatur Ulang' : 'Akun Dibuat'}
      lebar="max-w-md"
      description="Kirim akses ini ke pelanggan lewat WhatsApp."
      footer={
        <div className="flex flex-wrap gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">
            Tutup
          </button>
          <button onClick={salin} className="btn-secondary flex-1">
            <Copy className="h-4 w-4" />
            Salin
          </button>
          {wa && (
            <a href={wa} target="_blank" rel="noreferrer" className="btn-primary flex-1">
              <MessageCircle className="h-4 w-4" />
              Kirim via WhatsApp
            </a>
          )}
        </div>
      }
    >
      <div className="space-y-3">
        <pre className="whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm text-slate-800 font-sans">
          {pesan}
        </pre>
        <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
          Sandi ini hanya ditampilkan sekali. Kalau modal ditutup sebelum terkirim, atur ulang
          sandinya lewat tombol gembok di tabel pengguna.
        </p>
      </div>
    </Modal>
  )
}
