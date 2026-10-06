import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { OPSI_PER_HALAMAN } from '../services/api'
import { cn } from '../utils/helpers'

/**
 * Kontrol paginasi untuk tabel admin.
 *
 * Nomor halaman yang ditampilkan dibatasi (misal 5 tombol) dengan elipsis di
 * kedua sisinya. Tanpa itu, tabel dengan 200 baris akan menghasilkan 200
 * tombol dan membuat halaman melebar.
 */

/**
 * Susun daftar nomor halaman: selalu halaman 1 dan terakhir, plus maksimal
 * `jendela` nomor di sekitar halaman aktif.
 * Contoh (jendela 1, halaman 7 dari 20): [1, '…', 6, 7, 8, '…', 20]
 */
export function nomorHalaman(halaman, totalHalaman, jendela = 1) {
  if (totalHalaman <= 1) return [1]

  const nomor = new Set([1, totalHalaman])
  for (let i = halaman - jendela; i <= halaman + jendela; i += 1) {
    if (i >= 1 && i <= totalHalaman) nomor.add(i)
  }

  const urut = [...nomor].sort((a, b) => a - b)
  const hasil = []
  let sebelumnya = 0
  for (const n of urut) {
    if (sebelumnya && n - sebelumnya > 1) hasil.push('…')
    hasil.push(n)
    sebelumnya = n
  }
  return hasil
}

/** Jarak "1-25 dari 128" untuk baris yang sedang tampil. */
export function rentangBaris(halaman, perHalaman, total) {
  if (total === 0) return '0 data'
  const dari = (halaman - 1) * perHalaman + 1
  const sampai = Math.min(halaman * perHalaman, total)
  return `${dari}-${sampai} dari ${total}`
}

export default function Pagination({
  halaman,
  totalHalaman,
  total,
  perHalaman,
  onGantiHalaman,
  onGantiPerHalaman,
  label = 'data',
  jendela = 1,
}) {
  const nomor = nomorHalaman(halaman, totalHalaman, jendela)

  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3 text-sm text-slate-500">
        <span>
          Menampilkan <span className="font-medium text-slate-700">{rentangBaris(halaman, perHalaman, total)}</span>{' '}
          {label}
        </span>
        <select
          value={perHalaman}
          onChange={(e) => onGantiPerHalaman(Number(e.target.value))}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          aria-label="Jumlah baris per halaman"
        >
          {OPSI_PER_HALAMAN.map((n) => (
            <option key={n} value={n}>
              {n} / halaman
            </option>
          ))}
        </select>
      </div>

      {totalHalaman > 1 && (
        <nav className="flex items-center gap-1" aria-label="Paginasi">
          <button
            onClick={() => onGantiHalaman(1)}
            disabled={halaman === 1}
            className="btn-ghost h-8 px-2 text-slate-500 disabled:opacity-40"
            title="Halaman pertama"
            aria-label="Halaman pertama"
          >
            <ChevronsLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => onGantiHalaman(halaman - 1)}
            disabled={halaman === 1}
            className="btn-ghost h-8 px-2 text-slate-500 disabled:opacity-40"
            title="Sebelumnya"
            aria-label="Halaman sebelumnya"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          {nomor.map((n) =>
            n === '…' ? (
              <span key={`elipsis-${n}`} className="px-1 text-sm text-slate-400">
                …
              </span>
            ) : (
              <button
                key={n}
                onClick={() => onGantiHalaman(n)}
                aria-current={n === halaman ? 'page' : undefined}
                className={cn(
                  'h-8 min-w-8 rounded-lg px-2 text-sm font-medium transition-colors',
                  n === halaman
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100',
                )}
              >
                {n}
              </button>
            ),
          )}

          <button
            onClick={() => onGantiHalaman(halaman + 1)}
            disabled={halaman >= totalHalaman}
            className="btn-ghost h-8 px-2 text-slate-500 disabled:opacity-40"
            title="Berikutnya"
            aria-label="Halaman berikutnya"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={() => onGantiHalaman(totalHalaman)}
            disabled={halaman >= totalHalaman}
            className="btn-ghost h-8 px-2 text-slate-500 disabled:opacity-40"
            title="Halaman terakhir"
            aria-label="Halaman terakhir"
          >
            <ChevronsRight className="h-4 w-4" />
          </button>
        </nav>
      )}
    </div>
  )
}