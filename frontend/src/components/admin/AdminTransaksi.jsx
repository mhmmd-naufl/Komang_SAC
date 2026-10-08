import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Download,
  Eye,
  ImageOff,
  Loader2,
  MessageCircle,
  MessageSquare,
  Wallet,
} from 'lucide-react'
import { useCariTunda, useTabel } from '../../hooks/useTabel'
import { ambilSemua, unduhCsv } from '../../utils/csv'
import { cn, adaRentang, formatDateTime, formatRupiah, getStatusConfig } from '../../utils/helpers'
import { transactionsApi, usersApi } from '../../services/api'
import { toast } from '../Toast'
import Pagination from '../Pagination'
import Modal, { Field, GagalMuat, Kosong, Memuat, SearchInput } from '../AdminUi'

const STATUS = ['Diterima', 'Diproses', 'Diperiksa', 'Selesai', 'Siap diambil']

const URUT = [
  { nilai: 'terbaru', label: 'Terbaru' },
  { nilai: 'terlama', label: 'Terlama' },
  { nilai: 'nilai_tinggi', label: 'Nilai tertinggi' },
  { nilai: 'nilai_rendah', label: 'Nilai terendah' },
]

const KOLOM_CSV = [
  { judul: 'Kode', kunci: 'kode' },
  { judul: 'Tanggal Masuk', kunci: 'created_at', nilai: (t) => formatDateTime(t.created_at) },
  // Tanggal selesai dicatat teknisi saat status jadi Selesai. Kolom ini yang
  // dipakai buat hitung omzet per bulan/tahun, jadi harus ikut diekspor --
  // tanpa itu, laporan yang dihitung ulang dari CSV tidak akan cocok dengan
  // yang tampil di dashboard.
  { judul: 'Tanggal Selesai', kunci: 'selesai_at', nilai: (t) => (t.selesai_at ? formatDateTime(t.selesai_at) : '') },
  { judul: 'Pelanggan', nilai: (t) => t.customer?.full_name || '' },
  { judul: 'No. WhatsApp Pelanggan', nilai: (t) => t.customer?.phone || '' },
  { judul: 'Layanan', nilai: (t) => t.shoe?.merk || '' },
  { judul: 'Varian', nilai: (t) => t.shoe?.model || '' },
  { judul: 'Kelompok', nilai: (t) => t.shoe?.kelompok || '' },
  { judul: 'Treatment', nilai: (t) => t.shoe?.jenis_treatment || '' },
  { judul: 'Teknisi', nilai: (t) => t.tech?.full_name || '' },
  { judul: 'Status', kunci: 'status' },
  { judul: 'Harga', kunci: 'harga', nilai: (t) => t.harga ?? '' },
  { judul: 'Komisi Teknisi', kunci: 'tech_commission', nilai: (t) => t.tech_commission ?? '' },
  { judul: 'Catatan Konsumen', kunci: 'catatan_konsumen', nilai: (t) => t.catatan_konsumen || '' },
  { judul: 'Catatan Teknisi', kunci: 'defect_notes', nilai: (t) => t.defect_notes || '' },
  { judul: 'Diperbarui', kunci: 'updated_at', nilai: (t) => (t.updated_at ? formatDateTime(t.updated_at) : '') },
]

/** Bangun tautan wa.me. Nomor harus tanpa tanda +, spasi, atau tanda hubung. */
export function tautanWa(nomor, pesan) {
  const bersih = String(nomor || '').replace(/\D/g, '')
  if (!bersih) return null
  return `https://wa.me/${bersih}${pesan ? `?text=${encodeURIComponent(pesan)}` : ''}`
}

/**
 * Satu pesan WhatsApp yang berisi pemberitahuan status SEKALIGUS invoice.
 *
 * Sengaja digabung: pelanggan yang diberi tahu "sudah siap diambil" hampir
 * selalu perlu langsung tahu berapa yang harus dibayar, dan kalau dikirim dua
 * pesan terpisah yang kedua sering tidak terbaca. Format teks polos (bukan PDF)
 * supaya bisa langsung ditempel dan dibaca di HP apa pun tanpa layanan tambahan.
 */
