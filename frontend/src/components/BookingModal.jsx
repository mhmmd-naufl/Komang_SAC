import { useState, useEffect } from 'react'
import { X, CheckCircle, Clock, User, Footprints, MapPin, MessageSquare } from 'lucide-react'
import { transactionsApi, dropPointsApi } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { toast } from './Toast'
import { formatRupiah, cn } from '../utils/helpers'

const TREATMENTS = [
  { value: 'Standar', label: 'Standar', desc: 'Cuci standar + pengeringan' },
  { value: 'Premium', label: 'Premium', desc: 'Cuci + pemutih + conditioning' },
  { value: 'Steri', label: 'Steri', desc: 'Cuci steril + anti bakteri' },
  { value: 'Waterproof', label: 'Waterproof', desc: 'Cuci + coating waterproof' },
]

const PAYMENTS = [
  { value: 'tunai', label: 'Tunai di tempat' },
  { value: 'transfer', label: 'Transfer Bank' },
  { value: 'qris', label: 'QRIS / E-Wallet' },
]

const FALLBACK_DROP_POINTS = [
  {
    id: 'fallback-outlet',
    nama: 'Outlet Utama',
    alamat: 'Jl. Cisadane No.3, Lingkungan Mojoroto R, Singonegaran, Kec. Banyuwangi',
  },
  {
    id: 'fallback-dolay',
    nama: 'Dolay Cut',
    alamat: 'Jl. Kyai Haji Wahid Hasyim No. 76, Kabupaten Banyuwangi',
  },
]

