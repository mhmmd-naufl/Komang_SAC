import { ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '../../utils/helpers'
import { NAMA_BULAN } from '../../utils/periode'

/**
 * Pemilih periode laporan: bulan & tahun (multi-select).
 *
 * - Bulan: select multiple 1-12
 * - Tahun: select multiple 2026..(tahun depan), < 2026 disabled
 * - Tombol "Terapkan" untuk menerapkan filter
 *
 * State dikontrol oleh parent via `nilai` (object { bulan: number[], tahun: number[] })
 * dan callback `onGanti({ bulan: number[], tahun: number[] })`.
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

  const handleBulanChange = (e) => {
    const val = Number(e.target.value)
    const baru = bulan.includes(val)
      ? bulan.filter((b) => b !== val)
      : [...bulan, val].sort((a, b) => a - b)
    onGanti({ ...nilai, bulan: baru })
  }

  const handleTahunChange = (e) => {
    const val = Number(e.target.value)
    const baru = tahun.includes(val)
      ? tahun.filter((t) => t !== val)
      : [...tahun, val].sort((a, b) => a - b)
    onGanti({ ...nilai, tahun: baru })
  }

  const labelPeriode = `${['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des'][bulan[0]-1]} ${tahun[0]}`

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Bulan (multi-select) */}
      <select
        multiple
        value={bulan}
        onChange={handleBulanChange}
        className="rounded-xl border border-primary-300 bg-primary-50 px-3 py-2 text-sm text-primary-700 cursor-pointer"
        size={3}
        aria-label="Pilih bulan"
      >
        {['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'].map((n, i) => (
          <option key={n} value={i + 1}>
            {n}
          </option>
        ))}
      </select>

      {/* Tahun (multi-select) */}
      <select
        multiple
        value={tahun}
        onChange={(e) => {
          const vals = Array.from(e.target.selectedOptions, o => Number(o.value))
          onGanti({ ...nilai, tahun: vals.sort((a, b) => a - b) })
        }}
        className="rounded-xl border border-primary-300 bg-primary-50 px-3 py-2 text-sm text-primary-700 cursor-pointer"
        size={3}
        aria-label="Pilih tahun"
      >
        {tahunOpsi.map((y) => (
          <option key={y} value={y} disabled={y < 2026}>
            {y}
          </option>
        ))}
      </select>

      <button
        onClick={() => onGanti({ ...nilai, bulan: [new Date().getMonth() + 1], tahun: [new Date().getFullYear()] })}
        className="btn-secondary px-3 py-2 text-xs"
        title="Reset ke bulan ini"
      >
        Reset
      </button>

      <button
        onClick={() => onGanti({ ...nilai })}
        className="btn-primary px-3 py-2 text-xs"
      >
        Terapkan
      </button>

      <span className="text-xs text-slate-500 whitespace-nowrap self-center">
        Periode: {['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des'][bulan[0]-1]} {tahun[0]}{bulan.length > 1 || tahun.length > 1 ? ' +' : ''}
      </span>
    </div>
  )
}