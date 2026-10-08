import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, CheckCircle, Clock, Copy, Footprints, MessageSquare, Phone, Plus, User } from 'lucide-react'
import { transactionsApi, dropPointsApi, configApi, shoesApi } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { toast } from './Toast'
import { formatDate, formatRupiah, hargaLayanan, cn } from '../utils/helpers'

// DAFTAR TREATMENT TIDAK ADA DI SINI, dan itu disengaja.
// Dulu ada tombol pilihan "Standar / Premium / Steri / Waterproof" yang
// disconnected: nilainya tidak pernah dikirim ke backend, dan backend pun
// mengambil harga dari master shoes. Akibatnya pelanggan bisa memilih
// "Waterproof" lalu ditagih harga cuci biasa.
// Sekarang treatment ikut dari layanan yang dipilih di katalog, dan yang tampil
// hanya informasinya -- read-only. Kalau treatment mau diubah, pilih layanan
// lain di katalog, jangan mengarang harga sendiri.

const LABEL_BAYAR = {
  tunai: 'Tunai di tempat',
  transfer: 'Transfer Bank',
  qris: 'QRIS / E-Wallet',
}

const INSTRUKSI_BAYAR = {
  transfer: 'Nomor rekening tujuan dikirim admin lewat WhatsApp setelah booking dibuat.',
  qris: 'Kode QRIS tersedia di drop point, atau minta dikirim admin lewat WhatsApp.',
}

// Kunci sessionStorage untuk melanjutkan booking setelah login. Isinya array
// layanan yang dipilih; ditulis saat konsumen menekan "Masuk", dibaca ulang
// oleh HomePage setelah redirect balik dari halaman login.
export const KUNCI_PENDING_BOOKING = 'komang_pending_booking'

const WA_DEFAULT = '628980570911'
const ESTIMASI_DEFAULT = 3

/** Estimasi tanggal selesai: n hari kalender dari sekarang. */
function estimasiTanggal(hari) {
  const d = new Date()
  d.setDate(d.getDate() + hari)
  return d.toISOString()
}

function namaLayanan(item) {
  return [item?.merk, item?.model].filter(Boolean).join(' ')
}

