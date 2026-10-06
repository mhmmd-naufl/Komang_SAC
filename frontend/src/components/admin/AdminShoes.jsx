import { useState } from 'react'
import { Loader2, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { shoesApi } from '../../services/api'
import { useCariTunda, useTabel } from '../../hooks/useTabel'
import { cn, formatRupiah } from '../../utils/helpers'
import { toast } from '../Toast'
import Pagination from '../Pagination'
import Modal, { BadgeAktif, Field, GagalMuat, Kosong, KonfirmasiDialog, Memuat } from '../AdminUi'

const JENIS_TREATMENT = ['Standar', 'Premium', 'Steri', 'Waterproof']

const FORM_AWAL = {
  merk: '',
  model: '',
  harga_cuci: '',
  jenis_treatment: 'Standar',
  keterangan_treatment: '',
  status: true,
}

/**
 * Ubah nilai form yang controlled dari string menjadi tipe yang benar
 * untuk backend: harga jadi integer, status jadi boolean. String kosong
 * jadi null supaya field yang dikosongkan tidak menimpa nilai lama saat edit.
 */
function kePayload(form, { hanyaStatus = false } = {}) {
  if (hanyaStatus) return { status: form.status }

  const harga = Number(form.harga_cuci)
  const isi = (v) => (v === '' || v === null ? undefined : v)

  return {
    merk: form.merk.trim(),
    model: isi(form.model?.trim()) ?? null,
    harga_cuci: Number.isFinite(harga) ? harga : 0,
    jenis_treatment: form.jenis_treatment || null,
    keterangan_treatment: isi(form.keterangan_treatment?.trim()) ?? null,
    status: form.status,
  }
}

function formDariBaris(baris) {
  return {
    merk: baris.merk ?? '',
    model: baris.model ?? '',
    harga_cuci: baris.harga_cuci != null ? String(baris.harga_cuci) : '',
    jenis_treatment: baris.jenis_treatment ?? 'Standar',
    keterangan_treatment: baris.keterangan_treatment ?? '',
    status: Boolean(baris.status),
  }
}

export default function AdminShoes() {
  // Default panel admin adalah tab "Semua", jadi harus membaca master nonaktif
  // juga -- kalau tidak, layanan yang dinonaktifkan tidak akan pernah terlihat
  // untuk dihidupkan kembali. Endpoint tanpa parameter justru hanya mengembalikan
  // yang aktif.
  const tabel = useTabel({ endpoint: '/api/sepatu', filterAwal: { aktif_only: false } })
  const { setFilter } = tabel
  const [cari, setCari] = useCariTunda(setFilter)

  const [tabStatus, setTabStatus] = useState('semua')
  const [form, setForm] = useState(null)
  const [errors, setErrors] = useState({})
  const [simpan, setSimpan] = useState(false)
  const [hapus, setHapus] = useState(null)

  const gantiTabStatus = (nilai) => {
    setTabStatus(nilai)
    if (nilai === 'semua') {
      // Tanpa filter sama sekali: aktif_only=false berarti "jangan pakai
      // default True", cari_status tidak dikirim berarti "tidak cares status".
      setFilter({ aktif_only: false, cari_status: undefined })
    } else {
      setFilter({
        aktif_only: nilai === 'aktif',
        cari_status: nilai === 'nonaktif' ? false : undefined,
      })
    }
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
    if (!form.merk.trim()) e.merk = 'Merk wajib diisi'
    const harga = Number(form.harga_cuci)
    if (form.harga_cuci === '' || !Number.isFinite(harga)) e.harga_cuci = 'Harga wajib diisi'
    else if (harga < 0) e.harga_cuci = 'Harga tidak boleh negatif'
    return e
  }

  const kirim = async () => {
    const e = validasi()
    setErrors(e)
    if (Object.keys(e).length > 0) return

    setSimpan(true)
    try {
      if (form.id) {
        await shoesApi.update(form.id, kePayload(form))
        toast.success('Master sepatu diperbarui', `${form.merk} berhasil disimpan.`)
      } else {
        await shoesApi.create(kePayload(form))
        toast.success('Master sepatu ditambahkan', `${form.merk} masuk ke katalog.`)
      }
      tutupForm()
      tabel.muatUlang()
    } catch (err) {
      toast.error('Gagal menyimpan', err.friendlyMessage || err.message)
    } finally {
      setSimpan(false)
    }
  }

  const toggleStatus = async (baris) => {
    try {
      await shoesApi.update(baris.id, { status: !baris.status })
      toast.success(
        baris.status ? 'Layanan dinonaktifkan' : 'Layanan diaktifkan',
        `${baris.merk} ${baris.status ? ' disembunyikan dari katalog' : 'kembali tampil di katalog'}.`,
      )
      tabel.muatUlang()
    } catch (err) {
      toast.error('Gagal mengubah status', err.friendlyMessage || err.message)
    }
  }

  const konfirmasiHapus = async () => {
    try {
      await shoesApi.remove(hapus.id)
      toast.success('Master sepatu dihapus', `${hapus.merk} dihapus dari katalog.`)
      setHapus(null)
      tabel.muatUlang()
    } catch (err) {
      toast.error('Gagal menghapus', err.friendlyMessage || err.message)
    }
  }

  const adaFilter = Boolean(cari) || tabStatus !== 'semua'
  const isiTabel = tabel.loading ? (
    <Memuat baris={7} />
  ) : tabel.error ? (
    <GagalMuat pesan={tabel.error} onCobaLagi={tabel.muatUlang} />
  ) : tabel.rows.length === 0 ? (
    <Kosong
      judul={adaFilter ? 'Tidak ada hasil' : 'Belum ada master sepatu'}
      pesan={
        adaFilter
          ? 'Coba ubah kata kunci atau filter status.'
          : 'Tambahkan merk dan model beserta harga cucian supaya muncul di katalog.'
      }
      action={
        !adaFilter && (
          <button onClick={bukaTambah} className="btn-primary mt-1">
            <Plus className="h-4 w-4" />
            Tambah master sepatu
          </button>
        )
      }
    />
  ) : (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/60 text-left">
            <th className="px-4 py-3 font-semibold text-slate-600">Merk & Model</th>
            <th className="px-4 py-3 font-semibold text-slate-600">Treatment</th>
            <th className="px-4 py-3 font-semibold text-slate-600">Keterangan</th>
            <th className="px-4 py-3 font-semibold text-slate-600 text-right">Harga Cuci</th>
            <th className="px-4 py-3 font-semibold text-slate-600 text-center">Status</th>
            <th className="px-4 py-3 font-semibold text-slate-600 text-right">Aksi</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {tabel.rows.map((baris) => (
            <tr key={baris.id} className="hover:bg-slate-50/60">
              <td className="px-4 py-3">
                <p className="font-medium text-slate-900">{baris.merk}</p>
                {baris.model && <p className="text-xs text-slate-500">{baris.model}</p>}
              </td>
              <td className="px-4 py-3">
                <span className="badge-primary">{baris.jenis_treatment || '—'}</span>
              </td>
              <td className="px-4 py-3 text-slate-600 max-w-xs">
                <p className="truncate" title={baris.keterangan_treatment || ''}>
                  {baris.keterangan_treatment || '—'}
                </p>
              </td>
              <td className="px-4 py-3 text-right font-semibold text-slate-900">
                {formatRupiah(baris.harga_cuci)}
              </td>
              <td className="px-4 py-3 text-center">
                <button onClick={() => toggleStatus(baris)} title="Klik untuk ganti status">
                  <BadgeAktif aktif={baris.status} />
                </button>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={() => bukaEdit(baris)}
                    className="p-2 rounded-lg text-slate-400 hover:bg-primary-50 hover:text-primary-600"
                    title="Ubah"
                    aria-label={`Ubah ${baris.merk}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setHapus(baris)}
                    className="p-2 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    title="Hapus"
                    aria-label={`Hapus ${baris.merk}`}
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Kelola Sepatu</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Master merk, model, harga, dan jenis treatment. Ini yang muncul di katalog publik.
          </p>
        </div>
        <button onClick={bukaTambah} className="btn-primary shrink-0">
          <Plus className="h-4 w-4" />
          Tambah Sepatu
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              type="search"
              value={cari}
              onChange={(e) => setCari(e.target.value)}
              placeholder="Cari merk atau model..."
              className="input pl-9"
              aria-label="Cari merk atau model"
            />
          </div>

          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
            {[
              { nilai: 'semua', label: 'Semua' },
              { nilai: 'aktif', label: 'Aktif' },
              { nilai: 'nonaktif', label: 'Nonaktif' },
            ].map((t) => (
              <button
                key={t.nilai}
                onClick={() => gantiTabStatus(t.nilai)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                  tabStatus === t.nilai ? 'bg-white text-primary-700 shadow-sm' : 'text-slate-600 hover:text-slate-800',
                )}
              >
                {t.label}
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
          label="master sepatu"
        />
      </div>

      <Modal
        open={Boolean(form)}
        onClose={tutupForm}
        title={form?.id ? 'Ubah Master Sepatu' : 'Tambah Master Sepatu'}
        description="Harga per pasang. Master ini muncul di katalog publik selama statusnya aktif."
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
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Merk" required error={errors.merk}>
                <input
                  type="text"
                  value={form.merk}
                  onChange={(e) => ubahField('merk', e.target.value)}
                  className={cn('input', errors.merk && 'input-error')}
                  placeholder="Nike, Adidas, Converse..."
                />
              </Field>
              <Field label="Model" hint="Kosongkan kalau tidak ada">
                <input
                  type="text"
                  value={form.model}
                  onChange={(e) => ubahField('model', e.target.value)}
                  className="input"
                  placeholder="Air Force 1"
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Harga Cuci" required error={errors.harga_cuci}>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={form.harga_cuci}
                  onChange={(e) => ubahField('harga_cuci', e.target.value)}
                  className={cn('input', errors.harga_cuci && 'input-error')}
                  placeholder="25000"
                />
              </Field>
              <Field label="Jenis Treatment">
                <select
                  value={form.jenis_treatment}
                  onChange={(e) => ubahField('jenis_treatment', e.target.value)}
                  className="input"
                >
                  {JENIS_TREATMENT.map((j) => (
                    <option key={j} value={j}>
                      {j}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Keterangan Treatment" hint="Ditampilkan di kartu katalog, misal: 'deep cleaning + anti bacterial'">
              <textarea
                rows={3}
                value={form.keterangan_treatment}
                onChange={(e) => ubahField('keterangan_treatment', e.target.value)}
                className="input resize-none"
                placeholder="Contoh: Bersih noda keras, whitening soles, dan bau."
              />
            </Field>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.status}
                onChange={(e) => ubahField('status', e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              <span>
                <span className="text-sm font-medium text-slate-800">Aktif</span>
                <span className="block text-xs text-slate-500">
                  Nonaktif berarti tersembunyi dari katalog publik, tapi riwayat transaksi lama tetap utuh.
                </span>
              </span>
            </label>
          </div>
        )}
      </Modal>

      <KonfirmasiDialog
        open={Boolean(hapus)}
        onClose={() => setHapus(null)}
        onKonfirmasi={konfirmasiHapus}
        judul="Hapus master sepatu?"
        pesan={
          hapus
            ? `"${hapus.merk}${hapus.model ? ` ${hapus.model}` : ''}" akan hilang dari katalog. Transaksi lama yang sudah memakai master ini tetap tersimpan, tapi nama sepatu di detail transaksi bisa ikut berubah.`
            : ''
        }
      />
    </div>
  )
}