import { ChevronDown } from 'lucide-react'
import { cn } from '../../utils/helpers'
import { NAMA_BULAN } from '../../utils/periode'

/**
 * Pemilih periode laporan: bulan & tahun (simpel).
 *
 * - Bulan: select 1-12
 * - Tahun: select 2026..(tahun depan), < 2026 disabled
 * - Tidak ada preset "Bulan ini/Bulan lalu/Tahun ini/Semua"
 * - Backend yang hitung batas, frontend kirim bulan + tahun apa adanya.
 */
export default function PilihPeriode({ nilai, onGanti, className }) {
  const { bulan, tahun } = nilai
  const tahunSekarang = new Date().getFullYear()

  // Tahun minimal 2026, maksimal tahun depan
  const tahunMin = 2026
  const tahunMax = new Date().getFullYear() + 1

  const tahunOpsi = []
  for (let y = tahunMax; y >= 2026; y--) {
    tahunOpsi.push(y)
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-3', className)}>
      {/* Bulan */}
      <select
        value={bulan}
        onChange={(e) => onGanti({ ...nilai, bulan: Number(e.target.value) })}
        className="rounded-xl border border-primary-300 bg-primary-50 px-3 py-2 text-sm text-primary-700 cursor-pointer"
        aria-label="Bulan"
      >
        {['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'].map((n, i) => (
          <option key={n} value={i + 1}>
            {n}
          </option>
        ))}
      </select>

      {/* Tahun */}
      <select
        value={tahun}
        onChange={(e) => onGanti({ ...nilai, tahun: Number(e.target.value) })}
        className={cn(
          'rounded-xl border px-3 py-2 text-sm cursor-pointer',
          tahun < 2026
            ? 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed'
            : 'border-primary-300 bg-primary-50 text-primary-700 cursor-pointer'
        )}
        aria-label="Tahun"
        disabled={false} // biarkan user pilih, validasi di backend
      >
        {Array.from({ length: new Date().getFullYear() + 1 - 2026 }, (_, i) => 2026 + i)
          .reverse()
          .map((y) => (
            <option key={y} value={y} disabled={y < 2026}>
              {y}
            </option>
          ))}
      </select>

      <span className="text-xs text-slate-500 whitespace-nowrap">
        Periode: {['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'][Number(nilai.bulan) - 1]} {nilai.tahun}
      </span>
    </div>
  )
}