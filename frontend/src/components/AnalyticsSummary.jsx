import { useCallback, useEffect, useState } from 'react'
import {
  Sparkles,
  RefreshCw,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  Package,
  Footprints,
} from 'lucide-react'
import { analyticsApi } from '../services/api'
import { formatRupiah, cn } from '../utils/helpers'

/**
 * Panel "Ringkasan Bisnis" untuk dashboard admin.
 *
 * Dua sumber, ditampilkan apa adanya supaya user tahu yang mana yang dia baca:
 *   - 'ai'       : naratif dari OpenRouter (model gratis).
 *   - 'fallback' : dihitung dari aturan di backend, tanpa jaringan.
 *   - 'error'    : backend gagal menghitung; angka di bawah tetap valid.
 *
 * Komponen ini tidak pernah menampilkan layar kosong: kalau ringkasan gagal,
 * facts yang sudah terambil tetap dirender.
 */

const LEBEL_SUMBER = {
  ai: { label: 'Ringkasan AI', color: 'bg-primary-100 text-primary-800', Icon: Sparkles },
  fallback: {
    label: 'Ringkasan otomatis',
    color: 'bg-slate-100 text-slate-700',
    Icon: TrendingUp,
  },
  error: { label: 'Ringkasan gagal', color: 'bg-rose-100 text-rose-800', Icon: AlertTriangle },
}

const SUMBER_DEFAULT = {
  label: 'Ringkasan otomatis',
  color: 'bg-slate-100 text-slate-700',
  Icon: TrendingUp,
}

function StatKartu({ label, nilai, sub, Icon, warna = 'text-primary-600 bg-primary-50' }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4">
      <div className="flex items-center gap-2.5">
        <span className={cn('h-8 w-8 rounded-lg flex items-center justify-center', warna)}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-xs font-medium text-slate-500">{label}</span>
      </div>
      <p className="mt-2.5 text-xl font-bold text-slate-900">{nilai}</p>
      {sub && <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>}
    </div>
  )
}

function TrenBadge({ persen }) {
  if (persen === null || persen === undefined) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
        <Minus className="h-3 w-3" /> belum ada pembanding
      </span>
    )
  }
  const naik = persen > 0
  const turun = persen < 0
  const warna = naik
    ? 'bg-emerald-50 text-emerald-700'
    : turun
      ? 'bg-rose-50 text-rose-700'
      : 'bg-slate-100 text-slate-600'
  const Icon = naik ? TrendingUp : turun ? TrendingDown : Minus
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold', warna)}>
      <Icon className="h-3 w-3" />
      {Math.abs(persen)}% vs 7 hari lalu
    </span>
  )
}

/* Grafik batang sederhana. Tanpa library tambahan supaya bundle tetap kecil. */
function GrafikTren({ data }) {
  const maks = Math.max(1, ...data.map((d) => d.jumlah))
  return (
    <div className="flex items-end gap-1 h-24 mt-3" role="img" aria-label="Tren transaksi 14 hari terakhir">
      {data.map((d) => (
        <div key={d.tanggal} className="flex-1 group relative">
          <div
            className="w-full rounded-t bg-primary-200 group-hover:bg-primary-500 transition-colors"
            style={{ height: `${Math.max(3, (d.jumlah / maks) * 88)}px` }}
          />
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block whitespace-nowrap bg-slate-900 text-white text-[10px] px-2 py-1 rounded pointer-events-none z-10">
            {d.tanggal.slice(5)}: {d.jumlah} ({formatRupiah(d.omzet)})
          </div>
        </div>
      ))}
    </div>
  )
}

