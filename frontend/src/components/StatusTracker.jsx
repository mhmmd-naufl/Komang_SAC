import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, Package, Loader2, MapPin, Phone, Calendar, PackageCheck, Camera } from 'lucide-react'
import { transactionsApi, configApi } from '../services/api'
import { getStatusConfig, formatRupiah, formatDateTime } from '../utils/helpers'
import { cn } from '../utils/helpers'

const FLOW = ['Diterima', 'Diproses', 'Diperiksa', 'Selesai', 'Siap diambil']

const FLOW_META = {
  Diterima: { icon: Package, desc: 'Sepatu diterima & dicatat oleh drop point' },
  Diproses: { icon: Loader2, desc: 'Sedang dicuci oleh teknisi' },
  Diperiksa: { icon: PackageCheck, desc: 'QC — dicek hasil & kondisi akhir' },
  Selesai: { icon: PackageCheck, desc: 'Pengerjaan selesai' },
  'Siap diambil': { icon: MapPin, desc: 'Silakan ambil di drop point' },
}

const LABEL_BAYAR = {
  tunai: 'Tunai di tempat',
  transfer: 'Transfer Bank',
  qris: 'QRIS / E-Wallet',
}

const WA_DEFAULT = '628980570911'

const FOTO_META = [
  { kunci: 'photo_before', label: 'Sebelum dicuci' },
  { kunci: 'photo_after', label: 'Sesudah dicuci' },
  { kunci: 'photo_defect', label: 'Catatan kondisi' },
]

