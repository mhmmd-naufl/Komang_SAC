import { useState } from 'react'
import { KeyRound, Loader2, Pencil, Plus, ShieldCheck, UserCheck } from 'lucide-react'
import { usersApi } from '../../services/api'
import { useCariTunda, useTabel } from '../../hooks/useTabel'
import { cn, formatDate, getRoleColor, getRoleLabel } from '../../utils/helpers'
import { toast } from '../Toast'
import Pagination from '../Pagination'
import Modal, { Field, GagalMuat, Kosong, Memuat, SearchInput } from '../AdminUi'

const PERAN = [
  { nilai: 'admin', label: 'Admin' },
  { nilai: 'technician', label: 'Teknisi' },
  { nilai: 'drop_point', label: 'Drop Point' },
  { nilai: 'customer', label: 'Pelanggan' },
]

const URUT = [
  { nilai: 'terbaru', label: 'Terbaru' },
  { nilai: 'nama', label: 'Nama A-Z' },
  { nilai: 'nama_z', label: 'Nama Z-A' },
]

const FORM_AWAL = {
  full_name: '',
  phone: '',
  role: 'technician',
  buatAkun: true,
}

/**
 * Nomor WhatsApp dinormalisasi ke format 62xxx sebelum dikirim, sama seperti
 * yang dilakukan backend. Ini supaya pesan error yang muncul lebih jelas.
 */
function normalisasiTelepon(nilai) {
  let n = String(nilai || '').replace(/\D/g, '')
  if (n.startsWith('0')) n = `62${n.slice(1)}`
  else if (n.startsWith('8')) n = `62${n}`
  return n
}

