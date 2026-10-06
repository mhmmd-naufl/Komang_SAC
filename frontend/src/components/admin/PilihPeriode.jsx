import { ChevronDown } from 'lucide-react'
import { cn } from '../../utils/helpers'
import { NAMA_BULAN, PRESET, labelPeriode } from '../../utils/periode'

/**
 * Pemilih periode laporan: bulan atau tahun.
 *
 * Sifatnya Controlled -- nilai dikirim ke atas lewat `nilai` dan `onGanti`.
 * Dashboard dan panel analytics memakai satu state periode yang sama supaya
 * angka kartu, grafik, dan ringkasan AI pasti berasal dari periode yang sama.
 * Kalau masing-masing punya state sendiri, cepat atau lambat keduanya akan
 * berbeda dan layar menampilkan angka yang tidak bisa dipertanggungjawabkan.
 *
 * Ada empat preset cepat (bulan ini, bulan lalu, tahun ini, semua waktu) plus
 * pemilih bulan/tahun untuk melihat periode yang bukan sekarang.
 */
export default function PilihPeriode({ nilai, onGanti, className }) {
  const preset = nilai.preset

  // Tahun yang bisa dipilih: 3 tahun ke belakang sampai tahun depan, supaya
  // laporan tahun lalu bisa dibuka tanpa harus mengetik angka.
  const tahunSekarang = new Date().getFullYear()
  const tahunOpsi = []
  for (let y = tahunSekarang + 1; y >= tahunSekarang - 3; y--) {
    tahunOpsi.push(y)
  }

  const setPreset = (kunci) => {
    if (kunci === 'tahun_ini' || kunci === 'semua') {
      onGanti({ ...nilai, preset: kunci })
      return
    }
    if (kunci === 'bulan_ini' || kunci === 'bulan_lalu') {
      const sekarang = new Date()
      const d =
        kunci === 'bulan_ini'
          ? new Date(sekarang.getFullYear(), sekarang.getMonth(), 1)
          : new Date(sekarang.getFullYear(), sekarang.getMonth() - 1, 1)
      onGanti({ preset: kunci, bulan: d.getMonth() + 1, tahun: d.getFullYear() })
      return
    }
    // 'kustom' -- pakai bulan/tahun yang sedang selected, atau default ke
    // bulan berjalan kalau belum ada.
    const sekarang = new Date()
    onGanti({
      preset: 'kustom',
      bulan: nilai.bulan || sekarang.getMonth() + 1,
      tahun: nilai.tahun || tahunSekarang,
    })
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <div
        className="flex items-center gap-1 rounded-xl bg-slate-100 p-1"
        role="group"
        aria-label="Pilih periode"
      >
        {PRESET.map((p) => (
          <button
            key={p.kunci}
            onClick={() => setPreset(p.kunci)}
            aria-pressed={preset === p.kunci}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
              preset === p.kunci
                ? 'bg-white text-primary-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-800'
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Pemicu pemilih bulan/tahun. Disembunyikan begitu mode kustom aktif,
          karena pemilih bulan/tahunnya sendiri sudah tampil di sampingnya --
          menampilkan keduanya membuat baris kontrol terlihat berbelit tanpa
          menambah kemampuan apa pun. */}
      {preset !== 'kustom' && (
        <div className="relative">
          <select
            // Value selalu 'kustom': dropdown ini tidak pernah "memilih" apa pun,
            // cuma membuka pemilih bulan/tahun. Meng controlled-nya ke nilai
            // sebenarnya akan membuat select melompat balik sendiri setelah
            // pengguna memilih bulan.
            value="kustom"
            onChange={() => setPreset('kustom')}
            className={cn(
              'appearance-none pl-3 pr-8 rounded-xl border text-sm transition-colors cursor-pointer',
              'border-slate-200 bg-white text-slate-600 hover:border-primary-300'
            )}
            aria-label="Pilih bulan atau tahun tertentu"
          >
            <option value="kustom">Bulan/Tahun…</option>
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          />
        </div>
      )}

      {preset === 'kustom' && (
        <>
          <select
            value={nilai.bulan}
            onChange={(e) => onGanti({ ...nilai, bulan: Number(e.target.value) })}
            className="rounded-xl border border-primary-300 bg-primary-50 px-3 py-2 text-sm text-primary-700 cursor-pointer"
            aria-label="Bulan"
          >
            {NAMA_BULAN.map((n, i) => (
              <option key={n} value={i + 1}>
                {n}
              </option>
            ))}
          </select>
          <select
            value={nilai.tahun}
            onChange={(e) => onGanti({ ...nilai, tahun: Number(e.target.value) })}
            className="rounded-xl border border-primary-300 bg-primary-50 px-3 py-2 text-sm text-primary-700 cursor-pointer"
            aria-label="Tahun"
          >
            {tahunOpsi.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </>
      )}

      <span className="text-xs text-slate-500 whitespace-nowrap">{labelPeriode(nilai)}</span>
    </div>
  )
}