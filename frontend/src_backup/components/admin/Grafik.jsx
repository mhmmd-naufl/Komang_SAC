import { useMemo, useState } from 'react'
import { cn, formatRupiah } from '../../utils/helpers'
import { garisY } from '../../utils/periode'

/**
 * Grafik batang sederhana. Tanpa library chart (recharts/chart.js) supaya
 * bundle frontend tetap kecil dan tidak ada dependency yang harus di-audit.
 *
 * DUA HAL YANG PERNAH BIKIN TEKSA NABRAK, dan sengaja ditangani di sini:
 *
 * 1. Label sumbu X. Kalau semua label dipaksakan sekaligus di layar sempit,
 *    "1 Okt" menimpa "2 Okt" dan terbaca sebagai satu blok yang tidak berguna.
 *    Aturannya: satu slot label minimal 44px. Kalau tidak muat, area grafik
 *    menggulir horizontal -- lebih baik daripada label saling tumpuk.
 *
 * 2. Tooltip. Versi sebelumnya memakai `bottom-full` di dalam kotak batang,
 *    sehingga tooltip melayang di atas batang dan menimpa judul kartu. Sekarang
 *    tooltip digambar di lapisan terpisah di PUNCAK area plot, lalu dijepit
 *    horizontal: batang pertama rata kiri, terakhir rata kanan, sisanya di tengah.
 *    Jadi tooltip tidak pernah keluar area grafik dan tidak pernah menimpa
 *    judul maupun label sumbu X.
 */
export default function GrafikBatang({
  data = [],
  tinggi = 180,
  /** Nilai yang dipakai membandingkan tinggi batang. Default: d.jumlah */
  nilai = (d) => d.jumlah,
  formatTooltip = (d) => `${d.label}: ${d.jumlah} (${formatRupiah(d.omzet)})`,
  /** Kata benda untuk baris total, mis. "pekerjaan" atau "rupiah". */
  satuanTotal = 'pekerjaan',
  kosong = 'Belum ada data.',
  // Lebar slot label minimum dalam px. Di bawah ini, label dilewati.
  lebarLabelMin = 44,
}) {
  const [hover, setHover] = useState(null)

  const total = useMemo(() => data.reduce((s, d) => s + (nilai(d) || 0), 0), [data, nilai])
  const maks = useMemo(() => Math.max(1, ...data.map((d) => nilai(d) || 0)), [data, nilai])
  const garis = useMemo(() => garisY(maks, 4), [maks])
  const garisAtas = garis[garis.length - 1] || 1

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-slate-400"
        style={{ height: tinggi }}
      >
        {kosong}
      </div>
    )
  }

  // Setiap batang minimal 44px supaya label muat. Kalau data terlalu banyak,
  // area grafik boleh menggulir horizontal.
  const lebarSlot = Math.max(8, lebarLabelMin)
  const lebarTotal = data.length * lebarSlot

  // Posisi horizontal tooltip. Dijepit supaya tidak keluar area plot:
  // batang pertama rata kiri, terakhir rata kanan, sisanya di tengah batang.
  const gayaTooltip = (i) => {
    if (i === 0) return { left: 0 }
    if (i === data.length - 1) return { right: 0 }
    return { left: `${((i + 0.5) / data.length) * 100}%`, transform: 'translateX(-50%)' }
  }

  return (
    <div>
      <div className="flex gap-3">
        {/* Sumbu Y */}
        <div
          className="flex flex-col justify-between text-right shrink-0 text-[10px] text-slate-400 tabular-nums"
          style={{ height: tinggi, width: 34 }}
          aria-hidden="true"
        >
          {garis.slice().reverse().map((v) => (
            <span key={v} className="leading-none">
              {v >= 1000 ? `${Math.round(v / 1000)}k` : v}
            </span>
          ))}
        </div>

        {/* Area plot */}
        <div className="flex-1 min-w-0 overflow-x-auto">
          <div className="relative" style={{ minWidth: lebarTotal }}>
            {/* Garis bantu horizontal */}
            {garis.map((v) => (
              <div
                key={v}
                className="absolute left-0 right-0 border-t border-dashed border-slate-100 pointer-events-none"
                style={{ bottom: `${(v / garisAtas) * 100}%` }}
              />
            ))}

            {/* Batang */}
            <div className="relative flex items-end gap-[2px]" style={{ height: tinggi }}>
              {data.map((d, i) => {
                const v = nilai(d) || 0
                // Batang dengan nilai 0 tetap punya tinggi minimal 2px supaya
                // sumbu-x tetap terbaca ada berapa hari dalam periode ini.
                const tinggiBatang = Math.max(2, (v / garisAtas) * tinggi)
                const aktif = hover === i
                return (
                  <div
                    key={d.kunci || d.tanggal || i}
                    className="relative flex-1 flex flex-col justify-end cursor-default"
                    style={{ minWidth: lebarSlot - 2 }}
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover((h) => (h === i ? null : h))}
                  >
                    <div
                      className={cn(
                        'w-full rounded-t transition-colors',
                        aktif ? 'bg-primary-600' : 'bg-primary-200 hover:bg-primary-400'
                      )}
                      style={{ height: tinggiBatang }}
                    />
                  </div>
                )
              })}

              {/* Tooltip: lapisan terpisah di puncak area plot. */}
              {hover !== null && data[hover] && (
                <div
                  className="absolute top-0 z-20 pointer-events-none bg-slate-900 text-white text-[10px] leading-tight px-2 py-1 rounded whitespace-nowrap shadow-lg"
                  style={gayaTooltip(hover)}
                >
                  {formatTooltip(data[hover])}
                </div>
              )}
            </div>

            {/* Sumbu X */}
            <div className="flex gap-[2px] pt-1.5">
              {data.map((d, i) => (
                <div
                  key={d.kunci || d.tanggal || i}
                  className="flex-1 text-center text-[10px] text-slate-400 truncate"
                  style={{ minWidth: lebarSlot - 2 }}
                  title={d.label}
                >
                  {d.label}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <p className="mt-2 text-[11px] text-slate-400">
        Total periode:{' '}
        <span className="font-semibold text-slate-600">
          {total} {satuanTotal}
        </span>
      </p>
    </div>
  )
}

/**
 * Baris horizontal untuk hal seperti "komisi per teknisi".
 * Dipakai supaya komisi teknisi tidak cuma teks angka tapi kelihatan
 * perbandingannya.
 */
export function GrafikBatangHorizontal({ data = [], format = formatRupiah, label = 'Komisi' }) {
  const maks = Math.max(1, ...data.map((d) => (d.nilai || 0)))
  if (data.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-6">Belum ada data.</p>
  }
  return (
    <div className="space-y-2.5">
      {data.map((d) => (
        <div key={d.kunci || d.nama}>
          <div className="flex items-baseline justify-between gap-3 text-sm mb-1">
            <span className="font-medium text-slate-800 truncate">{d.nama}</span>
            <span className="text-slate-600 tabular-nums shrink-0">
              {format(d.nilai)}
              {d.keterangan && <span className="text-slate-400 text-xs ml-1">{d.keterangan}</span>}
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary-500"
              style={{ width: `${Math.max(2, ((d.nilai || 0) / maks) * 100)}%` }}
            />
          </div>
        </div>
      ))}
      <p className="text-[11px] text-slate-400 pt-0.5">{label}</p>
    </div>
  )
}