export default function StatusTracker() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [code, setCode] = useState(searchParams.get('kode') || '')
  const [result, setResult] = useState(null)
  const [grup, setGrup] = useState(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [config, setConfig] = useState(null)

  useEffect(() => {
    document.title = 'Cek Status — Komang SAC'
    configApi.get().then(({ data }) => setConfig(data)).catch(() => {})
  }, [])

  const cari = useCallback(async (nomor) => {
    const trimmed = nomor.trim().toUpperCase()
    if (!trimmed) return

    setSearching(true)
    setError(null)
    setNotFound(false)
    setResult(null)
    setGrup(null)

    try {
      const { data } = await transactionsApi.tracking(trimmed)
      setResult(data)
      // Booking multi-pasang: ambil pasangan lain supaya konsumen tidak
      // mengetik kode satu per satu. Gagal memuat grup bukan alasan
      // menyembunyikan status utamanya.
      if (data?.grup_id) {
        transactionsApi
          .grup(data.grup_id)
          .then((res) => setGrup(Array.isArray(res.data) ? res.data : null))
          .catch(() => setGrup(null))
      }
    } catch (err) {
      const status = err?.response?.status
      if (status === 404) {
        setNotFound(true)
      } else {
        setError(err?.friendlyMessage || 'Gagal mencari transaksi. Coba lagi.')
      }
    } finally {
      setSearching(false)
    }
  }, [])

  // Link /status?kode=KS-XXXXXX (dari halaman akun atau setelah booking)
  // langsung mengisi form dan mencari -- konsumen tidak mengetik ulang kodenya.
  useEffect(() => {
    const dariUrl = searchParams.get('kode')
    if (dariUrl) {
      setCode(dariUrl)
      cari(dariUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSearch = (e) => {
    e.preventDefault()
    setSearchParams(code.trim() ? { kode: code.trim().toUpperCase() } : {})
    cari(code)
  }

  const currentStep = result ? FLOW.indexOf(result.status) : -1
  const waAdmin = config?.business_phone || WA_DEFAULT
  const jamBuka = config?.business_hours
  const fotoAda = result ? FOTO_META.filter((f) => result[f.kunci]) : []

  // Estimasi per layanan (kolom estimasi_hari di master shoes; default 3).
  // Dipakai untuk tanggal estimasi dan penanda keterlambatan yang halus.
  const STATUS_FINAL = ['Selesai', 'Siap diambil']
  const estimasiHari = result?.shoes?.estimasi_hari || 3
  const tanggalEstimasi = result?.created_at
    ? new Date(new Date(result.created_at).getTime() + estimasiHari * 86400000)
    : null
  const terlambat = Boolean(
    result &&
    !STATUS_FINAL.includes(result.status) &&
    tanggalEstimasi &&
    Date.now() > tanggalEstimasi.getTime()
  )

  return (
    <div className="max-w-2xl mx-auto">
      {/* Search */}
      <form onSubmit={handleSearch} className="card p-5 sm:p-6">
        <label htmlFor="tracking" className="label">Nomor Booking</label>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              id="tracking"
              value={code}
              onChange={(e) => { setCode(e.target.value); setNotFound(false); setError(null) }}
              className="input pl-9 font-mono uppercase"
              placeholder="KS-ABC123"
            />
          </div>
          <button type="submit" disabled={searching || !code.trim()} className="btn-primary sm:px-8">
            {searching ? <span className="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full" /> : 'Cari'}
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-3">
          Nomor booking diberikan saat kamu menitipkan sepatu. Sudah login? Semua
          nomor booking-mu ada di <a href="/akun" className="text-primary-600 font-medium hover:underline">halaman akun</a>.
        </p>
      </form>

      {/* Error / Not found */}
      {error && (
        <div className="mt-4 p-4 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">{error}</div>
      )}
      {notFound && (
        <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
          Nomor booking <strong>{code.toUpperCase()}</strong> tidak ditemukan. Periksa kembali, atau hubungi admin via WhatsApp.
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="mt-6 space-y-5 animate-slide-up">
          {/* Header */}
          <div className="card overflow-hidden">
            <div className="px-5 py-4 bg-primary-600 text-white flex items-center justify-between">
              <div>
                <p className="text-xs text-primary-100">Nomor Booking</p>
                <p className="font-mono text-lg font-bold">{result.kode}</p>
              </div>
              <span className={cn('badge', getStatusConfig(result.status).className)}>
                {getStatusConfig(result.status).label}
              </span>
            </div>
            <div className="p-5 grid sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-slate-500 text-xs">Sepatu</p>
                <p className="font-medium">{result.shoes?.merk} {result.shoes?.model}</p>
                <p className="text-xs text-slate-500 mt-0.5">{result.shoes?.jenis_treatment}</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs">Biaya</p>
                <p className="font-medium text-primary-700">{formatRupiah(result.harga)}</p>
                {result.payment_method && (
                  <p className="text-xs text-slate-500 mt-0.5">
                    via {LABEL_BAYAR[result.payment_method] || result.payment_method}
                  </p>
                )}
              </div>
              <div>
                <p className="text-slate-500 text-xs">Masuk</p>
                <p className="font-medium flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" /> {formatDateTime(result.created_at)}
                </p>
              </div>
              {/* Tanggal selesai dicatat teknisi saat status jadi Selesai. Konsumen
                  butuh ini untuk tahu kapan cuciannya rampung, jadi sengaja
                  ikut ke halaman publik. */}
              <div>
                <p className="text-slate-500 text-xs">Selesai</p>
                <p className="font-medium flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  {result.selesai_at ? formatDateTime(result.selesai_at) : 'Belum selesai'}
                </p>
              </div>
              <div>
                <p className="text-slate-500 text-xs">Drop Point</p>
                <p className="font-medium flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-slate-400" /> {result.drop_point?.nama}
                </p>
              </div>
              <div>
                <p className="text-slate-500 text-xs">Estimasi Selesai</p>
                <p className="font-medium flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  {STATUS_FINAL.includes(result.status)
                    ? 'Sudah rampung'
                    : `${formatDateTime(tanggalEstimasi)} (±${estimasiHari} hari)`}
                </p>
              </div>
            </div>
          </div>

          {/* Pasangan lain dalam booking yang sama */}
          {grup && grup.length > 1 && (
            <div className="card p-5">
              <h3 className="font-semibold text-slate-900 mb-3">
                Satu booking, {grup.length} pasang
              </h3>
              <div className="space-y-2">
                {grup.map((g) => (
                  <button
                    key={g.kode}
                    type="button"
                    onClick={() => { setCode(g.kode); setSearchParams({ kode: g.kode }); cari(g.kode) }}
                    className={cn(
                      'w-full flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border text-left transition-colors',
                      g.kode === result.kode
                        ? 'border-primary-300 bg-primary-50'
                        : 'border-slate-200 hover:bg-slate-50'
                    )}
                  >
                    <span className="min-w-0">
                      <span className="font-mono text-xs font-semibold text-slate-900">{g.kode}</span>
                      <span className="block text-xs text-slate-500 truncate">
                        {g.shoes?.merk} {g.shoes?.model}
                      </span>
                    </span>
                    <span className={cn('badge shrink-0', getStatusConfig(g.status).className)}>
                      {getStatusConfig(g.status).label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Penanda keterlambatan yang halus: momen paling rawan komplain
              diubah jadi ajakan bertanya, bukan kejutan buruk. */}
          {terlambat && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
              Pengerjaanmu butuh waktu ekstra dari estimasi (±{estimasiHari} hari).{' '}
              <a
                href={`https://wa.me/${waAdmin}?text=${encodeURIComponent(
                  `Halo Komang SAC, saya mau tanya progres sepatu saya yang nomor ${result.kode}.`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold underline"
              >
                Tanya progres via WhatsApp
              </a>
            </div>
          )}

          {/* Progress */}
          <div className="card p-5 sm:p-6">
            <h3 className="font-semibold text-slate-900 mb-5">Progres Pengerjaan</h3>
            <div className="relative">
              {/* Track line */}
              <div className="absolute left-[15px] right-[15px] top-[15px] h-0.5 bg-slate-200" aria-hidden="true">
                <div
                  className="h-full bg-primary-600 transition-all duration-500"
                  style={{ width: `${(currentStep / (FLOW.length - 1)) * 100}%` }}
                />
              </div>

              <ol className="relative space-y-5">
                {FLOW.map((step, i) => {
                  const done = i < currentStep
                  const active = i === currentStep
                  const Icon = FLOW_META[step].icon
                  return (
                    <li key={step} className="flex gap-4">
                      <div
                        className={cn(
                          'relative z-10 flex-shrink-0 h-8 w-8 rounded-full items-center justify-center border-2 transition-colors',
                          done && 'bg-primary-600 border-primary-600 text-white',
                          active && 'bg-white border-primary-600 text-primary-600 ring-4 ring-primary-100',
                          !done && !active && 'bg-white border-slate-200 text-slate-300'
                        )}
                      >
                        {done ? (
                          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L3.3 9.7a1 1 0 111.4-1.4l3.8 3.8 6.8-6.8a1 1 0 011.4 0z" clipRule="evenodd" /></svg>
                        ) : (
                          <Icon className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0 pt-1">
                        <p className={cn('text-sm font-medium', active ? 'text-primary-700' : done ? 'text-slate-900' : 'text-slate-400')}>
                          {step}
                          {active && <span className="ml-2 text-xs font-normal text-primary-600">(sekarang)</span>}
                        </p>
                        <p className={cn('text-xs mt-0.5', active ? 'text-slate-600' : 'text-slate-400')}>
                          {FLOW_META[step].desc}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ol>
            </div>
          </div>

          {/* Foto before/after -- bukti kerja teknisi, nilai kepercayaan
              terbesar buat konsumen. URL-nya publik dari Supabase Storage,
              jadi tinggal dirender. */}
          {fotoAda.length > 0 && (
            <div className="card p-5">
              <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <Camera className="h-4 w-4 text-primary-600" /> Dokumentasi Sepatumu
              </h3>
              <div className={cn('grid gap-3', fotoAda.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
                {fotoAda.map((f) => (
                  <a
                    key={f.kunci}
                    href={result[f.kunci]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group block"
                  >
                    <img
                      src={result[f.kunci]}
                      alt={f.label}
                      loading="lazy"
                      className="w-full aspect-square object-cover rounded-xl border border-slate-200 group-hover:opacity-90 transition-opacity"
                    />
                    <p className="text-xs text-slate-500 mt-1.5">{f.label}</p>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Catatan */}
          {result.catatan_konsumen && (
            <div className="card p-5">
              <h3 className="font-semibold text-slate-900 mb-2">Catatan Kamu</h3>
              <p className="text-sm text-slate-600 italic">
                &ldquo;{result.catatan_konsumen}&rdquo;
              </p>
            </div>
          )}

          {/* Ready CTA */}
          {result.status === 'Siap diambil' && (
            <div className="card-primary p-6 text-center">
              <h3 className="font-bold text-slate-900 mb-1">Sepatu kamu sudah siap!</h3>
              <p className="text-sm text-slate-600 mb-1">
                Ambil di <strong>{result.drop_point?.nama}</strong>
              </p>
              {jamBuka && (
                <p className="text-xs text-slate-500 mb-4">Jam operasional: {jamBuka}</p>
              )}
              <a
                href={`https://wa.me/${waAdmin}?text=${encodeURIComponent(
                  `Halo Komang SAC, saya mau ambil sepatu booking ${result.kode}`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary"
              >
                <Phone className="h-4 w-4" /> Kabari Admin
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
