import { useMemo } from 'react'
import MonthPicker from 'react-month-picker'
import 'react-month-picker/css/month-picker.css'
import { cn } from '../../utils/helpers'
import { NAMA_BULAN } from '../../utils/periode'

/**
 * Pemilih periode laporan: bulan & tahun (multi-select) via react-month-picker.
 *
 * State dikontrol oleh parent via `nilai` (object { bulan: number[], tahun: number[] })
 * dan callback `onGanti({ bulan: number[], tahun: number[] }).
 *
 * react-month-picker menyimpan nilai sebagai array of { year, month }.
 * Kita konversi ke/dari format internal app.
 */
export default function PilihPeriode({ nilai, onGanti, className }) {
  const { bulan, tahun } = nilai

  // Konversi dari format app { bulan: number[], tahun: number[] }
  // ke format library: [{ year, month }, ...]
  const pickerValue = useMemo(() => {
    const result = []
    for (const t of tahun) {
      for (const b of bulan) {
        result.push({ year: t, month: b })
      }
    }
    return result
  }, [bulan, tahun])

  // Konversi dari format library ke format app
  const handleChange = (val) => {
    if (!Array.isArray(val)) return
    const newBulan = [...new Set(val.map((v) => v.month))].sort((a, b) => a - b)
    const newTahun = [...new Set(val.map((v) => v.year))].sort((a, b) => a - b)
    onGanti({ bulan: newBulan, tahun: newTahun })
  }

  // Tahun minimal 2026, maksimal tahun depan
  const tahunMin = 2026
  const tahunMax = new Date().getFullYear() + 1
  const years = []
  for (let y = tahunMax; y >= tahunMin; y--) {
    years.push(y)
  }

  const labelPeriode = `${['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des'][bulan[0]-1]} ${tahun[0]}${bulan.length > 1 || tahun.length > 1 ? ' +' : ''}`

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className={cn('month-picker-wrapper', className)}>
        <MonthPicker
          years={years}
          value={pickerValue}
          lang={NAMA_BULAN.map((n) => n.slice(0, 3))}
          onChange={handleChange}
        />
      </div>

      <button
        onClick={() => onGanti({ ...nilai, bulan: [new Date().getMonth() + 1], tahun: [new Date().getFullYear()] })}
        className="btn-secondary px-3 py-2 text-xs"
        title="Reset ke bulan ini"
      >
        Reset
      </button>

      <span className="text-xs text-slate-500 whitespace-nowrap self-center">
        Periode: {labelPeriode}
      </span>
    </div>
  )
}