export default function AnalyticsSummary() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const muat = useCallback(async (diam = false) => {
    if (!diam) setLoading(true)
    setError(null)
    try {
      const res = await analyticsApi.summary()
      setData(res.data)
    } catch (err) {
      setError(err?.friendlyMessage || 'Gagal memuat ringkasan.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    muat()
  }, [muat])

  const fakta = data?.fakta || {}
  const sumber = LEBEL_SUMBER[data?.sumber] || SUMBER_DEFAULT

  return (
    <div className="card p-5 sm:p-6">
      {/* Kepala */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary-600" />
            Ringkasan Bisnis
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Analisis 14 hari terakhir, dihitung dari data transaksi dan stok.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className={cn('badge', sumber.color)}>
            <sumber.Icon className="h-3 w-3 mr-1" />
            {sumber.label}
          </span>
          <button
            onClick={() => muat()}
            disabled={loading}
            className="btn-secondary px-3 py-1.5 text-xs"
            title="Muat ulang ringkasan"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            <span className="hidden sm:inline">Perbarui</span>
          </button>
        </div>
      </div>

      {/* Status pemuatan */}
      {loading && (
        <div className="mt-5 space-y-2">
          <div className="h-3 rounded bg-slate-100 animate-pulse w-full" />
          <div className="h-3 rounded bg-slate-100 animate-pulse w-11/12" />
          <div className="h-3 rounded bg-slate-100 animate-pulse w-9/12" />
          <p className="text-[11px] text-slate-400 pt-1">Mengambil data, lalu menulis ringkasan…</p>
        </div>
      )}

      {error && !loading && (
        <div className="mt-5 flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Ringkasan tidak bisa dimuat.</p>
            <p className="text-xs mt-0.5">{error}</p>
            <button onClick={() => muat()} className="text-xs font-semibold underline mt-1.5">
              Coba lagi
            </button>
          </div>
        </div>
      )}

      {!loading && data && (
        <>
          {/* Narasi */}
          <div
            className={cn(
              'mt-5 rounded-xl p-4 border text-sm leading-relaxed',
              data.sumber === 'ai'
                ? 'bg-primary-50/60 border-primary-100 text-slate-700'
                : data.sumber === 'error'
                  ? 'bg-rose-50/60 border-rose-100 text-rose-800'
                  : 'bg-slate-50 border-slate-200 text-slate-700'
            )}
          >
            {data.ringkasan.split('\n').filter(Boolean).map((paragraf, i) => (
              <p key={i} className={i > 0 ? 'mt-2.5' : ''}>
                {paragraf}
              </p>
            ))}
          </div>

          {data.catatan && (
            <p className="mt-2.5 text-[11px] text-slate-500 flex items-start gap-1.5">
              <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-px" />
              {data.catatan}
            </p>
          )}

          {data.model && (
            <p className="mt-1 text-[10px] text-slate-400 font-mono">{data.model}</p>
          )}

          {/* Angka pendukung */}
          {fakta.total_transaksi !== undefined && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
                <StatKartu
                  label="Omzet 7 hari"
                  nilai={formatRupiah(fakta.omzet_7h)}
                  sub={<TrenBadge persen={fakta.perubahan_omzet_persen} />}
                  Icon={TrendingUp}
                />
                <StatKartu
                  label="Transaksi 7 hari"
                  nilai={fakta.transaksi_7h}
                  sub={`${fakta.transaksi_masih_jalan} masih jalan`}
                  Icon={Footprints}
                  warna="bg-cyan-50 text-cyan-600"
                />
                <StatKartu
                  label="Stok kritis"
                  nilai={fakta.jumlah_stok_kritis}
                  sub={fakta.jumlah_stok_kritis ? 'perlu dibeli' : 'semua aman'}
                  Icon={Package}
                  warna={
                    fakta.jumlah_stok_kritis
                      ? 'bg-rose-50 text-rose-600'
                      : 'bg-emerald-50 text-emerald-600'
                  }
                />
                <StatKartu
                  label="Pekerjaan tertahan"
                  nilai={fakta.jumlah_tertahan}
                  sub="lebih dari 2 hari"
                  Icon={Clock}
                  warna={
                    fakta.jumlah_tertahan
                      ? 'bg-amber-50 text-amber-600'
                      : 'bg-emerald-50 text-emerald-600'
                  }
                />
              </div>

              <div className="grid lg:grid-cols-3 gap-5 mt-5">
                {/* Tren */}
                <div className="lg:col-span-2 rounded-xl border border-slate-100 p-4">
                  <p className="text-xs font-semibold text-slate-600">Transaksi per hari (14 hari)</p>
                  <GrafikTren data={fakta.tren_harian || []} />
                  <p className="text-[10px] text-slate-400 mt-1.5 text-center">
                    Arahkan kursor ke batang untuk lihat detail
                  </p>
                </div>

                {/* Butuh perhatian */}
                <div className="space-y-4">
                  {fakta.stok_kritis?.length > 0 && (
                    <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-4">
                      <p className="text-xs font-semibold text-rose-800 mb-2">Stok di bawah minimum</p>
                      <ul className="space-y-1.5">
                        {fakta.stok_kritis.slice(0, 4).map((s, i) => (
                          <li key={i} className="text-[11px] text-rose-700 flex justify-between gap-2">
                            <span className="truncate">{s.nama}</span>
                            <span className="font-semibold shrink-0">
                              {s.sisa}/{s.minimum} {s.satuan}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {fakta.pekerjaan_tertahan?.length > 0 && (
                    <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-4">
                      <p className="text-xs font-semibold text-amber-800 mb-2">Pekerjaan tertahan</p>
                      <ul className="space-y-1.5">
                        {fakta.pekerjaan_tertahan.slice(0, 4).map((t, i) => (
                          <li key={i} className="text-[11px] text-amber-800 flex justify-between gap-2">
                            <span className="font-mono">{t.kode}</span>
                            <span className="shrink-0">
                              {t.status} · {t.umur_hari} hari
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
