import { useState } from 'react'
import { AlertTriangle, Loader2, Minus, Pencil, Plus } from 'lucide-react'
import { stockApi } from '../../services/api'
import { useCariTunda, useTabel } from '../../hooks/useTabel'
import { cn, formatDate, formatRupiah } from '../../utils/helpers'
import { toast } from '../Toast'
import Pagination from '../Pagination'
import Modal, { Field, GagalMuat, Kosong, Memuat, SearchInput } from '../AdminUi'

const TIPE = [
  { nilai: 'alat', label: 'Alat' },
  { nilai: 'bahan', label: 'Bahan' },
]

const SATUAN = ['pcs', 'liter', 'kg', 'pack']

const URUT = [
  { nilai: 'nama', label: 'Nama A-Z' },
  { nilai: 'jumlah_tersedikit', label: 'Jumlah tersedikit' },
  { nilai: 'jumlah_terbanyak', label: 'Jumlah terbanyak' },
]

const FORM_AWAL = {
  nama_item: '',
  tipe: 'bahan',
  jumlah: '',
  satuan: 'pcs',
  batas_minimum: 5,
  supplier: '',
  harga_beli: '',
  tanggal_masuk: '',
}

function kePayload(form) {
  const angka = (v, fallback = 0) => {
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
  }
  const isi = (v) => (v === '' || v === null ? null : v)

  return {
    nama_item: form.nama_item.trim(),
    tipe: form.tipe,
    jumlah: angka(form.jumlah),
    satuan: form.satuan,
    batas_minimum: angka(form.batas_minimum, 5),
    supplier: isi(form.supplier?.trim()),
    harga_beli: angka(form.harga_beli),
    tanggal_masuk: isi(form.tanggal_masuk) || undefined,
  }
}

function formDariBaris(baris) {
  return {
    id: baris.id,
    nama_item: baris.nama_item ?? '',
    tipe: baris.tipe ?? 'bahan',
    jumlah: baris.jumlah != null ? String(baris.jumlah) : '',
    satuan: baris.satuan ?? 'pcs',
    batas_minimum: baris.batas_minimum != null ? String(baris.batas_minimum) : '5',
    supplier: baris.supplier ?? '',
    harga_beli: baris.harga_beli != null ? String(baris.harga_beli) : '',
    tanggal_masuk: baris.tanggal_masuk ? String(baris.tanggal_masuk).slice(0, 10) : '',
  }
}

