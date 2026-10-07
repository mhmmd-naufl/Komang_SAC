import { useEffect, useRef, useState } from 'react'
import { Calendar, ChevronDown } from 'lucide-react'
import { cn } from '../../utils/helpers'
import { NAMA_BULAN } from '../../utils/periode'

/**
 * Pemilih periode laporan: bulan & tahun (multi-select).
 *
 * State dikontrol oleh parent via `nilai` (object { bulan: number[], tahun: number[] })
 * dan callback `onGanti({ bulan: number[], tahun: number[] }).
 *
 * Perubahan TIDAK langsung diterapkan — user harus klik "Terapkan" dulu.
 * Ini mencegah dashboard refresh berkali-kali saat user masih memilih.
 */
export default function PilihPeriode({ nilai, onGanti, className }) {
  const { bulan, tahun } = nilai
  const [buka, setBuka] = useState(false)
  const [draft, setDraft] = useState({ bulan, tahun })
  const ref = useRef(null)

  // Tutup saat klik di luar
  useEffect(() => {
    if (!buka) return
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setBuka(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [buka])

  // Sync draft saat nilai berubah dari luar (mis. tombol Reset)
  useEffect(() => {
    setDraft({ bulan, tahun })
  }, [bulan, tahun])

  const toggleBulan = (b) => {
    const baru = draft.bulan.includes(b)
      ? draft.bulan.filter((x) => x !== b)
      : [...draft.bulan, b].sort((a, b2) => a - b2)
    setDraft({ ...draft, bulan: baru })
  }

  const toggleTahun = (t) => {
    const baru = draft.tahun.includes(t)
      ? draft.tahun.filter((x) => x !== t)
      : [...draft.tahun, t].sort((a, b) => a - b)
    setDraft({ ...draft, tahun: baru })
  }

  const terapkan = () => {
    onGanti(draft)
    setBuka(false)
  }

  const reset = () => {
    const baru = { bulan: [new Date().getMonth() + 1], tahun: [new Date().getFullYear()] }
    setDraft(baru)
    onGanti(baru)
    setBuka(false)
  }

  const tahunMin = 2026
  const tahunMax = new Date().getFullYear() + 1
  const daftarTahun = []
  for (let y = tahunMax; y >= tahunMin; y--) daftarTahun.push(y)

  const labelPeriode = `${['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des'][bulan[0]-1]} ${tahun[0]}${bulan.length > 1 || tahun.length > 1 ? ' +' : ''}`

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div ref={ref} className="relative">
        <button
          onClick={() => setBuka(!buka)}
          className={cn(
            'flex items-center gap-2 rounded-xl border px-3 py-2 text-sm cursor-pointer transition-colors',
            buka
              ? 'border-primary-500 bg-primary-50 text-primary-700'
              : 'border-primary-300 bg-primary-50 text-primary-700 hover:border-primary-400',
          )}
          aria-expanded={buka}
          aria-haspopup="true"
        >
          <Calendar className="h-4 w-4" />
          <span className="font-medium">{labelPeriode}</span>
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', buka && 'rotate-180')} />
        </button>

        {buka && (
          <div className="absolute z-50 mt-2 w-72 rounded-xl border border-slate-200 bg-white shadow-lg p-4 space-y-4">
            {/* Bulan */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Bulan</p>
              <div className="grid grid-cols-3 gap-1.5">
                {NAMA_BULAN.map((nama, i) => {
                  const num = i + 1
                  const aktif = draft.bulan.includes(num)
                  return (
                    <button
                      key={nama}
                      onClick={() => toggleBulan(num)}
                      className={cn(
                        'px-2 py-1.5 rounded-lg text-xs font-medium transition-colors',
                        aktif
                          ? 'bg-primary-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                      )}
                    >
                      {nama.slice(0, 3)}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Tahun */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Tahun</p>
              <div className="grid grid-cols-3 gap-1.5">
                {daftarTahun.map((y) => {
                  const aktif = draft.tahun.includes(y)
                  return (
                    <button
                      key={y}
                      onClick={() => toggleTahun(y)}
                      className={cn(
                        'px-2 py-1.5 rounded-lg text-xs font-medium transition-colors',
                        aktif
                          ? 'bg-primary-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                      )}
                    >
                      {y}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Aksi */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <button
                onClick={() => setDraft({ bulan: [], tahun: [] })}
                className="text-xs text-slate-500 hover:text-slate-700"
              >
                Semua
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={reset}
                  className="btn-secondary px-3 py-1.5 text-xs"
                >
                  Reset
                </button>
                <button
                  onClick={terapkan}
                  className="btn-primary px-3 py-1.5 text-xs"
                >
                  Terapkan
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <span className="text-xs text-slate-500 whitespace-nowrap self-center">
        Periode: {labelPeriode}
      </span>
    </div>
  )
}
