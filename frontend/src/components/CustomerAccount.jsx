import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Printer,
  Footprints,
  Search,
  MessageCircle,
  Camera,
  AlertTriangle,
  CheckCircle2,
  Package,
  Clock,
  ChevronRight,
} from 'lucide-react'
import { transactionsApi, shoesApi, configApi } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { getStatusConfig, formatRupiah, formatDateTime, cn } from '../utils/helpers'
import { SearchInput } from './AdminUi'

/**
 * Halaman akun Konsumen.
 *
 * Konsumen hanya melihat miliknya sendiri -- ditegakkan di backend, bukan di
 * filter frontend. Halaman ini jadi tempat tracking yang lebih lengkap
 * dibanding halaman status publik: bisa melihat semua riwayat sekaligus.
 *
 * Backend sengaja tidak mengirim `customer` ke konsumen (itu datanya sendiri,
 * tidak ada gunanya) dan tidak mengirim harga ke teknisi.
 */

const URUTAN = ['Diterima', 'Diproses', 'Diperiksa', 'Selesai', 'Siap diambil']
const SELESAI = ['Selesai', 'Siap diambil']

export default function CustomerAccount() {
  const { user } = useAuth()
  const [transaksi, setTransaksi] = useState([])
  const [katalog, setKatalog] = useState({})
  const [jamBuka, setJamBuka] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [cari, setCari] = useState('')

  const muat = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [trx, sh] = await Promise.all([
        transactionsApi.list(),
        shoesApi.list(),
      ])
      setTransaksi(trx.data || [])
      setKatalog(Object.fromEntries((sh.data || []).map((s) => [s.id, s])))
    } catch (err) {
      setError(err?.friendlyMessage || 'Gagal memuat riwayat sepatu.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    configApi
      .get()
      .then(({ data }) => setJamBuka(data?.business_hours || null))
      .catch(() => {})
  }, [])

  useEffect(() => {
    muat()
  }, [muat])

  /**
   * Transaksi + nama sepatu yang sudah di-resolve di sini. Dipisah supaya
   * pencarian cuma membandingkan string, bukan memanggil fungsi di dalam
   * useMemo.
   */
  const daftar = useMemo(
    () =>
      transaksi.map((t) => {
        const s = katalog[t.shoe_id]
        return {
          ...t,
          nama: s ? [s.merk, s.model].filter(Boolean).join(' ') : 'Sepatu',
          tipe: s?.jenis_treatment || null,
        }
      }),
    [transaksi, katalog]
  )

  const hasil = useMemo(() => {
    const q = cari.trim().toLowerCase()
    if (!q) return daftar
    return daftar.filter(
      (t) => (t.kode || '').toLowerCase().includes(q) || t.nama.toLowerCase().includes(q)
    )
  }, [daftar, cari])

  const berjalan = useMemo(() => daftar.filter((t) => !SELESAI.includes(t.status)), [daftar])
  const aktif = useMemo(
    () => berjalan.find((t) => t.status === 'Siap diambil') || berjalan[0],
    [berjalan]
  )

  const linkWa = (nomor, pesan) =>
    `https://wa.me/${String(nomor || '').replace(/\D/g, '')}?text=${encodeURIComponent(pesan)}`

  const templateLacak = (t) =>
    `Halo Komang SAC, saya mau tanya tentang sepatu saya yang nomor ${t.kode}. `
    + `Sudah sampai tahap apa?`

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Halo, {user?.full_name?.split(' ')[0]}
        </h1>
        <p className="text-slate-500 mt-1">
          Semua sepatu yang sedang dan pernah kamu titipkan.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div>
            <p>{error}</p>
            <button onClick={muat} className="text-xs font-semibold underline mt-1">
              Coba lagi
            </button>
          </div>
        </div>
      )}

      {/* Shoes yang sedang jalan -- disorot, karena itu yang dicari orang */}
      {aktif && (
        <div className="card border-primary-200 overflow-hidden">
          <div className="bg-primary-600 px-5 py-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-white">Shoes Sedang Diproses</p>
            <span className="text-[11px] text-primary-100 font-mono">{aktif.kode}</span>
          </div>
          <div className="p-5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <p className="font-semibold text-slate-900">{aktif.nama}</p>
                {aktif.tipe && (
                  <p className="text-xs text-slate-500 mt-0.5">
                    Treatment {aktif.tipe}
                  </p>
                )}
              </div>
              <span className={getStatusConfig(aktif.status).className}>
                {getStatusConfig(aktif.status).label}
              </span>
            </div>

            {/* Progress stepper */}
            <ol className="flex items-center mt-5">
              {URUTAN.map((s, i) => {
                const reached = URUTAN.indexOf(aktif.status) >= i
                const iniSekarang = aktif.status === s
                return (
                  <li key={s} className="flex-1 last:flex-none">
                    <div className="flex items-center">
                      <div className="flex flex-col items-center gap-1.5">
                        <span
                          className={cn(
                            'h-3 w-3 rounded-full flex-shrink-0',
                            reached ? 'bg-primary-600' : 'bg-slate-200',
                            iniSekarang && 'ring-4 ring-primary-100'
                          )}
                        />
                      </div>
                      {i < URUTAN.length - 1 && (
                        <div
                          className={cn(
                            'h-0.5 flex-1 mx-1',
                            URUTAN.indexOf(aktif.status) > i ? 'bg-primary-600' : 'bg-slate-200'
                          )}
                        />
                      )}
                    </div>
                    <span
                      className={cn(
                        'text-[9px] mt-1.5 block text-center leading-tight',
                        reached ? 'text-primary-700 font-medium' : 'text-slate-400'
                      )}
                    >
                      {s}
                    </span>
                  </li>
                )
              })}
            </ol>

            {/* Foto dokumentasi teknisi untuk sepatu yang sedang jalan.
                Konsumen paling sering menanyakan ini -- tampilkan begitu ada. */}
            {(aktif.photo_before || aktif.photo_after) && (
              <div className="mt-5 grid grid-cols-2 gap-3">
                {aktif.photo_before && (
                  <a href={aktif.photo_before} target="_blank" rel="noopener noreferrer" className="group">
                    <img
                      src={aktif.photo_before}
                      alt="Kondisi sebelum dicuci"
                      loading="lazy"
                      className="w-full aspect-square object-cover rounded-xl border border-slate-200 group-hover:opacity-90 transition-opacity"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">Sebelum dicuci</p>
                  </a>
                )}
                {aktif.photo_after && (
                  <a href={aktif.photo_after} target="_blank" rel="noopener noreferrer" className="group">
                    <img
                      src={aktif.photo_after}
                      alt="Kondisi sesudah dicuci"
                      loading="lazy"
                      className="w-full aspect-square object-cover rounded-xl border border-slate-200 group-hover:opacity-90 transition-opacity"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">Sesudah dicuci</p>
                  </a>
                )}
              </div>
            )}

            {aktif.catatan_konsumen && (
              <p className="mt-5 text-xs text-slate-500 flex items-start gap-1.5">
                <MessageCircle className="h-3.5 w-3.5 flex-shrink-0 mt-px" />
                Catatan kamu: {aktif.catatan_konsumen}
              </p>
            )}

            {aktif.status === 'Siap diambil' && (
              <p className="mt-3 text-xs font-medium text-cyan-700 flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Sudah siap diambil di outlet.{jamBuka ? ` Jam operasional: ${jamBuka}.` : ' Datang sesuai jam buka ya.'}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Ringkasan */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Sedang diproses', nilai: berjalan.length, cls: 'bg-amber-400' },
          { label: 'Selesai', nilai: transaksi.length - berjalan.length, cls: 'bg-emerald-500' },
          { label: 'Total', nilai: transaksi.length, cls: 'bg-slate-300' },
        ].map((k) => (
          <div key={k.label} className="card p-4">
            <div className="flex items-center gap-2">
              <span className={cn('h-2 w-2 rounded-full', k.cls)} />
              <span className="text-xs font-medium text-slate-500">{k.label}</span>
            </div>
            <p className="mt-1.5 text-2xl font-bold text-slate-900">{loading ? '—' : k.nilai}</p>
          </div>
        ))}
      </div>

      {/* Riwayat */}
      <div>
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center mb-4">
          <h2 className="text-lg font-bold text-slate-900 shrink-0">Riwayat Shoes</h2>
          <div className="flex-1 sm:max-w-xs">
            <SearchInput
              value={cari}
              onChange={setCari}
              placeholder="Cari nomor booking atau nama sepatu..."
            />
            
          </div>
          </div>

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="card p-5 animate-pulse">
                <div className="h-4 w-32 rounded bg-slate-100" />
                <div className="h-3 w-48 rounded bg-slate-100 mt-3" />
              </div>
            ))}
          </div>
        ) : hasil.length === 0 ? (
          <div className="card p-10 text-center">
            <Footprints className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600 mb-4">
              {transaksi.length === 0
                ? 'Belum ada sepatu yang pernah kamu titipkan.'
                : 'Tidak ada sepatu yang cocok dengan pencarianmu.'}
            </p>
            {transaksi.length === 0 && (
              <a href="/" className="btn-primary text-sm">
                Booking sekarang
              </a>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {hasil.map((t) => {
              const cfg = getStatusConfig(t.status)
              return (
                <div key={t.id} className="card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-slate-900">{t.kode}</span>
                        <span className={cfg.className}>{cfg.label}</span>
                        {t.grup_id && (
                          <span className="badge bg-slate-100 text-slate-600">booking grup</span>
                        )}
                      </div>
                      <p className="text-sm text-slate-700 mt-1.5">{t.nama}</p>
                      <p className="text-[11px] text-slate-400 mt-1">
                        {formatDateTime(t.created_at)} · {formatRupiah(t.harga)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <a
                        href={`/status?kode=${encodeURIComponent(t.kode)}`}
                        className="btn-secondary px-3 py-1.5 text-xs"
                      >
                        Lacak <ChevronRight className="h-3 w-3" />
                      </a>
                      <button
                        onClick={() => window.print()}
                        className="btn-secondary px-3 py-1.5 text-xs"
                        title="Cetak invoice"
                      >
                        <Printer className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => window.open(linkWa('628980570911', templateLacak(t)), '_blank')}
                        className="btn-primary px-3 py-1.5 text-xs"
                        title="Tanya status lewat WhatsApp"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        Tanya
                      </button>
                    </div>
                  </div>

                  {/* Foto -- sudah dikirimnya foto setelah ditandai selesai */}
                  {t.photo_after && (
                    <a
                      href={t.photo_after}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex items-center gap-1.5 text-xs text-primary-600 hover:underline"
                    >
                      <Camera className="h-3.5 w-3.5" />
                      Lihat hasil setelah ({t.nama})
                    </a>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="flex items-start gap-2 p-3 rounded-xl bg-slate-100 text-xs text-slate-600">
        <Clock className="h-4 w-4 flex-shrink-0 mt-0.5 text-slate-400" />
        <p>
          Kalau ada sepatu yang perlu dicatat kerusakannya, sampaikan ke teknisi saat titip.
          Catatan yang kamu tulis saat booking ikut terbawa ke teknisi.
        </p>
      </div>

      {transaksi.some((t) => t.photo_after) && (
        <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
          <Package className="h-3 w-3" />
          Foto hasil disimpan sementara dan otomatis terhapus agar hemat penyimpanan.
        </p>
      )}
    </div>
  )
}