export default function BookingModal({ shoe, items: itemsProp, onClose, onSuccess }) {
  const { user, isAuthenticated } = useAuth()
  const navigate = useNavigate()

  // Daftar pasang yang dibooking. Satu konsumen sering bawa beberapa pasang
  // sekaligus; tiap pasang tetap jadi transaksi sendiri (status pengerjaan
  // memang per pasang), diikat oleh grup_id yang sama.
  const [items, setItems] = useState(() => {
    if (itemsProp?.length) return itemsProp
    return shoe ? [shoe] : []
  })

  const [step, setStep] = useState(1) // 1: Form, 2: Konfirmasi, 3: Selesai
  const [katalog, setKatalog] = useState([])
  const [dropPoints, setDropPoints] = useState([])
  const [dropError, setDropError] = useState(null)
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState({})
  const [hasilBooking, setHasilBooking] = useState([]) // [{ layanan, kode }]
  const [formData, setFormData] = useState({
    drop_point_id: '',
    catatan: '',
    payment: 'tunai',
  })

  useEffect(() => {
    if (!itemsProp?.length) setItems(shoe ? [shoe] : [])
  }, [shoe, itemsProp])

  const muatDropPoints = useCallback(() => {
    setDropError(null)
    // TIDAK ada fallback hardcode. Dulu kalau API gagal, form diam-diam memakai
    // daftar bawaan ber-id "fallback-*" dan booking terkirim dengan
    // drop_point_id NULL -- admin tidak tahu konsumen mau titip di mana.
    // Lebih baik gagal terang-terangan dengan tombol coba lagi.
    dropPointsApi
      .list({ aktif_only: true })
      .then(({ data }) => {
        if (!data.length) setDropError('Belum ada drop point yang aktif.')
        else setDropPoints(data)
      })
      .catch(() => setDropError('Daftar drop point gagal dimuat.'))
  }, [])

  useEffect(() => {
    muatDropPoints()
    shoesApi
      .list()
      .then(({ data }) => setKatalog(Array.isArray(data) ? data : []))
      .catch(() => setKatalog([]))
    configApi
      .get()
      .then(({ data }) => {
        setConfig(data)
        // Default metode bayar = yang pertama diterima outlet.
        const diterima = data?.accepted_payments || []
        if (diterima.length && !diterima.includes(formData.payment)) {
          setFormData((prev) => ({ ...prev, payment: diterima[0] }))
        }
      })
      .catch(() => setConfig(null)) // fallback default dipakai di bawah
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [muatDropPoints])

  // Metode bayar dari config backend (sinkron dengan ACCEPTED_PAYMENTS di
  // .env). Kalau config gagal dimuat, hanya tunai yang ditawarkan -- itu satu-
  // satunya metode yang tidak butuh instruksi apa pun.
  const metodeDiterima = config?.accepted_payments?.length
    ? config.accepted_payments
    : ['tunai']
  const payments = metodeDiterima.map((v) => ({
    value: v,
    label: LABEL_BAYAR[v] || v,
  }))
  const waAdmin = config?.business_phone || WA_DEFAULT
  const instruksi = INSTRUKSI_BAYAR[formData.payment]

  // Estimasi per layanan (kolom estimasi_hari di master shoes; kosong =
  // default). Booking multi-pasang memakai yang PALING LAMA -- menjanjikan
  // tanggal tercepat padahal satu pasang masih di-repaint itu komplain pasti.
  const estimasiHari = useMemo(
    () => Math.max(ESTIMASI_DEFAULT, ...items.map((i) => i?.estimasi_hari || ESTIMASI_DEFAULT)),
    [items]
  )
  const tanggalEstimasi = estimasiTanggal(estimasiHari)

  // Harga per item + total. Resolved lewat helper yang sama supaya tampilan
  // langkah 1 dan 2 tidak pernah berbeda untuk layanan yang sama.
  const rincianHarga = useMemo(
    () => items.map((item) => ({ item, harga: hargaLayanan(item) })),
    [items]
  )
  const totalHarga = rincianHarga.reduce((acc, r) => acc + (r.harga.jumlah || 0), 0)
  const adaRentang = rincianHarga.some((r) => r.harga.rentang)

  const tambahPasang = (id) => {
    const ditemukan = katalog.find((s) => s.id === id)
    if (ditemukan) setItems((prev) => [...prev, ditemukan])
  }

  const hapusPasang = (indeks) =>
    setItems((prev) => prev.filter((_, i) => i !== indeks))

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }))
  }

  // Simpan pilihan layanan lalu pindah ke halaman login. Setelah login,
  // HomePage membaca sessionStorage dan membuka kembali modal ini dengan
  // layanan yang sama -- konsumen tidak mengulang dari katalog.
  const keLogin = () => {
    if (items.length) {
      sessionStorage.setItem(KUNCI_PENDING_BOOKING, JSON.stringify(items))
    }
    navigate('/login', { state: { from: '/' } })
  }

  const validate = () => {
    const next = {}
    if (!items.length || items.some((i) => !i?.id)) next.shoe = 'Pilih layanan dulu dari katalog di halaman utama'
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
    // Satu grup_id untuk seluruh batch: inilah "benang" yang membuat halaman
    // status dan akun bisa menampilkan semua pasang sebagai satu booking.
    const grup = items.length > 1 ? crypto.randomUUID() : null
    const berhasil = []
    let gagal = null

    for (const item of items) {
      try {
        const { data } = await transactionsApi.create({
          user_id: user.id,
          shoe_id: item.id,
          drop_point_id: formData.drop_point_id,
          // Backend mengabaikan angka ini dan memakai harga master sendiri.
          // Dikirim harga terendah supaya tidak menyesatkan kalau nanti ada
          // endpoint lain yang membaca payload ini apa adanya.
          harga: hargaLayanan(item).jumlah,
          catatan_konsumen: formData.catatan || null,
          payment_method: formData.payment,
          grup_id: grup,
        })
        berhasil.push({ layanan: namaLayanan(item), kode: data.kode })
      } catch (err) {
        gagal = err
        break
      }
    }

    setLoading(false)
    if (berhasil.length) {
      setHasilBooking(berhasil)
      setStep(3)
      onSuccess?.()
      if (gagal) {
        toast.warning(
          'Sebagian booking gagal',
          `${berhasil.length} dari ${items.length} pasang tercatat. ${gagal?.friendlyMessage || ''}`
        )
      }
    } else {
      toast.error('Booking gagal', gagal?.friendlyMessage || 'Terjadi kesalahan. Coba lagi.')
      setStep(1)
    }
  }

  const selectedDropPoint = dropPoints.find((dp) => dp.id === formData.drop_point_id)
  const semuaKode = hasilBooking.map((h) => h.kode).join(', ')

  const salinKode = async () => {
    try {
      await navigator.clipboard.writeText(semuaKode)
      toast.success('Nomor disalin', semuaKode)
    } catch {
      toast.warning('Gagal menyalin', 'Salin manual: ' + semuaKode)
    }
  }

  /* ---------------------------------------------------------------- */
  /* Step 3 — Sukses                                                    */
  /* ---------------------------------------------------------------- */
  if (step === 3) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in">
        <div className="bg-white rounded-2xl max-w-md w-full p-8 text-center animate-slide-up max-h-[90vh] overflow-y-auto">
          <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="h-8 w-8 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Booking Berhasil!</h2>
          <p className="text-slate-600 mb-6">
            {hasilBooking.length > 1
              ? `${hasilBooking.length} pasang sudah tercatat. Simpan semua nomor di bawah.`
              : `${hasilBooking[0]?.layanan} sudah tercatat. Simpan nomor di bawah untuk memantau progres.`}
          </p>

          {adaRentang && (
            <p className="-mt-4 mb-6 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3 text-left">
              Ada layanan ber-harga rentang, jadi yang tercatat sekarang adalah harga terendah.
              Admin akan menghubungi kamu lewat WhatsApp untuk mengonfirmasi harga final.
            </p>
          )}

          <div className="space-y-2 mb-4 text-left">
            {hasilBooking.map((h) => (
              <div key={h.kode} className="bg-primary-50 border border-primary-100 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                <span className="text-xs text-slate-600 truncate">{h.layanan}</span>
                <span className="font-mono text-base font-bold text-primary-700 tracking-wider shrink-0">
                  {h.kode}
                </span>
              </div>
            ))}
          </div>
          <button
            onClick={salinKode}
            className="mb-6 inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700 hover:text-primary-800"
          >
            <Copy className="h-3.5 w-3.5" /> Salin {hasilBooking.length > 1 ? 'semua nomor' : 'nomor'}
          </button>

          <p className="text-sm text-slate-500 mb-6">
            Estimasi selesai sekitar <strong>{formatDate(tanggalEstimasi)}</strong> (±{estimasiHari}{' '}
            hari kerja). Admin akan menghubungi kamu lewat WhatsApp.
          </p>

          <div className="space-y-2">
            <a
              href={`/status?kode=${encodeURIComponent(hasilBooking[0]?.kode || '')}`}
              className="btn-primary w-full"
            >
              Lacak Sekarang
            </a>
            <a
              href={`https://wa.me/${waAdmin}?text=${encodeURIComponent(
                `Halo Komang SAC, saya baru booking ${semuaKode}.`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary w-full"
            >
              <Phone className="h-4 w-4" /> Kabari Admin via WhatsApp
            </a>
            <button onClick={onClose} className="w-full px-4 py-2.5 text-sm font-medium text-slate-500 hover:text-slate-700">
              Selesai
            </button>
          </div>
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
            <h2 className="text-lg font-bold text-slate-900">Booking Layanan</h2>
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
              <button type="button" onClick={keLogin} className="font-semibold underline">
                Masuk di sini
              </button>
              <span className="block text-xs mt-1 text-amber-700">
                Pilihanmu tersimpan — setelah masuk, kamu kembali ke form ini.
              </span>
            </div>
          )}
          {errors.auth && <p className="text-sm text-rose-600">{errors.auth}</p>}

          {/* Step 1 */}
          {step === 1 && (
            <>
              <div>
                <span className="label">Layanan ({items.length} pasang)</span>
                {items.length === 0 ? (
                  <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
                    Belum ada layanan dipilih. Tutup ini lalu pilih layanan di katalog.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {rincianHarga.map(({ item, harga }, i) => (
                      <div key={`${item.id}-${i}`} className="bg-primary-50 border border-primary-100 rounded-xl p-3.5 flex items-start gap-3">
                        <div className="h-9 w-9 rounded-xl bg-primary-100 flex items-center justify-center flex-shrink-0">
                          <Footprints className="h-4 w-4 text-primary-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-medium text-slate-900">{namaLayanan(item)}</h3>
                          {item.jenis_treatment && (
                            <span className="inline-block px-2 py-0.5 mt-1 text-[11px] font-medium bg-primary-100 text-primary-700 rounded-full">
                              {item.jenis_treatment}
                            </span>
                          )}
                          <p className="text-xs font-semibold text-primary-700 mt-1">
                            {harga.rentang ? harga.teks : formatRupiah(harga.jumlah)}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            ±{item.estimasi_hari || ESTIMASI_DEFAULT} hari kerja
                          </p>
                        </div>
                        {items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => hapusPasang(i)}
                            className="p-1.5 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                            aria-label={`Hapus ${namaLayanan(item)}`}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {errors.shoe && <p className="text-sm text-rose-600 mt-1">{errors.shoe}</p>}

                {/* Tambah pasang lain dalam booking yang sama */}
                {katalog.length > 0 && (
                  <select
                    value=""
                    onChange={(e) => e.target.value && tambahPasang(e.target.value)}
                    className="input mt-2 text-slate-600"
                    aria-label="Tambah pasang lain"
                  >
                    <option value="">+ Tambah pasang lain dalam booking ini...</option>
                    {katalog.map((s) => (
                      <option key={s.id} value={s.id}>
                        {namaLayanan(s)}
                      </option>
                    ))}
                  </select>
                )}

                {items.length > 1 && (
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    Total sementara: {formatRupiah(totalHarga)}
                    {adaRentang && (
                      <span className="block text-[11px] font-normal text-slate-500">
                        Ada layanan rentang — total final dikonfirmasi admin setelah cek di outlet.
                      </span>
                    )}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="drop_point_id" className="label">Titik Penjemputan *</label>
                {dropError ? (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
                    {dropError}{' '}
                    <button type="button" onClick={muatDropPoints} className="font-semibold underline">
                      Coba lagi
                    </button>
                  </div>
                ) : (
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
                )}
                {errors.drop_point_id && (
                  <p className="text-xs text-rose-600 mt-1">{errors.drop_point_id}</p>
                )}
              </div>

              <div>
                <span className="label">Metode Pembayaran</span>
                <div className={cn('grid gap-2', payments.length > 2 ? 'grid-cols-3' : payments.length === 2 ? 'grid-cols-2' : 'grid-cols-1')}>
                  {payments.map((p) => (
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
                {instruksi && (
                  <p className="text-xs text-slate-500 mt-2">{instruksi}</p>
                )}
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
                    <Footprints className="h-5 w-5 text-primary-600" /> Detail Layanan ({items.length} pasang)
                  </h3>
                  <div className="space-y-2.5 text-sm">
                    {rincianHarga.map(({ item, harga }, i) => (
                      <div key={`${item.id}-${i}`} className="flex justify-between gap-4">
                        <span className="text-slate-600">
                          {namaLayanan(item)}
                          <span className="block text-[11px] text-slate-400">
                            {item.jenis_treatment} · ±{item.estimasi_hari || ESTIMASI_DEFAULT} hari
                          </span>
                        </span>
                        <span className="font-medium text-primary-700 text-right shrink-0">
                          {harga.rentang ? harga.teks : formatRupiah(harga.jumlah)}
                        </span>
                      </div>
                    ))}
                    <div className="flex justify-between gap-4 pt-2.5 border-t border-primary-100">
                      <span className="font-semibold text-slate-900">Total sementara</span>
                      <span className="font-bold text-primary-700">{formatRupiah(totalHarga)}</span>
                    </div>
                    {adaRentang && (
                      <p className="text-[11px] text-slate-500">
                        Ada layanan rentang — harga final ditentukan setelah shoes dicek di outlet.
                      </p>
                    )}
                  </div>
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
                        {payments.find((p) => p.value === formData.payment)?.label}
                      </span>
                    </div>
                  </div>
                  {instruksi && (
                    <p className="text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100">
                      {instruksi}
                    </p>
                  )}
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
                    <li>• Estimasi selesai sekitar {formatDate(tanggalEstimasi)} (±{estimasiHari} hari kerja).</li>
                    {adaRentang && (
                      <li>
                        • Ada layanan dengan rentang harga. Admin akan mengabari harga final lewat
                        WhatsApp setelah shoes dicek.
                      </li>
                    )}
                    <li>• Teknisi wajib foto kondisi sebelum & sesudah — bisa kamu lihat di halaman status.</li>
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
              disabled={loading || (step === 1 && (!items.length || !isAuthenticated || dropPoints.length === 0))}
              className="btn-primary flex-1"
            >
              {loading ? (
                <span className="animate-spin h-5 w-5 border-2 border-white/30 border-t-white rounded-full" />
              ) : step === 1 ? (
                'Lanjut ke Konfirmasi'
              ) : (
                `Konfirmasi & Buat ${items.length > 1 ? items.length + ' Booking' : 'Booking'}`
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