export default function BookingModal({ shoe, onClose, onSuccess }) {
  const { user, isAuthenticated } = useAuth()

  const [step, setStep] = useState(1) // 1: Form, 2: Konfirmasi, 3: Selesai
  const [shoeData, setShoeData] = useState(shoe)
  const [dropPoints, setDropPoints] = useState([])
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState({})
  const [bookingCode, setBookingCode] = useState(null)
  const [formData, setFormData] = useState({
    drop_point_id: '',
    treatment: shoe?.jenis_treatment || 'Standar',
    catatan: '',
    payment: 'tunai',
  })

  useEffect(() => {
    setShoeData(shoe)
    setFormData((prev) => ({ ...prev, treatment: shoe?.jenis_treatment || prev.treatment }))
  }, [shoe])

  useEffect(() => {
    let cancelled = false
    dropPointsApi
      .list({ aktif_only: true })
      .then(({ data }) => {
        if (!cancelled) setDropPoints(data.length ? data : FALLBACK_DROP_POINTS)
      })
      .catch(() => {
        if (!cancelled) setDropPoints(FALLBACK_DROP_POINTS)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }))
  }

  const validate = () => {
    const next = {}
    if (!shoeData?.id) next.shoe = 'Pilih layanan dulu dari katalog di halaman utama'
    if (!isAuthenticated) next.auth = 'Kamu harus masuk dulu untuk membuat booking'
    if (!formData.drop_point_id) next.drop_point_id = 'Pilih drop point'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return

    if (step === 1) {
      setStep(2)
      return
    }

    setLoading(true)
    try {
      const { data } = await transactionsApi.create({
        user_id: user.id,
        shoe_id: shoeData.id,
        drop_point_id: formData.drop_point_id.startsWith('fallback-') ? null : formData.drop_point_id,
        harga: shoeData.harga_cuci,
        catatan_konsumen: formData.catatan || null,
      })
      setBookingCode(data.kode)
      setStep(3)
      onSuccess?.()
    } catch (err) {
      toast.error('Booking gagal', err?.friendlyMessage || 'Terjadi kesalahan. Coba lagi.')
      setStep(1)
    } finally {
      setLoading(false)
    }
  }

  const selectedDropPoint = dropPoints.find((dp) => dp.id === formData.drop_point_id)

  /* ---------------------------------------------------------------- */
  /* Step 3 — Sukses                                                    */
  /* ---------------------------------------------------------------- */
  if (step === 3) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in">
        <div className="bg-white rounded-2xl max-w-md w-full p-8 text-center animate-slide-up">
          <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="h-8 w-8 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Booking Berhasil!</h2>
          <p className="text-slate-600 mb-6">
            {shoeData?.merk} {shoeData?.model} sudah tercatat. Simpan nomor di bawah untuk
            memantau progres.
          </p>

          <div className="bg-primary-50 border border-primary-100 rounded-xl p-5 mb-6">
            <p className="text-xs text-slate-500 mb-1">Nomor Booking</p>
            <p className="font-mono text-2xl font-bold text-primary-700 tracking-wider">
              {bookingCode}
            </p>
          </div>

          <p className="text-sm text-slate-500 mb-6">
            Estimasi selesai 2–3 hari kerja. Admin akan menghubungi kamu lewat WhatsApp.
          </p>

          <button onClick={onClose} className="btn-primary w-full">
            Selesai
          </button>
        </div>
      </div>
    )
  }

  /* ---------------------------------------------------------------- */
  /* Step 1 & 2                                                         */
  /* ---------------------------------------------------------------- */
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in">
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto animate-slide-up">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Booking Cuci Sepatu</h2>
            <p className="text-sm text-slate-500">Langkah {step} dari 2</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
            aria-label="Tutup"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Progress */}
        <div className="px-6 py-4 border-b border-slate-100">
          <div className="flex items-center">
            <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold', step >= 1 ? 'bg-primary-600 text-white' : 'bg-slate-200 text-slate-500')}>
              1
            </div>
            <div className={cn('h-1 rounded flex-1 mx-2', step >= 2 ? 'bg-primary-600' : 'bg-slate-200')} />
            <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold', step >= 2 ? 'bg-primary-600 text-white' : 'bg-slate-200 text-slate-500')}>
              2
            </div>
          </div>
          <div className="flex justify-between text-xs text-slate-500 mt-2">
            <span>Detail</span>
            <span>Konfirmasi</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Login gate */}
          {!isAuthenticated && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
              Kamu harus <strong>masuk</strong> dulu supaya booking bisa dilacak.{' '}
              <a href="/login" className="font-semibold underline">Masuk di sini</a>
            </div>
          )}
          {errors.auth && <p className="text-sm text-rose-600">{errors.auth}</p>}

          {/* Step 1 */}
          {step === 1 && (
            <>
              {shoeData ? (
                <div className="bg-primary-50 border border-primary-100 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-xl bg-primary-100 flex items-center justify-center flex-shrink-0">
                      <Footprints className="h-5 w-5 text-primary-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-slate-900">
                        {shoeData.merk} {shoeData.model || ''}
                      </h3>
                      <p className="text-sm text-slate-500">{shoeData.keterangan_treatment}</p>
                      <p className="text-sm font-semibold text-primary-700 mt-1">
                        {formatRupiah(shoeData.harga_cuci)} / pasang
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
                  Belum ada layanan dipilih. Tutup ini lalu pilih layanan di katalog.
                </div>
              )}
              {errors.shoe && <p className="text-sm text-rose-600">{errors.shoe}</p>}

              <div>
                <label htmlFor="drop_point_id" className="label">Titik Penjemputan *</label>
                <select
                  id="drop_point_id"
                  name="drop_point_id"
                  value={formData.drop_point_id}
                  onChange={handleChange}
                  className={cn('input', errors.drop_point_id && 'input-error')}
                >
                  <option value="">Pilih drop point</option>
                  {dropPoints.map((dp) => (
                    <option key={dp.id} value={dp.id}>
                      {dp.nama} — {dp.alamat}
                    </option>
                  ))}
                </select>
                {errors.drop_point_id && (
                  <p className="text-xs text-rose-600 mt-1">{errors.drop_point_id}</p>
                )}
              </div>

              <div>
                <span className="label">Jenis Treatment</span>
                <div className="grid grid-cols-2 gap-2">
                  {TREATMENTS.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setFormData((p) => ({ ...p, treatment: t.value }))}
                      className={cn(
                        'p-3 rounded-xl border text-left transition-colors',
                        formData.treatment === t.value
                          ? 'border-primary-600 bg-primary-50'
                          : 'border-slate-200 hover:bg-slate-50'
                      )}
                    >
                      <span className={cn('block text-sm font-medium', formData.treatment === t.value ? 'text-primary-700' : 'text-slate-900')}>
                        {t.label}
                      </span>
                      <span className="block text-xs text-slate-500 mt-0.5">{t.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="label">Metode Pembayaran</span>
                <div className="grid grid-cols-3 gap-2">
                  {PAYMENTS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, payment: p.value }))}
                      className={cn(
                        'px-2 py-2.5 rounded-xl border text-xs font-medium transition-colors',
                        formData.payment === p.value
                          ? 'border-primary-600 bg-primary-50 text-primary-700'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="catatan" className="label">
                  Catatan untuk Teknisi (Opsional)
                </label>
                <textarea
                  id="catatan"
                  name="catatan"
                  rows={3}
                  value={formData.catatan}
                  onChange={handleChange}
                  className="input resize-none"
                  placeholder="Contoh: Ada noda di sisi kiri, mohon jangan gunakan pelembab kulit."
                />
              </div>
            </>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <>
              <div className="space-y-4">
                <div className="card p-4 bg-primary-50 border-primary-100">
                  <h3 className="font-medium text-slate-900 mb-3 flex items-center gap-2">
                    <Footprints className="h-5 w-5 text-primary-600" /> Detail Sepatu
                  </h3>
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-slate-500">Merk</dt>
                      <dd className="font-medium">{shoeData?.merk}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Model</dt>
                      <dd className="font-medium">{shoeData?.model || '-'}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Treatment</dt>
                      <dd className="font-medium">{formData.treatment}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Biaya</dt>
                      <dd className="font-medium text-primary-700">
                        {formatRupiah(shoeData?.harga_cuci)}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="card p-4">
                  <h3 className="font-medium text-slate-900 mb-3 flex items-center gap-2">
                    <User className="h-5 w-5 text-primary-600" /> Pemesan
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500">Nama</span>
                      <span className="font-medium text-right">{user?.full_name}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500">WhatsApp</span>
                      <span className="font-medium text-right">{user?.phone}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500">Drop Point</span>
                      <span className="font-medium text-right">{selectedDropPoint?.nama}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500">Pembayaran</span>
                      <span className="font-medium text-right">
                        {PAYMENTS.find((p) => p.value === formData.payment)?.label}
                      </span>
                    </div>
                  </div>
                </div>

                {formData.catatan && (
                  <div className="card p-4">
                    <h3 className="font-medium text-slate-900 mb-2 flex items-center gap-2">
                      <MessageSquare className="h-5 w-5 text-primary-600" /> Catatanmu
                    </h3>
                    <p className="text-sm text-slate-600 italic">{formData.catatan}</p>
                  </div>
                )}

                <div className="card p-4 bg-amber-50 border-amber-100">
                  <h3 className="font-medium text-slate-900 mb-2 flex items-center gap-2">
                    <Clock className="h-5 w-5 text-amber-600" /> Informasi Penting
                  </h3>
                  <ul className="text-sm text-slate-600 space-y-1">
                    <li>• Estimasi pengerjaan 2–3 hari kerja.</li>
                    <li>• Teknisi wajib foto kondisi sebelum & sesudah.</li>
                    <li>• Simpan nomor booking untuk memantau progres.</li>
                  </ul>
                </div>
              </div>
            </>
          )}

          {/* Navigasi */}
          <div className="flex gap-3 pt-4 border-t border-slate-100">
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep(1)}
                className="btn-secondary flex-1"
              >
                Kembali
              </button>
            )}
            <button
              type="submit"
              disabled={loading || (step === 1 && (!shoeData || !isAuthenticated))}
              className="btn-primary flex-1"
            >
              {loading ? (
                <span className="animate-spin h-5 w-5 border-2 border-white/30 border-t-white rounded-full" />
              ) : step === 1 ? (
                'Lanjut ke Konfirmasi'
              ) : (
                'Konfirmasi & Buat Booking'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