export default function AdminUsers() {
  const tabel = useTabel({ endpoint: '/api/users' })
  const { setFilter } = tabel
  const [cari, setCari] = useCariTunda(setFilter)

  const [peranAktif, setPeranAktif] = useState('')
  const [urutAktif, setUrutAktif] = useState('terbaru')
  const [form, setForm] = useState(null)
  const [errors, setErrors] = useState({})
  const [simpan, setSimpan] = useState(false)
  const [kunci, setKunci] = useState(null)

  const gantiPeran = (nilai) => {
    setPeranAktif(nilai)
    setFilter({ role: nilai || undefined })
  }

  const gantiUrut = (nilai) => {
    setUrutAktif(nilai)
    setFilter({ urut: nilai })
  }

  const bukaTambah = () => {
    setErrors({})
    setForm({ ...FORM_AWAL })
  }

  const bukaEdit = (baris) => {
    setErrors({})
    setForm({ ...formDariBaris(baris), buatAkun: false })
  }

  const tutupForm = () => {
    setForm(null)
    setErrors({})
  }

  const ubahField = (nama, nilai) => setForm((f) => ({ ...f, [nama]: nilai }))

  const validasi = () => {
    if (!form) return {}
    const e = {}
    if (!form.full_name.trim()) e.full_name = 'Nama wajib diisi'
    const tel = normalisasiTelepon(form.phone)
    if (!tel) e.phone = 'Nomor WhatsApp wajib diisi'
    else if (!/^62\d{8,13}$/.test(tel)) e.phone = 'Format harus 62xxx, misalnya 628991000001'
    return e
  }

  const kirim = async () => {
    const e = validasi()
    setErrors(e)
    if (Object.keys(e).length > 0) return

    setSimpan(true)
    try {
      if (form.id) {
        await usersApi.update(form.id, {
          full_name: form.full_name.trim(),
          phone: normalisasiTelepon(form.phone),
          role: form.role,
        })
        toast.success('Data pengguna diperbarui', `${form.full_name.trim()} berhasil disimpan.`)
      } else if (form.buatAkun) {
        await usersApi.createWithPassword({
          full_name: form.full_name.trim(),
          phone: normalisasiTelepon(form.phone),
          role: form.role,
        })
        toast.success(
          'Akun dibuat',
          `Password sementara = nomor WhatsApp (${normalisasiTelepon(form.phone)}). Minta pengguna segera menggantinya lewat menu Akun.`,
          { duration: 9000 },
        )
      } else {
        await usersApi.create({
          full_name: form.full_name.trim(),
          phone: normalisasiTelepon(form.phone),
          role: form.role,
        })
        toast.success(
          'Profil dibuat tanpa akun',
          'Pengguna ini belum bisa login. Ia harus Daftar sendiri memakai nomor yang sama.',
        )
      }
      tutupForm()
      tabel.muatUlang()
    } catch (err) {
      toast.error('Gagal menyimpan', err.friendlyMessage || err.message)
    } finally {
      setSimpan(false)
    }
  }

  const kirimPeran = async () => {
    setSimpan(true)
    try {
      await usersApi.update(kunci.id, { role: kunci.roleBaru })
      toast.success(
        'Peran diperbarui',
        `${kunci.full_name} sekarang berperan sebagai ${getRoleLabel(kunci.roleBaru)}.`,
      )
      setKunci(null)
      tabel.muatUlang()
    } catch (err) {
      toast.error('Gagal mengubah peran', err.friendlyMessage || err.message)
    } finally {
      setSimpan(false)
    }
  }

  const adaFilter = Boolean(cari) || Boolean(peranAktif)
  const formDariBaris = (baris) => ({
    id: baris.id,
    full_name: baris.full_name ?? '',
    phone: baris.phone ?? '',
    role: baris.role ?? 'customer',
  })

  const isiTabel = tabel.loading ? (
    <Memuat baris={8} />
  ) : tabel.error ? (
    <GagalMuat pesan={tabel.error} onCobaLagi={tabel.muatUlang} />
  ) : tabel.rows.length === 0 ? (
    <Kosong
      judul={adaFilter ? 'Tidak ada pengguna' : 'Belum ada pengguna'}
      pesan={adaFilter ? 'Tidak ada yang cocok dengan filter ini.' : ''}
    />
  ) : (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/60 text-left">
            <th className="px-4 py-3 font-semibold text-slate-600">Nama</th>
            <th className="px-4 py-3 font-semibold text-slate-600">WhatsApp</th>
            <th className="px-4 py-3 font-semibold text-slate-600">Peran</th>
            <th className="px-4 py-3 font-semibold text-slate-600">Status</th>
            <th className="px-4 py-3 font-semibold text-slate-600">Bergabung</th>
            <th className="px-4 py-3 font-semibold text-slate-600 text-right">Aksi</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {tabel.rows.map((baris) => (
            <tr key={baris.id} className="hover:bg-slate-50/60">
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 shrink-0 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 text-xs font-semibold">
                    {baris.full_name?.charAt(0).toUpperCase() || '?'}
                  </div>
                  <p className="font-medium text-slate-900">{baris.full_name}</p>
                </div>
              </td>
              <td className="px-4 py-3 text-slate-600 font-mono text-xs">{baris.phone}</td>
              <td className="px-4 py-3">
                <span className={cn('badge', getRoleColor(baris.role))}>{getRoleLabel(baris.role)}</span>
              </td>
              <td className="px-4 py-3">
                {baris.is_verified ? (
                  <span className="badge-completed">
                    <UserCheck className="h-3 w-3 mr-1" />
                    Terverifikasi
                  </span>
                ) : (
                  <span className="badge-processing">Menunggu</span>
                )}
              </td>
              <td className="px-4 py-3 text-slate-600">{formatDate(baris.created_at)}</td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={() => setKunci({ ...baris, roleBaru: baris.role })}
                    className="p-2 rounded-lg text-slate-400 hover:bg-primary-50 hover:text-primary-600"
                    title="Ganti peran"
                    aria-label={`Ganti peran ${baris.full_name}`}
                  >
                    <ShieldCheck className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => bukaEdit(baris)}
                    className="p-2 rounded-lg text-slate-400 hover:bg-primary-50 hover:text-primary-600"
                    title="Ubah data"
                    aria-label={`Ubah data ${baris.full_name}`}
                  >
                    <Pencil className="h-4 w-4" />
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
          <h2 className="text-xl font-bold text-slate-900">Pengguna</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Admin, teknisi, drop point, dan pelanggan. Mengganti peran di sini langsung berlaku saat
            pengguna membuka ulang halamannya.
          </p>
        </div>
        <button onClick={bukaTambah} className="btn-primary shrink-0">
          <Plus className="h-4 w-4" />
          Tambah Pengguna
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex-1 lg:max-w-xs">
            <SearchInput
              value={cari}
              onChange={setCari}
              placeholder="Cari nama atau nomor..."
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
              {[{ nilai: '', label: 'Semua' }, ...PERAN].map((p) => (
                <button
                  key={p.nilai || 'semua'}
                  onClick={() => gantiPeran(p.nilai)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                    peranAktif === p.nilai
                      ? 'bg-white text-primary-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-800',
                  )}
                >
                  {p.nilai ? getRoleLabel(p.nilai) : p.label}
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
          label="pengguna"
        />
      </div>

      <Modal
        open={Boolean(form)}
        onClose={tutupForm}
        title={form?.id ? 'Ubah Data Pengguna' : 'Tambah Pengguna'}
        description={
          form?.id
            ? 'Peran juga bisa diubah lewat tombol perisai di tabel.'
            : 'Pilih buat akun agar langsung bisa login, atau cukup profil supaya ia Daftar sendiri nanti.'
        }
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
            <Field label="Nama Lengkap" required error={errors.full_name}>
              <input
                type="text"
                value={form.full_name}
                onChange={(e) => ubahField('full_name', e.target.value)}
                className={cn('input', errors.full_name && 'input-error')}
                placeholder="Agus Setiawan"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Nomor WhatsApp"
                required
                error={errors.phone}
                hint="Boleh ditulis 08xx, nanti otomatis jadi 62xx."
              >
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => ubahField('phone', e.target.value)}
                  className={cn('input', errors.phone && 'input-error')}
                  placeholder="628991000001"
                />
              </Field>

              <Field label="Peran">
                <select
                  value={form.role}
                  onChange={(e) => ubahField('role', e.target.value)}
                  className="input"
                >
                  {PERAN.map((p) => (
                    <option key={p.nilai} value={p.nilai}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {!form.id && (
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.buatAkun}
                  onChange={(e) => ubahField('buatAkun', e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                />
                <span>
                  <span className="text-sm font-medium text-slate-800">Buat akun login sekarang</span>
                  <span className="block text-xs text-slate-500">
                    Password sementara = nomor WhatsApp. Pengguna wajib menggantinya lewat menu Akun
                    setelah login pertama.
                  </span>
                </span>
              </label>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(kunci)}
        onClose={() => setKunci(null)}
        title="Ganti Peran"
        lebar="max-w-md"
        footer={
          <div className="flex gap-3">
            <button onClick={() => setKunci(null)} className="btn-secondary flex-1" disabled={simpan}>
              Batal
            </button>
            <button onClick={kirimPeran} className="btn-primary flex-1" disabled={simpan}>
              {simpan && <Loader2 className="h-4 w-4 animate-spin" />}
              Simpan Peran
            </button>
          </div>
        }
      >
        {kunci && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
              <div className="h-10 w-10 shrink-0 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-semibold">
                {kunci.full_name?.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="font-medium text-slate-900 truncate">{kunci.full_name}</p>
                <p className="text-xs text-slate-500 font-mono">{kunci.phone}</p>
              </div>
            </div>

            <Field label="Peran baru">
              <select
                value={kunci.roleBaru}
                onChange={(e) => setKunci((k) => ({ ...k, roleBaru: e.target.value }))}
                className="input"
              >
                {PERAN.map((p) => (
                  <option key={p.nilai} value={p.nilai}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>

            {kunci.role !== kunci.roleBaru && (
              <div className="flex gap-3 rounded-xl bg-amber-50 p-3">
                <KeyRound className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
                <p className="text-xs text-amber-800">
                  {kunci.roleBaru === 'admin'
                    ? 'Menjadikan admin memberi akses ke semua data termasuk harga dan keuangan. Pastikan orangnya memang dipercaya.'
                    : 'Hak akses berubah begitu pengguna membuka ulang halamannya.'}
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}