export function pesanWa(t) {
  const nama = t.customer?.full_name?.trim() || ''
  const layanan = [t.shoe?.merk, t.shoe?.model].filter(Boolean).join(' ') || 'Cuci sepatu'
  const metode = String(t.payment_method || '').replace(/_/g, ' ').trim()

  return [
    `Halo${nama ? ` ${nama}` : ''},`,
    '',
    `Pesanan *${t.kode || '-'}* berstatus *${t.status}*.`,
    '',
    '*Invoice*',
    `Layanan: ${layanan}`,
    `Harga: ${formatRupiah(t.harga)}`,
    ...(metode ? [`Pembayaran: ${metode.toUpperCase()}`] : []),
    ...(t.status === 'Siap diambil' ? ['', 'Silakan ambil di outlet pada jam buka.'] : []),
    '',
    'Terima kasih sudah mempercayakan sepatunya ke Komang SAC 🙏',
  ].join('\n')
}

export default function AdminTransaksi() {
  const tabel = useTabel({ endpoint: '/api/transaksi' })
  const { setFilter } = tabel
  const [cari, setCari] = useCariTunda(setFilter)

  const [statusAktif, setStatusAktif] = useState('')
  const [teknisiAktif, setTeknisiAktif] = useState('')
  const [urutAktif, setUrutAktif] = useState('terbaru')
  const [dari, setDari] = useState('')
  const [sampai, setSampai] = useState('')
  const [detail, setDetail] = useState(null)
  const [ekspor, setEkspor] = useState(false)
  // Daftar teknisi hanya untuk isi dropdown filter. Gagal memuat di sini bukan
  // masalah fatal: filter teknisi hilang, tapi tabel tetap bisa dipakai.
  const [teknisi, setTeknisi] = useState([])

  useEffect(() => {
    let batal = false
    usersApi
      .list({ role: 'technician', urut: 'nama' })
      .then((res) => {
        if (!batal) setTeknisi(Array.isArray(res.data) ? res.data : [])
      })
      .catch(() => {
        /* filter teknisi bersifat pelengkap; jangan gagalkan seluruh halaman */
      })
    return () => {
      batal = true
    }
  }, [])

  // Cerminan filter untuk tombol reset dan label "ada filter aktif".
  const adaFilter =
    Boolean(cari) || Boolean(statusAktif) || Boolean(teknisiAktif) || Boolean(dari) || Boolean(sampai)

  const filterTanggal = useMemo(
    () => ({
      dari: dari ? new Date(`${dari}T00:00:00`).toISOString() : undefined,
      sampai: sampai ? new Date(`${sampai}T23:59:59`).toISOString() : undefined,
    }),
    [dari, sampai],
  )

  const gantiStatus = (nilai) => {
    setStatusAktif(nilai)
    setFilter({ status: nilai || undefined })
  }

  // Backend membatasi `tech_id` hanya untuk admin/drop point, jadi filter ini
  // aman: teknisi atau konsumen yang iseng mengirimkannya tetap diabaikan.
  const gantiTeknisi = (nilai) => {
    setTeknisiAktif(nilai)
    setFilter({ tech_id: nilai || undefined })
  }

  const gantiUrut = (nilai) => {
    setUrutAktif(nilai)
    setFilter({ urut: nilai })
  }

  const gantiRentang = (dariBaru, sampaiBaru) => {
    setDari(dariBaru)
    setSampai(sampaiBaru)
    setFilter({
      dari: dariBaru ? new Date(`${dariBaru}T00:00:00`).toISOString() : undefined,
      sampai: sampaiBaru ? new Date(`${sampaiBaru}T23:59:59`).toISOString() : undefined,
    })
  }

  const resetSemua = () => {
    setStatusAktif('')
    setTeknisiAktif('')
    setUrutAktif('terbaru')
    setCari('')
    setFilter({
      q: undefined,
      status: undefined,
      tech_id: undefined,
      urut: 'terbaru',
      dari: undefined,
      sampai: undefined,
    })
  }

  const jalankanEkspor = async () => {
    setEkspor(true)
    try {
      // Ekspor mengambil seluruh hasil filter, bukan hanya baris yang sedang
      // tampil di layar. Backend meng-clamp halaman, jadi ini diulang sampai
      // baris habis.
      const hasil = await ambilSemua('/api/transaksi', {
        perPage: 200,
        q: cari || undefined,
        status: statusAktif || undefined,
        tech_id: teknisiAktif || undefined,
        urut: urutAktif,
        ...filterTanggal,
      })

      if (hasil.baris.length === 0) {
        toast.warning('Tidak ada data', 'Tidak ada transaksi yang cocok dengan filter ini.')
        return
      }

      const cap = new Date().toISOString().slice(0, 10)
      unduhCsv(`transaksi-komang-sac-${cap}`, KOLOM_CSV, hasil.baris)

      if (hasil.terpotong) {
        toast.warning(
          'Ekspor dipotong',
          `Hanya ${hasil.baris.length} dari ${hasil.total} baris yang bisa diekspor dari browser. Persempit filter, atau buka tabel di Excel.`,
        )
      } else {
        toast.success('Ekspor selesai', `${hasil.baris.length} transaksi diunduh sebagai CSV.`)
      }
    } catch (err) {
      toast.error('Gagal mengekspor', err.friendlyMessage || err.message)
    } finally {
      setEkspor(false)
    }
  }

  const isiTabel = tabel.loading ? (
    <Memuat baris={8} />
  ) : tabel.error ? (
    <GagalMuat pesan={tabel.error} onCobaLagi={tabel.muatUlang} />
  ) : tabel.rows.length === 0 ? (
    <Kosong
      judul={adaFilter ? 'Tidak ada transaksi' : 'Belum ada transaksi'}
      pesan={
        adaFilter
          ? 'Tidak ada transaksi yang cocok dengan kata kunci, status, teknisi, atau rentang tanggal ini.'
          : 'Transaksi muncul di sini begitu pelanggan menyewa jasa cuci.'
      }
      action={adaFilter && (
        <button onClick={resetSemua} className="btn-secondary mt-1">
          Reset filter
        </button>
      )}
    />
  ) : (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/60 text-left">
            <th className="px-4 py-3 font-semibold text-slate-600">Kode</th>
            <th className="px-4 py-3 font-semibold text-slate-600">Pelanggan</th>
            <th className="px-4 py-3 font-semibold text-slate-600">Layanan</th>
            <th className="px-4 py-3 font-semibold text-slate-600">Teknisi</th>
            <th className="px-4 py-3 font-semibold text-slate-600">Status</th>
            <th className="px-4 py-3 font-semibold text-slate-600 text-right">Harga</th>
            <th className="px-4 py-3 font-semibold text-slate-600 text-right">Komisi</th>
            <th className="px-4 py-3 font-semibold text-slate-600 text-right">Aksi</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {tabel.rows.map((t) => {
            const cfg = getStatusConfig(t.status)
            return (
              <tr key={t.id} className="hover:bg-slate-50/60">
                <td className="px-4 py-3">
                  <p className="font-mono text-xs font-semibold text-primary-700">{t.kode || '—'}</p>
                  <p className="text-xs text-slate-500">{formatDateTime(t.created_at)}</p>
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{t.customer?.full_name || '—'}</p>
                  <p className="text-xs text-slate-500">{t.customer?.phone || 'Tanpa kontak'}</p>
                </td>
                <td className="px-4 py-3">
                  <p className="text-slate-900">{t.shoe?.merk || '—'}</p>
                  <p className="text-xs text-slate-500">
                    {t.shoe?.model || ''}
                    {t.shoe?.jenis_treatment ? ` \u00b7 ${t.shoe.jenis_treatment}` : ''}
                  </p>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {t.tech?.full_name || <span className="text-amber-600">Belum ditugaskan</span>}
                </td>
                <td className="px-4 py-3">
                  <span className={cfg.className}>{cfg.label}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <p className="font-semibold text-slate-900">{formatRupiah(t.harga)}</p>
                  {adaRentang(t.shoe?.harga_min, t.shoe?.harga_max) &&
                    t.harga <= (t.shoe?.harga_min || 0) && (
                      <p className="text-[10px] text-amber-600">harga awal, belum final</p>
                    )}
                </td>
                <td className="px-4 py-3 text-right text-slate-600">
                  {formatRupiah(t.tech_commission)}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {t.customer?.phone && (
                      <a
                        href={tautanWa(t.customer.phone, pesanWa(t))}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2 rounded-lg text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"
                        title="Kirim status + invoice via WhatsApp"
                        aria-label={`Kirim WhatsApp invoice ${t.kode || ''}`}
                      >
                        <MessageCircle className="h-4 w-4" />
                      </a>
                    )}
                    <button
                      onClick={() => setDetail(t)}
                      className="p-2 rounded-lg text-slate-400 hover:bg-primary-50 hover:text-primary-600"
                      title="Lihat detail"
                      aria-label={`Lihat detail ${t.kode || ''}`}
                    >
                      <Eye className="h-4 w-4" />
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
          <h2 className="text-xl font-bold text-slate-900">Transaksi</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Semua transaksi cuci beserta nilai dan komisi teknisi (40% dari harga daftar).
          </p>
        </div>
        <button onClick={jalankanEkspor} className="btn-secondary shrink-0" disabled={ekspor}>
          {ekspor ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {ekspor ? 'Menyiapkan...' : 'Ekspor CSV'}
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="space-y-3 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex-1 sm:max-w-xs">
            <SearchInput
              value={cari}
              onChange={setCari}
              placeholder="Cari kode tracking (KS-XXXXXX)..."
            />
          </div>

            <select
              value={statusAktif}
              onChange={(e) => gantiStatus(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-primary-500 focus:outline-none"
              aria-label="Filter status"
            >
              <option value="">Semua status</option>
              {STATUS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            {teknisi.length > 0 && (
              <select
                value={teknisiAktif}
                onChange={(e) => gantiTeknisi(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-primary-500 focus:outline-none"
                aria-label="Filter teknisi"
              >
                <option value="">Semua teknisi</option>
                <option value="null">Belum ditugaskan</option>
                {teknisi.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.full_name}
                  </option>
                ))}
              </select>
            )}

            <select
              value={urutAktif}
              onChange={(e) => gantiUrut(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-primary-500 focus:outline-none"
              aria-label="Urutkan"
            >
              {URUT.map((u) => (
                <option key={u.nilai} value={u.nilai}>
                  {u.label}
                </option>
              ))}
            </select>

            {adaFilter && (
              <button onClick={resetSemua} className="btn-ghost text-slate-500">
                Reset
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-3 border-t border-slate-100 pt-3">
            <Field label="Dari tanggal" className="w-full sm:w-44">
              <input
                type="date"
                value={dari}
                max={sampai || undefined}
                onChange={(e) => gantiRentang(e.target.value, sampai)}
                className="input"
              />
            </Field>
            <Field label="Sampai tanggal" className="w-full sm:w-44">
              <input
                type="date"
                value={sampai}
                min={dari || undefined}
                onChange={(e) => gantiRentang(dari, e.target.value)}
                className="input"
              />
            </Field>
            {(dari || sampai) && (
              <button
                onClick={() => gantiRentang('', '')}
                className="btn-ghost mb-1 text-slate-500"
              >
                Hapus rentang tanggal
              </button>
            )}
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
          label="transaksi"
        />
      </div>

      <DetailTransaksi
        transaksi={detail}
        onClose={() => setDetail(null)}
        onTersimpan={(trx) => {
          // Perbarui baris yang sedang dibuka supaya angka harga di detail ikut
          // berubah tanpa harus menutup dan membuka modal lagi.
          setDetail(trx)
          tabel.muatUlang()
        }}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */

function Baris({ label, nilai, className }) {
  return (
    <div className={cn('flex justify-between gap-4 py-2', className)}>
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-medium text-slate-900 text-right">{nilai || '—'}</span>
    </div>
  )
}

function Foto({ label, url, wajib }) {
  return (
    <div>
      <p className="label">{label}</p>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="block">
          <img
            src={url}
            alt={label}
            className="w-full h-40 object-cover rounded-xl border border-slate-200"
            loading="lazy"
          />
        </a>
      ) : (
        <div
          className={cn(
            'w-full h-40 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 text-center px-3',
            wajib ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-400',
          )}
        >
          <ImageOff className="h-5 w-5" />
          <p className="text-xs">Belum ada foto</p>
          {wajib && (
            <p className="text-[10px] leading-tight">
              Wajib ada sebelum status Selesai
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* FINALISASI HARGA                                                    */
/* ------------------------------------------------------------------ */
/*
 * Layanan ber-harga-rentang (Repaint 80.000-150.000) dicatat dari harga
 * terendah saat pelanggan booking. Angka itu belum final -- Dickson di outlet
 * baru bisa dilihat setelah barangnya ada di tangan teknisi. Bagian ini
 * mengubahnya, dan backend otomatis menghitung ulang komisi teknisi karena
 * komisi selalu 40% dari harga yang berlaku.
 *
 * Sengaja TIDAK ditampilkan kalau status sudah "Siap diambil": barang sudah
 * diambil, uang sudah masuk, dan mengubah harga saat itu membuat laporan
 * pendapatan tidak cocok dengan realita. Backend juga menolak, jadi UI
 * duduk di depan aturan yang sama.
 */
function FinalisasiHarga({ transaksi, onTersimpan }) {
  const [terbuka, setTerbuka] = useState(false)
  const [harga, setHarga] = useState(String(transaksi.harga ?? ''))
  const [alasan, setAlasan] = useState('')
  const [simpan, setSimpan] = useState(false)
  const [error, setError] = useState('')

  const t = transaksi
  const terkunci = t.status === 'Siap diambil'
  const sudahFinal = !adaRentang(t.shoe?.harga_min, t.shoe?.harga_max)

  if (terkunci || sudahFinal) return null

  const kirim = async () => {
    const angka = Number(harga)
    if (!Number.isFinite(angka) || angka < 0) {
      setError('Harga harus berupa angka dan tidak boleh negatif')
      return
    }
    setError('')
    setSimpan(true)
    try {
      const { data } = await transactionsApi.setHarga(t.id, angka, alasan.trim() || undefined)
      toast.success('Harga final disimpan', `Komisi teknisi dihitung ulang jadi ${formatRupiah(Math.floor(angka * 0.4))}.`)
      setTerbuka(false)
      setAlasan('')
      onTersimpan(data)
    } catch (err) {
      setError(err.friendlyMessage || err.message)
    } finally {
      setSimpan(false)
    }
  }

  const bawah = t.shoe?.harga_min ?? 0
  const atas = t.shoe?.harga_max ?? 0

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-900">Harga final belum ditetapkan</p>
          <p className="text-xs text-amber-800 mt-0.5">
            Layanan ini punya rentang {formatRupiah(bawah)} - {formatRupiah(atas)}. Yang tercatat
            sekarang {formatRupiah(t.harga)} (harga terendah).
          </p>
        </div>
        {!terbuka && (
          <button onClick={() => setTerbuka(true)} className="btn-primary text-sm px-3 py-2 shrink-0">
            Tetapkan Harga
          </button>
        )}
      </div>

      {terbuka && (
        <div className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Harga final" required error={error}>
              <input
                type="number"
                min="0"
                step="1000"
                value={harga}
                onChange={(e) => setHarga(e.target.value)}
                className={cn('input', error && 'input-error')}
                placeholder={String(atas)}
              />
            </Field>
            <Field label="Alasan (opsional)" hint="Tercatat di catatan teknisi">
              <input
                type="text"
                value={alasan}
                onChange={(e) => setAlasan(e.target.value)}
                className="input"
                placeholder="Contoh: area repaint 20 cm"
              />
            </Field>
          </div>
          <p className="text-xs text-amber-800">
            Di luar rentang? Boleh, tapi pastikan alasannya jelas.{' '}
            {Number(harga) >= bawah && Number(harga) <= atas
              ? 'Harga ini masih di dalam rentang daftar.'
              : 'Harga ini di luar rentang daftar.'}
          </p>
          <div className="flex gap-2">
            <button onClick={kirim} disabled={simpan} className="btn-primary text-sm px-3 py-2">
              {simpan && <Loader2 className="h-4 w-4 animate-spin" />}
              Simpan
            </button>
            <button
              onClick={() => {
                setTerbuka(false)
                setError('')
              }}
              disabled={simpan}
              className="btn-secondary text-sm px-3 py-2"
            >
              Batal
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function DetailTransaksi({ transaksi, onClose, onTersimpan }) {
  if (!transaksi) return null
  const t = transaksi
  const cfg = getStatusConfig(t.status)
  const wa = tautanWa(t.customer?.phone, pesanWa(t))

  return (
    <Modal
      open
      onClose={onClose}
      title={`Transaksi ${t.kode || '(tanpa kode)'}`}
      description={`Masuk ${formatDateTime(t.created_at)}${t.updated_at ? ` \u00b7 diperbarui ${formatDateTime(t.updated_at)}` : ''}`}
      lebar="max-w-2xl"
      footer={
        <div className="flex flex-wrap gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">
            Tutup
          </button>
          {wa && (
            <a href={wa} target="_blank" rel="noreferrer" className="btn-primary flex-1">
              <MessageCircle className="h-4 w-4" />
              Kirim Invoice WhatsApp
            </a>
          )}
        </div>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
          <span className={cfg.className}>{cfg.label}</span>
          <p className="text-xs text-slate-500">
            Diperbarui {t.updated_at ? formatDateTime(t.updated_at) : 'belum pernah'}
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-1">
            <p className="section-title mb-2">Pelanggan</p>
            <div className="divide-y divide-slate-100">
              <Baris label="Nama" nilai={t.customer?.full_name} />
              <Baris label="WhatsApp" nilai={t.customer?.phone} />
              <Baris label="Catatan pelanggan" nilai={t.catatan_konsumen} />
            </div>
          </div>

          <div className="space-y-1">
            <p className="section-title mb-2">Layanan & Teknisi</p>
            <div className="divide-y divide-slate-100">
              <Baris label="Layanan" nilai={t.shoe?.merk} />
              <Baris label="Varian" nilai={t.shoe?.model} />
              <Baris label="Kelompok" nilai={t.shoe?.kelompok} />
              <Baris label="Treatment" nilai={t.shoe?.jenis_treatment} />
              <Baris label="Teknisi" nilai={t.tech?.full_name} />
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <p className="section-title mb-2">Nilai Transaksi</p>
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 px-4">
            <Baris label="Harga jual" nilai={formatRupiah(t.harga)} />
            <Baris
              label="Komisi teknisi (40%)"
              nilai={formatRupiah(t.tech_commission)}
            />
            <Baris
              label="Sisa untuk outlet"
              nilai={formatRupiah((t.harga || 0) - (t.tech_commission || 0))}
            />
          </div>
          <div className="mt-3">
            <FinalisasiHarga transaksi={t} onTersimpan={onTersimpan} />
          </div>
        </div>

        {(t.catatan_konsumen || t.defect_notes) && (
          <div className="space-y-3">
            <p className="section-title">Catatan</p>
            {t.catatan_konsumen && (
              <div className="flex gap-3 rounded-xl bg-blue-50 p-4">
                <MessageSquare className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-blue-900">Dari pelanggan</p>
                  <p className="mt-1 text-sm text-blue-800">{t.catatan_konsumen}</p>
                </div>
              </div>
            )}
            {t.defect_notes && (
              <div className="flex gap-3 rounded-xl bg-amber-50 p-4">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-900">Catatan teknisi</p>
                  <p className="mt-1 text-sm text-amber-800">{t.defect_notes}</p>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="space-y-3">
          <p className="section-title">Dokumentasi</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Foto label="Foto sebelum" url={t.photo_before} />
            <Foto label="Foto sesudah" url={t.photo_after} wajib />
          </div>
          {!t.photo_after && (
            <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
              <Wallet className="h-4 w-4 shrink-0 mt-0.5" />
              Backend menolak status Selesai / Siap diambil selama foto sesudah masih kosong. Unggah
              fotonya dari halaman Teknisi.
            </p>
          )}
        </div>
      </div>
    </Modal>
  )
}