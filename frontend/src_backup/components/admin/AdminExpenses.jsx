import { useEffect, useMemo, useState } from 'react'
import { Loader2, Pencil, Plus, Receipt, Trash2, TrendingDown, TrendingUp, Minus } from 'lucide-react'
import { expensesApi } from '../../services/api'
import { useCariTunda, useTabel } from '../../hooks/useTabel'
import { cn, formatDate, formatRupiah } from '../../utils/helpers'
import { toast } from '../Toast'
import Pagination from '../Pagination'
import Modal, { Field, GagalMuat, Kosong, Memuat, SearchInput } from '../AdminUi'

// Kategori bawaan. Admin bisa mengetik kategori lain bebas -- suggestion
// bertambah sendiri dari kategori yang pernah dipakai (lihat `saranKategori`).
const KATEGORI_BAWAAN = ['listrik', 'pdam']

const FORM_AWAL = { kategori: '', jumlah: '', tanggal: '', keterangan: '' }

function hariIni() {
  // Batas atas input date: hari ini, waktu lokal pengguna (WIB di outlet).
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function AdminExpenses() {
  const tabel = useTabel({ endpoint: '/api/expenses' })
  const { setFilter } = tabel
  const [cari, setCari] = useCariTunda(setFilter)
  const [kategoriAktif, setKategoriAktif] = useState('semua')

  const [rekap, setRekap] = useState(null)
  const [form, setForm] = useState({ ...FORM_AWAL, tanggal: hariIni() })
  const [errors, setErrors] = useState({})
  const [simpan, setSimpan] = useState(false)
  const [edit, setEdit] = useState(null)
  const [sibukEdit, setSibukEdit] = useState(false)

  const muatRekap = () =>
    expensesApi.rekapMingguan()
      .then((res) => setRekap(res.data))
      .catch(() => setRekap(null)) // rekap gagal tidak boleh mematikan halaman

  useEffect(() => {
    muatRekap()
  }, [])

  // Suggestion kategori: bawaan + semua kategori yang muncul di rekap 8 minggu.
  const saranKategori = useMemo(() => {
    const set = new Set(KATEGORI_BAWAAN)
    for (const m of rekap?.riwayat || []) {
      for (const k of Object.keys(m.per_kategori || {})) set.add(k)
    }
    return [...set].sort()
  }, [rekap])

  const gantiKategori = (nilai) => {
    setKategoriAktif(nilai)
    setFilter({ kategori: nilai === 'semua' ? undefined : nilai })
  }

  const ubahField = (nama, nilai) => setForm((f) => ({ ...f, [nama]: nilai }))

  const validasi = (f) => {
    const e = {}
    if (!f.kategori.trim()) e.kategori = 'Kategori wajib diisi'
    const n = Number(f.jumlah)
    if (f.jumlah === '' || !Number.isFinite(n)) e.jumlah = 'Nominal wajib diisi'
    else if (n <= 0) e.jumlah = 'Nominal harus lebih dari nol'
    if (!f.tanggal) e.tanggal = 'Tanggal wajib diisi'
    return e
  }

  const kirim = async () => {
    const e = validasi(form)
    setErrors(e)
    if (Object.keys(e).length > 0) return

    setSimpan(true)
    try {
      await expensesApi.create({
        kategori: form.kategori.trim(),
        jumlah: Number(form.jumlah),
        tanggal: form.tanggal,
        keterangan: form.keterangan.trim() || undefined,
      })
      toast.success('Pengeluaran dicatat', `${form.kategori} ${formatRupiah(Number(form.jumlah))}.`)
      // Form direset tapi tanggal dipertahankan: saat mencatat beberapa nota
      // sekaligus, hampir semuanya bertanggal sama.
      setForm({ ...FORM_AWAL, tanggal: form.tanggal })
      setErrors({})
      tabel.muatUlang()
      muatRekap()
    } catch (err) {
      toast.error('Gagal menyimpan', err.friendlyMessage || err.message)
    } finally {
      setSimpan(false)
    }
  }

  const bukaEdit = (baris) => {
    setErrors({})
    setEdit({
      id: baris.id,
      kategori: baris.kategori ?? '',
      jumlah: baris.jumlah != null ? String(baris.jumlah) : '',
      tanggal: baris.tanggal ? String(baris.tanggal).slice(0, 10) : '',
      keterangan: baris.keterangan ?? '',
    })
  }

  const kirimEdit = async () => {
    const e = validasi(edit)
    setErrors(e)
    if (Object.keys(e).length > 0) return

    setSibukEdit(true)
    try {
      await expensesApi.update(edit.id, {
        kategori: edit.kategori.trim(),
        jumlah: Number(edit.jumlah),
        tanggal: edit.tanggal,
        keterangan: edit.keterangan.trim() || null,
      })
      toast.success('Pengeluaran diperbarui')
      setEdit(null)
      tabel.muatUlang()
      muatRekap()
    } catch (err) {
      toast.error('Gagal menyimpan', err.friendlyMessage || err.message)
    } finally {
      setSibukEdit(false)
    }
  }

  const hapus = async (baris) => {
    // Hapus dicatat lewat confirm native: satu-satunya aksi destruktif di
    // halaman ini dan tidak bisa di-undo, jadi tetap harus disengaja.
    if (!window.confirm(`Hapus catatan ${baris.kategori} ${formatRupiah(baris.jumlah)} tanggal ${formatDate(baris.tanggal)}?`)) {
      return
    }
    try {
      await expensesApi.remove(baris.id)
      toast.success('Catatan dihapus')
      tabel.muatUlang()
      muatRekap()
    } catch (err) {
      toast.error('Gagal menghapus', err.friendlyMessage || err.message)
    }
  }

  /* ---------------------------------------------------------------- */
  /* Rekap mingguan                                                    */
  /* ---------------------------------------------------------------- */

  const mingguIni = rekap?.minggu_ini
  const riwayat = rekap?.riwayat || []
  // Minggu sebelumnya untuk pembanding naik/turun.
  const mingguLalu = riwayat.length >= 2 ? riwayat[riwayat.length - 2] : null
  const selisih = mingguIni && mingguLalu ? mingguIni.total - mingguLalu.total : 0
  const totalTerbesar = Math.max(1, ...riwayat.map((m) => m.total))

  const adaFilter = Boolean(cari) || kategoriAktif !== 'semua'

  const isiTabel = tabel.loading ? (
    <Memuat baris={6} />
  ) : tabel.error ? (
    <GagalMuat pesan={tabel.error} onCobaLagi={tabel.muatUlang} />
  ) : tabel.rows.length === 0 ? (
    <Kosong
      judul={adaFilter ? 'Tidak ada hasil' : 'Belum ada pengeluaran tercatat'}
      pesan={
        adaFilter
          ? 'Coba ubah kata kunci atau kategori.'
          : 'Catat pembelian token listrik atau tagihan PDAM lewat form di atas.'
      }
    />
  ) : (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/60 text-left">
            <th className="px-4 py-3 font-semibold text-slate-600">Tanggal</th>
            <th className="px-4 py-3 font-semibold text-slate-600">Kategori</th>
            <th className="px-4 py-3 font-semibold text-slate-600">Keterangan</th>
            <th className="px-4 py-3 font-semibold text-slate-600 text-right">Jumlah</th>
            <th className="px-4 py-3 font-semibold text-slate-600 text-right">Aksi</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {tabel.rows.map((baris) => (
            <tr key={baris.id} className="hover:bg-slate-50/60">
              <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                {formatDate(baris.tanggal)}
              </td>
              <td className="px-4 py-3">
                <span className="badge-primary capitalize">{baris.kategori}</span>
              </td>
              <td className="px-4 py-3 text-slate-600 max-w-[16rem] truncate">
                {baris.keterangan || '—'}
              </td>
              <td className="px-4 py-3 text-right font-semibold text-slate-900 whitespace-nowrap">
                {formatRupiah(baris.jumlah)}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={() => bukaEdit(baris)}
                    className="p-2 rounded-lg text-slate-400 hover:bg-primary-50 hover:text-primary-600"
                    title="Ubah"
                    aria-label={`Ubah pengeluaran ${baris.kategori}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => hapus(baris)}
                    className="p-2 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    title="Hapus"
                    aria-label={`Hapus pengeluaran ${baris.kategori}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Pengeluaran</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Biaya operasional di luar bahan cuci: token listrik, PDAM, dan pengeluaran lain.
          Angkanya ikut mengurangi sisa bersih di dashboard.
        </p>
      </div>

      {/* Rekap mingguan */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm text-slate-500">Minggu ini (sejak Senin)</p>
            {mingguLalu && selisih !== 0 && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 text-[11px] font-semibold',
                  selisih > 0 ? 'text-rose-600' : 'text-emerald-600',
                )}
              >
                {selisih > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {formatRupiah(Math.abs(selisih))} vs minggu lalu
              </span>
            )}
            {mingguLalu && selisih === 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
                <Minus className="h-3 w-3" /> sama dengan minggu lalu
              </span>
            )}
          </div>
          <p className="text-2xl font-bold text-slate-900">
            {mingguIni ? formatRupiah(mingguIni.total) : '—'}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {Object.entries(mingguIni?.per_kategori || {}).map(([k, j]) => (
              <span key={k} className="badge bg-slate-100 text-slate-700 capitalize">
                {k}: {formatRupiah(j)}
              </span>
            ))}
            {mingguIni && mingguIni.total === 0 && (
              <span className="text-xs text-slate-400">Belum ada catatan minggu ini.</span>
            )}
          </div>
        </div>

        <div className="card p-5 lg:col-span-2">
          <p className="text-sm text-slate-500 mb-3">8 minggu terakhir</p>
          {riwayat.length === 0 ? (
            <p className="text-sm text-slate-400">Memuat rekap...</p>
          ) : (
            <div className="flex items-end gap-2 h-24">
              {riwayat.map((m) => (
                <div key={m.senin} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                  <span className="text-[10px] font-medium text-slate-600 truncate max-w-full">
                    {m.total > 0 ? formatRupiah(m.total) : ''}
                  </span>
                  <div
                    className={cn(
                      'w-full rounded-t-md',
                      m.senin === mingguIni?.senin ? 'bg-primary-500' : 'bg-primary-200',
                    )}
                    style={{ height: `${Math.max(4, Math.round((m.total / totalTerbesar) * 56))}px` }}
                    title={`Minggu ${formatDate(m.senin)}: ${formatRupiah(m.total)}`}
                  />
                  <span className="text-[10px] text-slate-400 whitespace-nowrap">
                    {formatDate(m.senin)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Form input cepat */}
      <div className="card p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <Receipt className="h-4 w-4 text-primary-600" />
          <h3 className="font-semibold text-slate-900">Catat pengeluaran</h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Kategori" required error={errors.kategori}>
            <input
              type="text"
              list="saran-kategori"
              value={form.kategori}
              onChange={(e) => ubahField('kategori', e.target.value)}
              className={cn('input', errors.kategori && 'input-error')}
              placeholder="listrik / pdam / ..."
            />
            <datalist id="saran-kategori">
              {saranKategori.map((k) => (
                <option key={k} value={k} />
              ))}
            </datalist>
          </Field>
          <Field label="Nominal (Rp)" required error={errors.jumlah}>
            <input
              type="number"
              min="0"
              step="1000"
              value={form.jumlah}
              onChange={(e) => ubahField('jumlah', e.target.value)}
              className={cn('input', errors.jumlah && 'input-error')}
              placeholder="50000"
            />
          </Field>
          <Field label="Tanggal" required error={errors.tanggal}>
            <input
              type="date"
              max={hariIni()}
              value={form.tanggal}
              onChange={(e) => ubahField('tanggal', e.target.value)}
              className={cn('input', errors.tanggal && 'input-error')}
            />
          </Field>
          <Field label="Keterangan" className="lg:col-span-1">
            <input
              type="text"
              value={form.keterangan}
              onChange={(e) => ubahField('keterangan', e.target.value)}
              className="input"
              placeholder="Token PLN, tagihan PDAM..."
            />
          </Field>
          <div className="flex items-end">
            <button onClick={kirim} disabled={simpan} className="btn-primary w-full">
              {simpan ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Catat
            </button>
          </div>
        </div>
      </div>

      {/* Riwayat */}
      <div className="card overflow-hidden">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1 sm:max-w-xs">
            <SearchInput value={cari} onChange={setCari} placeholder="Cari keterangan..." />
          </div>
          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 overflow-x-auto">
            {['semua', ...saranKategori].map((k) => (
              <button
                key={k}
                onClick={() => gantiKategori(k)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap capitalize transition-colors',
                  kategoriAktif === k
                    ? 'bg-white text-primary-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-800',
                )}
              >
                {k === 'semua' ? 'Semua' : k}
              </button>
            ))}
          </div>
        </div>

        {isiTabel}

        <Pagination
          halaman={tabel.halaman}
          totalHalaman={tabel.totalHalaman}
          total={tabel.total}
          perHalaman={tabel.perHalaman}
          onGantiHalaman={tabel.setHalaman}
          onGantiPerHalaman={tabel.gantiPerHalaman}
          label="catatan pengeluaran"
        />
      </div>

      {/* Modal koreksi */}
      <Modal
        open={Boolean(edit)}
        onClose={() => setEdit(null)}
        title="Ubah Pengeluaran"
        lebar="max-w-md"
        footer={
          <div className="flex gap-3">
            <button onClick={() => setEdit(null)} className="btn-secondary flex-1" disabled={sibukEdit}>
              Batal
            </button>
            <button onClick={kirimEdit} className="btn-primary flex-1" disabled={sibukEdit}>
              {sibukEdit && <Loader2 className="h-4 w-4 animate-spin" />}
              Simpan Perubahan
            </button>
          </div>
        }
      >
        {edit && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Kategori" required error={errors.kategori}>
                <input
                  type="text"
                  list="saran-kategori"
                  value={edit.kategori}
                  onChange={(e) => setEdit((f) => ({ ...f, kategori: e.target.value }))}
                  className={cn('input', errors.kategori && 'input-error')}
                />
              </Field>
              <Field label="Nominal (Rp)" required error={errors.jumlah}>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={edit.jumlah}
                  onChange={(e) => setEdit((f) => ({ ...f, jumlah: e.target.value }))}
                  className={cn('input', errors.jumlah && 'input-error')}
                />
              </Field>
            </div>
            <Field label="Tanggal" required error={errors.tanggal}>
              <input
                type="date"
                max={hariIni()}
                value={edit.tanggal}
                onChange={(e) => setEdit((f) => ({ ...f, tanggal: e.target.value }))}
                className={cn('input', errors.tanggal && 'input-error')}
              />
            </Field>
            <Field label="Keterangan">
              <input
                type="text"
                value={edit.keterangan}
                onChange={(e) => setEdit((f) => ({ ...f, keterangan: e.target.value }))}
                className="input"
              />
            </Field>
          </div>
        )}
      </Modal>
    </div>
  )
}