export default function AdminStock() {
  const tabel = useTabel({ endpoint: '/api/stock' })
  const { setFilter } = tabel
  const [cari, setCari] = useCariTunda(setFilter)

  // Cerminan lokal dari filter yang sedang aktif, supaya tombol dan checkbox
  // bisa menampilkan keadaan saat ini. Nilai sesungguhnya tetap di useTabel.
  const [tipeAktif, setTipeAktif] = useState('semua')
  const [urutAktif, setUrutAktif] = useState('nama')
  const [hanyaKritis, setHanyaKritis] = useState(false)

  const [form, setForm] = useState(null)
  const [errors, setErrors] = useState({})
  const [simpan, setSimpan] = useState(false)
  const [atur, setAtur] = useState(null)
  const [delta, setDelta] = useState('')
  const [sibukAtur, setSibukAtur] = useState(false)

  const gantiTipe = (nilai) => {
    setTipeAktif(nilai)
    setFilter({ tipe: nilai === 'semua' ? undefined : nilai })
  }

  const gantiUrut = (nilai) => {
    setUrutAktif(nilai)
    setFilter({ urut: nilai })
  }

  const gantiKritis = (nyawa) => {
    setHanyaKritis(nyawa)
    setFilter({ low_stock: nyawa ? true : undefined })
  }

  const bukaTambah = () => {
    setErrors({})
    setForm({ ...FORM_AWAL })
  }

  const bukaEdit = (baris) => {
    setErrors({})
    setForm(formDariBaris(baris))
  }

  const tutupForm = () => {
    setForm(null)
    setErrors({})
  }

  const ubahField = (nama, nilai) => setForm((f) => ({ ...f, [nama]: nilai }))

  const validasi = () => {
    if (!form) return {}
    const e = {}
    if (!form.nama_item.trim()) e.nama_item = 'Nama item wajib diisi'
    if (form.jumlah === '' || !Number.isFinite(Number(form.jumlah))) e.jumlah = 'Jumlah wajib diisi'
    else if (Number(form.jumlah) < 0) e.jumlah = 'Jumlah tidak boleh negatif'
    if (!Number.isFinite(Number(form.batas_minimum))) e.batas_minimum = 'Batas minimum wajib diisi'
    else if (Number(form.batas_minimum) < 0) e.batas_minimum = 'Batas minimum tidak boleh negatif'
    return e
  }

  const kirim = async () => {
    const e = validasi()
    setErrors(e)
    if (Object.keys(e).length > 0) return

    setSimpan(true)
    try {
      if (form.id) {
        await stockApi.update(form.id, kePayload(form))
        toast.success('Stok diperbarui', `${form.nama_item} berhasil disimpan.`)
      } else {
        await stockApi.create(kePayload(form))
        toast.success('Item stok ditambahkan', `${form.nama_item} masuk daftar bahan.`)
      }
      tutupForm()
      tabel.muatUlang()
    } catch (err) {
      toast.error('Gagal menyimpan', err.friendlyMessage || err.message)
    } finally {
      setSimpan(false)
    }
  }

  const bukaAtur = (baris) => {
    setDelta('')
    setAtur(baris)
  }

  const kirimAtur = async () => {
    const n = Number(delta)
    if (!Number.isFinite(n) || n === 0) {
      toast.warning('Masukkan jumlah', 'Isi dulu berapa banyak yang ditambah atau dikurangi.')
      return
    }
    setSibukAtur(true)
    try {
      if (n > 0) {
        // Stok bertambah lewat edit biasa: endpoint /kurangi hanya menerima
        // pengurangan dan akan menolak angka negatif.
        const hasil = await stockApi.update(atur.id, { jumlah: atur.jumlah + n })
        toast.success('Stok ditambahkan', `${atur.nama_item} sekarang ${hasil.data.jumlah} ${atur.satuan}.`)
      } else {
        const hasil = await stockApi.reduce(atur.id, Math.abs(n))
        toast.success('Stok dikurangi', `${atur.nama_item} sekarang ${hasil.data.jumlah} ${atur.satuan}.`)
      }
      setAtur(null)
      tabel.muatUlang()
    } catch (err) {
      toast.error('Gagal menyesuaikan stok', err.friendlyMessage || err.message)
    } finally {
      setSibukAtur(false)
    }
  }

  const adaFilter = Boolean(cari) || tipeAktif !== 'semua' || hanyaKritis
  const prosesUlang = Number.isFinite(Number(delta)) ? Number(delta) : 0

  const isiTabel = tabel.loading ? (
    <Memuat baris={7} />
  ) : tabel.error ? (
    <GagalMuat pesan={tabel.error} onCobaLagi={tabel.muatUlang} />
  ) : tabel.rows.length === 0 ? (
    <Kosong
      judul={adaFilter ? 'Tidak ada hasil' : 'Belum ada item stok'}
      pesan={
        adaFilter
          ? 'Coba ubah kata kunci, tipe, atau matikan filter stok kritis.'
          : 'Catat alat dan bahan yang dipakai untuk washesatu-treatment agar mudah dipantau.'
      }
      action={
        !adaFilter && (
          <button onClick={bukaTambah} className="btn-primary mt-1">
            <Plus className="h-4 w-4" />
            Tambah item stok
          </button>
        )
      }
    />
  ) : (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/60 text-left">
            <th className="px-4 py-3 font-semibold text-slate-600">Item</th>
            <th className="px-4 py-3 font-semibold text-slate-600">Tipe</th>
            <th className="px-4 py-3 font-semibold text-slate-600 text-right">Jumlah</th>
            <th className="px-4 py-3 font-semibold text-slate-600 text-right">Batas Min.</th>
            <th className="px-4 py-3 font-semibold text-slate-600">Status</th>
            <th className="px-4 py-3 font-semibold text-slate-600">Supplier</th>
            <th className="px-4 py-3 font-semibold text-slate-600 text-right">Aksi</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {tabel.rows.map((baris) => {
            const kritis = baris.jumlah <= baris.batas_minimum
            const habis = baris.jumlah === 0
            return (
              <tr key={baris.id} className={cn('hover:bg-slate-50/60', kritis && 'bg-amber-50/40')}>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{baris.nama_item}</p>
                  {baris.harga_beli > 0 && (
                    <p className="text-xs text-slate-500">
                      {formatRupiah(baris.harga_beli)} / {baris.satuan}
                      {baris.tanggal_masuk && ` \u00b7 masuk ${formatDate(baris.tanggal_masuk)}`}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="badge-primary">{baris.tipe}</span>
                </td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900">
                  {baris.jumlah}{' '}
                  <span className="text-xs font-normal text-slate-500">{baris.satuan}</span>
                </td>
                <td className="px-4 py-3 text-right text-slate-600">{baris.batas_minimum}</td>
                <td className="px-4 py-3">
                  {habis ? (
                    <span className="badge-overdue">Habis</span>
                  ) : kritis ? (
                    <span className="badge-processing">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Kritis
                    </span>
                  ) : (
                    <span className="badge-completed">Aman</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600 max-w-[10rem] truncate">
                  {baris.supplier || '—'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => bukaAtur(baris)}
                      className="p-2 rounded-lg text-slate-400 hover:bg-primary-50 hover:text-primary-600"
                      title="Tambah / kurangi stok"
                      aria-label={`Sesuaikan stok ${baris.nama_item}`}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => bukaEdit(baris)}
                      className="p-2 rounded-lg text-slate-400 hover:bg-primary-50 hover:text-primary-600"
                      title="Ubah"
                      aria-label={`Ubah ${baris.nama_item}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Stok &amp; Bahan</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Alat dan bahan cuci. Item yang menyentuh batas minimum ditandai supaya bisa dipesan sebelum habis.
          </p>
        </div>
        <button onClick={bukaTambah} className="btn-primary shrink-0">
          <Plus className="h-4 w-4" />
          Tambah Item
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex-1 lg:max-w-xs">
            <SearchInput
              value={cari}
              onChange={setCari}
              placeholder="Cari nama item..."
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
              {[{ nilai: 'semua', label: 'Semua' }, ...TIPE].map((t) => (
                <button
                  key={t.nilai}
                  onClick={() => gantiTipe(t.nilai)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                    tipeAktif === t.nilai
                      ? 'bg-white text-primary-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-800',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <select
              value={urutAktif}
              onChange={(e) => gantiUrut(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-primary-500 focus:outline-none"
              aria-label="Urutkan"
            >
              {URUT.map((u) => (
                <option key={u.nilai} value={u.nilai}>
                  {u.label}
                </option>
              ))}
            </select>

            <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={hanyaKritis}
                onChange={(e) => gantiKritis(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Stok kritis saja
            </label>
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
          label="item stok"
        />
      </div>

      <Modal
        open={Boolean(form)}
        onClose={tutupForm}
        title={form?.id ? 'Ubah Item Stok' : 'Tambah Item Stok'}
        description="Batas minimum dipakai untuk menandai item yang perlu dipesan."
        footer={
          <div className="flex gap-3">
            <button onClick={tutupForm} className="btn-secondary flex-1" disabled={simpan}>
              Batal
            </button>
            <button onClick={kirim} className="btn-primary flex-1" disabled={simpan}>
              {simpan && <Loader2 className="h-4 w-4 animate-spin" />}
              {form?.id ? 'Simpan Perubahan' : 'Tambah'}
            </button>
          </div>
        }
      >
        {form && (
          <div className="space-y-4">
            <Field label="Nama Item" required error={errors.nama_item}>
              <input
                type="text"
                value={form.nama_item}
                onChange={(e) => ubahField('nama_item', e.target.value)}
                className={cn('input', errors.nama_item && 'input-error')}
                placeholder="Disinfectant, Spon, Kabel Pengering..."
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tipe">
                <select
                  value={form.tipe}
                  onChange={(e) => ubahField('tipe', e.target.value)}
                  className="input"
                >
                  {TIPE.map((t) => (
                    <option key={t.nilai} value={t.nilai}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Satuan">
                <select
                  value={form.satuan}
                  onChange={(e) => ubahField('satuan', e.target.value)}
                  className="input"
                >
                  {SATUAN.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Jumlah" required error={errors.jumlah}>
                <input
                  type="number"
                  min="0"
                  value={form.jumlah}
                  onChange={(e) => ubahField('jumlah', e.target.value)}
                  className={cn('input', errors.jumlah && 'input-error')}
                  placeholder="10"
                />
              </Field>
              <Field
                label="Batas Minimum"
                error={errors.batas_minimum}
                hint="Item ditandai kritis saat jumlah menyentuh nilai ini."
              >
                <input
                  type="number"
                  min="0"
                  value={form.batas_minimum}
                  onChange={(e) => ubahField('batas_minimum', e.target.value)}
                  className={cn('input', errors.batas_minimum && 'input-error')}
                  placeholder="5"
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Supplier">
                <input
                  type="text"
                  value={form.supplier}
                  onChange={(e) => ubahField('supplier', e.target.value)}
                  className="input"
                  placeholder="Nama toko / vendor"
                />
              </Field>
              <Field label="Harga Beli" hint="Per satuan. Dipakai untuk estimasi biaya bahan.">
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={form.harga_beli}
                  onChange={(e) => ubahField('harga_beli', e.target.value)}
                  className="input"
                  placeholder="15000"
                />
              </Field>
            </div>

            <Field label="Tanggal Masuk">
              <input
                type="date"
                value={form.tanggal_masuk}
                onChange={(e) => ubahField('tanggal_masuk', e.target.value)}
                className="input"
              />
            </Field>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(atur)}
        onClose={() => setAtur(null)}
        title="Sesuaikan Jumlah Stok"
        lebar="max-w-md"
        footer={
          <div className="flex gap-3">
            <button onClick={() => setAtur(null)} className="btn-secondary flex-1" disabled={sibukAtur}>
              Batal
            </button>
            <button onClick={kirimAtur} className="btn-primary flex-1" disabled={sibukAtur}>
              {sibukAtur && <Loader2 className="h-4 w-4 animate-spin" />}
              Simpan
            </button>
          </div>
        }
      >
        {atur && (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
              <div>
                <p className="font-medium text-slate-900">{atur.nama_item}</p>
                <p className="text-xs text-slate-500">
                  Stok sekarang {atur.jumlah} {atur.satuan}
                </p>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => setDelta((d) => (Number(d) > 0 ? String(Number(d) - 1) : d))}
                  className="btn-secondary h-8 w-8 px-0"
                  title="Kurangi satu"
                  aria-label="Kurangi satu"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <button
                  onClick={() =>
                    setDelta((d) => (Number.isFinite(Number(d)) ? String(Number(d) + 1) : '1'))
                  }
                  className="btn-secondary h-8 w-8 px-0"
                  title="Tambah satu"
                  aria-label="Tambah satu"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            <Field
              label="Jumlah"
              hint="Isi angka positif untuk menambah, negatif untuk mengurangi. Contoh: -3"
            >
              <input
                type="number"
                value={delta}
                onChange={(e) => setDelta(e.target.value)}
                className="input"
                placeholder="+10 atau -2"
              />
            </Field>

            {prosesUlang !== 0 && (
              <p className="text-sm text-slate-600">
                Jadi{' '}
                <span className="font-semibold text-slate-900">
                  {Math.max(0, atur.jumlah + prosesUlang)} {atur.satuan}
                </span>{' '}
                setelah disimpan.
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}