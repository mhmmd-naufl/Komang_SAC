import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Truck,
  CheckCircle2,
  AlertTriangle,
  Search,
  MessageCircle,
  MapPin,
  Phone,
  RefreshCw,
} from 'lucide-react'
import { transactionsApi, shoesApi, dropPointsApi } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { getStatusConfig, formatRupiah, formatDateTime, cn } from '../utils/helpers'
import { tanggalWib } from '../utils/periode'
import { SearchInput } from './AdminUi'

/**
 * Halaman Mitra Drop Point.
 *
 * Mitra drop point melihat semua transaksi -- ini memang tugasnya: terima
 * titipan, serahkan ke teknisi, lalu menginformasikan kalau sudah siap diambil.
 *
 * Batas wewenang: boleh melihat data transaksi dan munculkan nomor WhatsApp
 * untuk mengabari. Tidak boleh mengubah status (itu hak teknisi) dan tidak
 * boleh mengubah data transaksi.
 */

const STATUS_TERSEDIA = ['Diterima', 'Diproses', 'Diperiksa', 'Selesai', 'Siap diambil']
const SIAP_AMBIL = 'Siap diambil'

export default function DropPointPage() {
  const { user } = useAuth()
  const [transaksi, setTransaksi] = useState([])
  const [katalog, setKatalog] = useState({})
  const [dropPoints, setDropPoints] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [cari, setCari] = useState('')
  const [filter, setFilter] = useState('')

  const muat = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [trx, sh, dp] = await Promise.all([
        transactionsApi.list({ limit: 200 }),
        shoesApi.list(),
        dropPointsApi.list(),
      ])
      setTransaksi(trx.data || [])
      setKatalog(Object.fromEntries((sh.data || []).map((s) => [s.id, s])))
      setDropPoints(dp.data || [])
    } catch (err) {
      setError(err?.friendlyMessage || 'Gagal memuat data.')
    } finally {
      setLoading(false)
    }
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
        }
      }),
    [transaksi, katalog]
  )

  const titik = dropPoints.find((d) => d.aktif) || dropPoints[0]

  const hasil = useMemo(() => {
    const q = cari.trim().toLowerCase()
    return daftar.filter((t) => {
      if (filter && t.status !== filter) return false
      if (!q) return true
      return (
        (t.kode || '').toLowerCase().includes(q) ||
        t.nama.toLowerCase().includes(q)
      )
    })
  }, [daftar, filter, cari])

  const hitungStatus = useMemo(() => {
    const out = { semua: transaksi.length }
    transaksi.forEach((t) => {
      out[t.status] = (out[t.status] || 0) + 1
    })
    return out
  }, [transaksi])

  /**
   * Berapa titipan yang MASUK hari ini (WIB).
   *
   * Pakai `created_at`, bukan `selesai_at`: yang ingin diketahui mitra adalah
   * berapa barang yang harus ia terima dan serahkan hari ini, bukan berapa yang
   * rampung. Dihitung dari seluruh `transaksi` (bukan `hasil`) supaya angkanya
   * tidak ikut berubah saat mitra mengetik di kolom pencarian.
   */
  const masukHariIni = useMemo(() => {
    const hari = tanggalWib(new Date())
    if (!hari) return 0
    return transaksi.filter((t) => tanggalWib(t.created_at) === hari).length
  }, [transaksi])

  /** Link wa.me -- semi-manual: sistem menyalin template, partner yang kirim. */
  const linkWa = (nomor, pesan) =>
    `https://wa.me/${String(nomor || '').replace(/\D/g, '')}?text=${encodeURIComponent(pesan)}`

  const templateSiap = (t) =>
    `Halo, sepatu ${t.nama} dengan nomor ${t.kode} sudah selesai dan siap diambil di ${titik?.nama || 'outlet'}. Terima kasih!`

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Halo, {user?.full_name?.split(' ')[0]}
        </h1>
        <p className="text-slate-500 mt-1">
          Terima titipan, pantau progres, dan kabari pelanggan saat siap diambil.
        </p>
      </div>

      {titik && (
        <div className="card-primary p-5 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="h-10 w-10 rounded-xl bg-white flex items-center justify-center flex-shrink-0">
              <MapPin className="h-5 w-5 text-primary-600" />
            </span>
            <div>
              <p className="font-semibold text-primary-900">{titik.nama}</p>
              <p className="text-sm text-primary-700 mt-0.5">{titik.alamat}</p>
              {titik.wa_contact && (
                <a
                  href={linkWa(titik.wa_contact, `Halo ${titik.nama}, saya ingin menanyakan layanan cuci sepatu.`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-800 hover:underline mt-2"
                >
                  <Phone className="h-3.5 w-3.5" />
                  {titik.wa_contact}
                </a>
              )}
            </div>
          </div>
        </div>
      )}

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

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: 'Masuk hari ini', nilai: masukHariIni, cls: 'bg-blue-500' },
          { label: 'Semua', nilai: transaksi.length, cls: 'bg-slate-200' },
          { label: 'Sedang diproses', nilai: hitungStatus.Diproses || 0, cls: 'bg-amber-400' },
          { label: 'Selesai', nilai: hitungStatus.Selesai || 0, cls: 'bg-emerald-500' },
          { label: 'Siap diambil', nilai: hitungStatus[SIAP_AMBIL] || 0, cls: 'bg-cyan-500' },
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

      {/* Cari & filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <SearchInput
            value={cari}
            onChange={setCari}
            placeholder="Cari nomor booking atau nama sepatu..."
          />
        </div>
        <button onClick={muat} className="btn-secondary flex-shrink-0">
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          Muat ulang
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilter('')}
          className={cn(
            'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
            filter === ''
              ? 'bg-primary-600 text-white border-primary-600'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          )}
        >
          Semua status
        </button>
        {STATUS_TERSEDIA.map((s) => {
          const cfg = getStatusConfig(s)
          const aktif = filter === s
          return (
            <button
              key={s}
              onClick={() => setFilter(aktif ? '' : s)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                aktif
                  ? cn(cfg.className, 'ring-2 ring-offset-1 ring-primary-300')
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              )}
            >
              {cfg.label} <span className="opacity-70">({hitungStatus[s] || 0})</span>
            </button>
          )
        })}
      </div>

      {/* Tabel */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-10 rounded bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : hasil.length === 0 ? (
          <div className="p-10 text-center">
            <Truck className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600">Tidak ada transaksi yang cocok.</p>
          </div>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left font-semibold text-slate-600 px-5 py-3">Nomor</th>
                    <th className="text-left font-semibold text-slate-600 px-4 py-3">Sepatu</th>
                    <th className="text-left font-semibold text-slate-600 px-4 py-3">Status</th>
                    <th className="text-left font-semibold text-slate-600 px-4 py-3">Masuk</th>
                    <th className="text-right font-semibold text-slate-600 px-4 py-3">Nilai</th>
                    <th className="text-right font-semibold text-slate-600 px-5 py-3">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {hasil.map((t) => {
                    const cfg = getStatusConfig(t.status)
                    const siap = t.status === SIAP_AMBIL
                    return (
                      <tr key={t.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                        <td className="px-5 py-3 font-mono text-xs font-semibold text-slate-900">
                          {t.kode}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-slate-700">{t.nama}</p>
                          {t.customer && (
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              {t.customer.full_name}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={cfg.className}>{cfg.label}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {formatDateTime(t.created_at)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-slate-700">
                          {formatRupiah(t.harga)}
                        </td>
                        <td className="px-5 py-3 text-right">
                          {siap ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-cyan-700">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Siap dikabari
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="lg:hidden divide-y divide-slate-100">
              {hasil.map((t) => {
                const cfg = getStatusConfig(t.status)
                const siap = t.status === SIAP_AMBIL
                return (
                  <div key={t.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-sm font-semibold">{t.kode}</span>
                            <span className={cfg.className}>{cfg.label}</span>
                          </div>
                          <p className="text-sm text-slate-600 mt-1">{t.nama}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {t.customer?.full_name && `${t.customer.full_name} · `}
                            {formatDateTime(t.created_at)} · {formatRupiah(t.harga)}
                          </p>
                        </div>
                    </div>
                    {siap && t.customer?.phone && (
                      <button
                        onClick={() =>
                          window.open(linkWa(t.customer.phone, templateSiap(t)), '_blank')
                        }
                        className="btn-primary w-full mt-3 text-xs py-2"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        Kabari {t.customer.full_name?.split(' ')[0]} via WhatsApp
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      <p className="text-[11px] text-slate-500 flex items-start gap-1.5">
        <MessageCircle className="h-3.5 w-3.5 flex-shrink-0 mt-px" />
        Notifikasi WhatsApp tetap semi-manual: tombol di atas membuka WhatsApp
        dengan teks yang sudah disiapkan. Kamu tetap menekan tombol kirim di sana.
      </p>
    </div>
  )
}
