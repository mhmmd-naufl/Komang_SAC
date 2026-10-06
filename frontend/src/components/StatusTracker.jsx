import { useState, useEffect } from 'react'
import { Search, Package, Loader2, MapPin, Phone, Calendar, PackageCheck, Info } from 'lucide-react'
import { transactionsApi } from '../services/api'
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

// Mock untuk preview sampai backend & data transaksi tersedia
const mockTransactions = [
  {
    id: 'KS-2401A',
    status: 'Diproses',
    created_at: '2026-10-04T09:12:00Z',
    shoes: { merk: 'Deep Cleaning', model: 'White', jenis_treatment: 'Deep Cleaning' },
    harga: 30000,
    drop_point: { nama: 'Outlet Utama', alamat: 'Jl. Cisadane No.3, Banyuwangi' },
    catatan_konsumen: 'Tolong jaga warna putih tetap bersih.',
  },
  {
    id: 'KS-2401B',
    status: 'Siap diambil',
    created_at: '2026-10-01T14:40:00Z',
    shoes: { merk: 'Shoes Repaint', model: 'Upper Suede', jenis_treatment: 'Shoes Repaint' },
    harga: 100000,
    drop_point: { nama: 'Dolay Cut', alamat: 'Jl. Kyai Haji Wahid Hasyim No.76' },
    catatan_konsumen: null,
  },
]

export default function StatusTracker() {
  const [code, setCode] = useState('')
  const [result, setResult] = useState(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState(null)
  const [notFound, setNotFound] = useState(false)

  // Codes Hardcoded demo — hapus setelah backend siap
  const demoCodes = mockTransactions.map((t) => t.id)

  useEffect(() => {
    document.title = 'Cek Status — Komang SAC'
  }, [])

  const handleSearch = async (e) => {
    e.preventDefault()
    const trimmed = code.trim().toUpperCase()
    if (!trimmed) return

    setSearching(true)
    setError(null)
    setNotFound(false)
    setResult(null)

    try {
      const { data } = await transactionsApi.tracking(trimmed)
      setResult(data)
    } catch (err) {
      const status = err?.response?.status
      if (status === 404) {
        // Fallback ke mock supaya UI tetap bisa direview
        const mock = mockTransactions.find((t) => t.id === trimmed)
        if (mock) {
          setResult({ ...mock, _mock: true })
        } else {
          setNotFound(true)
        }
      } else if (err.code === 'ERR_NETWORK' || !status) {
        // Backend mati — pakai mock untuk demo
        const mock = mockTransactions.find((t) => t.id === trimmed)
        if (mock) {
          setResult({ ...mock, _mock: true })
        } else {
          setError('Backend tidak dapat dihubungi. Coba lagi nanti.')
        }
      } else {
        setError(err?.friendlyMessage || 'Gagal mencari transaksi.')
      }
    } finally {
      setSearching(false)
    }
  }

  const currentStep = result ? FLOW.indexOf(result.status) : -1

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
              placeholder="KS-2401A"
            />
          </div>
          <button type="submit" disabled={searching || !code.trim()} className="btn-primary sm:px-8">
            {searching ? <span className="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full" /> : 'Cari'}
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-3">
          Nomor booking diberikan admin saat titip sepatu. Demo:{' '}
          {demoCodes.map((c) => (
            <button key={c} type="button" onClick={() => setCode(c)} className="font-mono text-primary-600 hover:underline mr-2">
              {c}
            </button>
          ))}
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
          {result._mock && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
              <Info className="h-4 w-4 flex-shrink-0" />
              Data contoh — backend belum terhubung.
            </div>
          )}

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
            </div>
          </div>

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
              <p className="text-sm text-slate-600 mb-4">
                Ambil di <strong>{result.drop_point?.nama}</strong>
              </p>
              <a
                href={`https://wa.me/628980570911?text=${encodeURIComponent(
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
