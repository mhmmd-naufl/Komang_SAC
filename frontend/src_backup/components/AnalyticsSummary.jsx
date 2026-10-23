import { Sparkles, RefreshCw, AlertTriangle, TrendingUp, Lightbulb } from 'lucide-react'
import { cn } from '../utils/helpers'

/**
 * Panel "Ringkasan & Saran" untuk dashboard admin.
 *
 * PEMBATASAN YANG DISEPAKATI: komponen ini HANYA menampilkan dua hal --
 * ringkasan dan saran. Tidak ada angka, grafik, atau tabel di sini.
 *
 * Semua angka dan grafik ada di AdminDashboard (yang memanggil API-nya sendiri).
 * Alasannya bukan sekadar tampilan:
 *
 *   - Angka dan grafik HARUS dihitung deterministik di backend. Kalau lewat
 *     model bahasa, dua refresh dengan data yang sama bisa memberi angka
 *     berbeda, dan pemilik tidak bisa dipakai untuk menghitung bayar teknisi.
 *   - Model gratis bisa lambat atau mati. Kalau panel ini ikut menggambar
 *     grafik, satu timeout membuat separuh dashboard kosong.
 *
 * Komponen ini murni presentational: data datang dari props. Jadi panel AI tidak
 * punya request sendiri dan tidak bisa menampilkan angka untuk periode yang berbeda
 * dari dashboard.
 *
 * Dua sumber ditampilkan apa adanya supaya user tahu yang mana yang dia baca:
 *   - 'ai'       : naratif + saran dari OpenRouter (model gratis).
 *   - 'fallback' : dihitung dari aturan di backend, tanpa jaringan.
 *   - 'error'    : backend gagal menghitung; dashboard di bawah tetap valid.
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

const SUMBER_DEFAULT = LEBEL_SUMBER.fallback

export default function AnalyticsSummary({ data, loading, error, onPerbarui, labelPeriode }) {
  const sumber = LEBEL_SUMBER[data?.sumber] || SUMBER_DEFAULT
  const saran = data?.saran || []

  return (
    <div className="card p-5 sm:p-6">
      {/* Kepala */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary-600" />
            Ringkasan &amp; Saran
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Tulisan otomatis dari data {labelPeriode ? `periode ${labelPeriode}` : 'transaksi dan stok'}.
            Angka dan grafik ada di dashboard atas.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className={cn('badge', sumber.color)}>
            <sumber.Icon className="h-3 w-3 mr-1" />
            {sumber.label}
          </span>
          <button
            onClick={onPerbarui}
            disabled={loading}
            className="btn-secondary px-3 py-1.5 text-xs"
            title="Tulis ulang ringkasan dan saran"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            <span className="hidden sm:inline">Tulis ulang</span>
          </button>
        </div>
      </div>

      {/* Status pemuatan */}
      {loading && (
        <div className="mt-5 space-y-2">
          <div className="h-3 rounded bg-slate-100 animate-pulse w-full" />
          <div className="h-3 rounded bg-slate-100 animate-pulse w-11/12" />
          <div className="h-3 rounded bg-slate-100 animate-pulse w-9/12" />
          <p className="text-[11px] text-slate-400 pt-1">
            Mengambil angka, lalu menulis ringkasan dan saran…
          </p>
        </div>
      )}

      {error && !loading && (
        <div className="mt-5 flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Ringkasan tidak bisa dimuat.</p>
            <p className="text-xs mt-0.5">{error}</p>
            <button onClick={onPerbarui} className="text-xs font-semibold underline mt-1.5">
              Coba lagi
            </button>
          </div>
        </div>
      )}

      {!loading && !error && data && (
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
            {String(data.ringkasan || '')
              .split('\n')
              .filter(Boolean)
              .map((paragraf, i) => (
                <p key={i} className={i > 0 ? 'mt-2.5' : ''}>
                  {paragraf}
                </p>
              ))}
          </div>

          {/* Saran -- berpoin, karena ini yang harus dieksekusi */}
          {saran.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 mb-2">
                <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
                Saran ({saran.length})
              </p>
              <ol className="space-y-2">
                {saran.map((s, i) => (
                  <li
                    key={i}
                    className="flex gap-2.5 text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2.5"
                  >
                    <span
                      className="shrink-0 w-5 h-5 rounded-full bg-primary-100 text-primary-700 text-[11px] font-bold flex items-center justify-center mt-px"
                      aria-hidden="true"
                    >
                      {i + 1}
                    </span>
                    <span className="leading-relaxed">{s}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {saran.length === 0 && !loading && (
            <p className="mt-3 text-xs text-slate-400">
              Tidak ada saran untuk periode ini. Kalau kondisi ini terasa aneh, cek lagi setelah ada
              pekerjaan yang selesai.
            </p>
          )}

          {data.catatan && (
            <p className="mt-3 text-[11px] text-slate-500 flex items-start gap-1.5">
              <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-px" />
              {data.catatan}
            </p>
          )}

          {data.model && (
            <p className="mt-1 text-[10px] text-slate-400 font-mono">{data.model}</p>
          )}
        </>
      )}
    </div>
  )
}