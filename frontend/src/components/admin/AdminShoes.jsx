import { useState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { shoesApi } from "../../services/api";
import { useCariTunda, useTabel } from "../../hooks/useTabel";
import { cn, hargaLayanan } from "../../utils/helpers";
import { toast } from "../Toast";
import Pagination from "../Pagination";
import Modal, {
  BadgeAktif,
  Field,
  GagalMuat,
  Kosong,
  KonfirmasiDialog,
  Memuat,
  SearchInput,
} from "../AdminUi";

// Saran treatment (gabungan semua kelompok). Input bebas ketik karena backend
// pakai pola terbuka. Saran ini supaya admin tidak perlu ingat ejaan tiap kali.
const SARAN_TREATMENT = [
  "Fast Cleaning",
  "Deep Cleaning",
  "Suede Treatment",
  "Kids Shoes",
  "Unyellowing",
  "Slippers",
  "Bag Cleaning",
  "Hat Cleaning",
  "Helmet Cleaning",
  "Shoes Repaint",
  "Shoes Reglue",
  "Jahit Sol",
];

const FORM_AWAL = {
  // 'merk' = Treatment (Nama Layanan), 'model' = Varian
  merk: "",
  model: "",
  harga_cuci: "",
  rentang: false,
  harga_max: "",
  jenis_treatment: "",
  keterangan_treatment: "",
  status: true,
};

/**
 * Ubah nilai form yang controlled dari string menjadi tipe yang benar
 * untuk backend: harga jadi integer, status jadi boolean. String kosong
 * jadi null supaya field yang dikosongkan tidak menimpa nilai lama saat edit.
 *
 * `rentang` menentukan bentuk harga yang dikirim:
 *   - mati   -> harga_cuci saja, harga_max null (harga tetap)
 *   - hidup  -> harga_cuci = harga_min, harga_max diisi
 * Backend juga menyamakan harga_cuci dengan harga_min, tapi mengirimnya
 * eksplisit supaya tidak bergantung pada perilaku itu.
 */
function kePayload(form, { hanyaStatus = false } = {}) {
  if (hanyaStatus) return { status: form.status };

  const harga = Number(form.harga_cuci);
  const hargaAtas = Number(form.harga_max);
  const isi = (v) => (v === "" || v === null ? undefined : v);
  const pakaiRentang =
    Boolean(form.rentang) && Number.isFinite(hargaAtas) && hargaAtas > harga;

  return {
    // kelompok tidak dari form, default ke "Cuci Sepatu" (backend akan handle)
    kelompok: "Cuci Sepatu",
    merk: form.merk.trim(),
    model: isi(form.model?.trim()) ?? null,
    harga_cuci: Number.isFinite(harga) ? harga : 0,
    harga_min: pakaiRentang ? harga : null,
    harga_max: pakaiRentang ? hargaAtas : null,
    jenis_treatment: isi(form.jenis_treatment?.trim()) ?? null,
    keterangan_treatment: isi(form.keterangan_treatment?.trim()) ?? null,
    status: form.status,
  };
}

function formDariBaris(baris) {
  // Baris yang sudah punya harga_max yang lebih besar dari harga_cuci berarti
  // memang layanan rentang -- checkbox langsung tercentang, bukan selalu kosong.
  const bawah = baris.harga_min ?? baris.harga_cuci;
  const atas = baris.harga_max;
  const rentang = atas != null && Number(atas) > Number(bawah);

  return {
    // kelompok tidak di-edit di form, default
    merk: baris.merk ?? "",
    model: baris.model ?? "",
    harga_cuci: bawah != null ? String(bawah) : "",
    rentang,
    harga_max: rentang ? String(atas) : "",
    jenis_treatment: baris.jenis_treatment ?? "",
    keterangan_treatment: baris.keterangan_treatment ?? "",
    status: Boolean(baris.status),
  };
}

export default function AdminShoes() {
  // Default panel admin adalah tab "Semua", jadi harus membaca master nonaktif
  // juga -- kalau tidak, layanan yang dinonaktifkan tidak akan pernah terlihat
  // untuk dihidupkan kembali. Endpoint tanpa parameter justru hanya mengembalikan
  // yang aktif.
  const tabel = useTabel({
    endpoint: "/api/sepatu",
    filterAwal: { aktif_only: false },
  });
  const { setFilter } = tabel;
  const [cari, setCari] = useCariTunda(setFilter);

  const [tabStatus, setTabStatus] = useState("semua");
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [simpan, setSimpan] = useState(false);
  const [hapus, setHapus] = useState(null);

  const gantiTabStatus = (nilai) => {
    setTabStatus(nilai);
    if (nilai === "semua") {
      // Tanpa filter sama sekali: aktif_only=false berarti "jangan pakai
      // default True", cari_status tidak dikirim berarti "tidak cares status".
      setFilter({ aktif_only: false, cari_status: undefined });
    } else {
      setFilter({
        aktif_only: nilai === "aktif",
        cari_status: nilai === "nonaktif" ? false : undefined,
      });
    }
  };

  const bukaTambah = () => {
    setErrors({});
    setForm({ ...FORM_AWAL });
  };

  const bukaEdit = (baris) => {
    setErrors({});
    setForm(formDariBaris(baris));
  };

  const tutupForm = () => {
    setForm(null);
    setErrors({});
  };

  const ubahField = (nama, nilai) => setForm((f) => ({ ...f, [nama]: nilai }));

  const validasi = () => {
    if (!form) return {};
    const e = {};
    if (!form.merk.trim()) e.merk = "Nama layanan wajib diisi";
    const harga = Number(form.harga_cuci);
    if (form.harga_cuci === "" || !Number.isFinite(harga))
      e.harga_cuci = "Harga wajib diisi";
    else if (harga < 0) e.harga_cuci = "Harga tidak boleh negatif";

    if (form.rentang) {
      const atas = Number(form.harga_max);
      if (form.harga_max === "" || !Number.isFinite(atas))
        e.harga_max = "Harga atas wajib diisi";
      else if (atas < harga)
        e.harga_max = "Harga atas harus lebih besar dari harga bawah";
    }
    return e;
  };

  const kirim = async () => {
    const e = validasi();
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setSimpan(true);
    try {
      if (form.id) {
        await shoesApi.update(form.id, kePayload(form));
        toast.success("Layanan diperbarui", `${form.merk} berhasil disimpan.`);
      } else {
        await shoesApi.create(kePayload(form));
        toast.success("Layanan ditambahkan", `${form.merk} masuk ke katalog.`);
      }
      tutupForm();
      tabel.muatUlang();
    } catch (err) {
      toast.error("Gagal menyimpan", err.friendlyMessage || err.message);
    } finally {
      setSimpan(false);
    }
  };

  const toggleStatus = async (baris) => {
    try {
      await shoesApi.update(baris.id, { status: !baris.status });
      toast.success(
        baris.status ? "Layanan dinonaktifkan" : "Layanan diaktifkan",
        `${baris.merk} ${baris.status ? " disembunyikan dari katalog" : "kembali tampil di katalog"}.`,
      );
      tabel.muatUlang();
    } catch (err) {
      toast.error("Gagal mengubah status", err.friendlyMessage || err.message);
    }
  };

  const konfirmasiHapus = async () => {
    try {
      await shoesApi.remove(hapus.id);
      toast.success("Layanan dihapus", `${hapus.merk} dihapus dari katalog.`);
      setHapus(null);
      tabel.muatUlang();
    } catch (err) {
      toast.error("Gagal menghapus", err.friendlyMessage || err.message);
    }
  };

  const adaFilter = Boolean(cari) || tabStatus !== "semua";
  const isiTabel = tabel.loading ? (
    <Memuat baris={7} />
  ) : tabel.error ? (
    <GagalMuat pesan={tabel.error} onCobaLagi={tabel.muatUlang} />
  ) : tabel.rows.length === 0 ? (
    <Kosong
      judul={adaFilter ? "Tidak ada hasil" : "Belum ada layanan"}
      pesan={
        adaFilter
          ? "Coba ubah kata kunci atau filter status."
          : "Tambahkan layanan beserta harganya supaya muncul di katalog."
      }
      action={
        !adaFilter && (
          <button onClick={bukaTambah} className="btn-primary mt-1">
            <Plus className="h-4 w-4" />
            Tambah layanan
          </button>
        )
      }
    />
  ) : (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/60 text-left">
            <th className="px-4 py-3 font-semibold text-slate-600">
              Treatment & Varian
            </th>
            <th className="px-4 py-3 font-semibold text-slate-600">
              Keterangan
            </th>
            <th className="px-4 py-3 font-semibold text-slate-600 text-right">
              Harga
            </th>
            <th className="px-4 py-3 font-semibold text-slate-600 text-center">
              Status
            </th>
            <th className="px-4 py-3 font-semibold text-slate-600 text-right">
              Aksi
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {tabel.rows.map((baris) => (
            <tr key={baris.id} className="hover:bg-slate-50/60">
              <td className="px-4 py-3">
                <p className="font-medium text-slate-900">{baris.merk}</p>
                {baris.model && (
                  <p className="text-xs text-slate-500">{baris.model}</p>
                )}
              </td>
              <td className="px-4 py-3 text-slate-600 max-w-xs">
                <p
                  className="truncate"
                  title={baris.keterangan_treatment || ""}
                >
                  {baris.keterangan_treatment || "—"}
                </p>
              </td>
              <td className="px-4 py-3 text-right">
                {(() => {
                  const h = hargaLayanan(baris);
                  return (
                    <>
                      <p className="font-semibold text-slate-900">{h.teks}</p>
                      {h.rentang && (
                        <p className="text-xs text-slate-500">
                          hanya sementara, bisa berbeda
                        </p>
                      )}
                    </>
                  );
                })()}
              </td>
              <td className="px-4 py-3 text-center">
                <button
                  onClick={() => toggleStatus(baris)}
                  title="Klik untuk ganti status"
                >
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
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Kelola Layanan</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Daftar layanan, variasi, dan detail treatment yang muncul di katalog
            publik.
          </p>
        </div>
        <button onClick={bukaTambah} className="btn-primary shrink-0">
          <Plus className="h-4 w-4" />
          Tambah Layanan
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1 sm:max-w-xs">
            <SearchInput
              value={cari}
              onChange={setCari}
              placeholder="Cari layanan, varian, atau keterangan..."
            />
          </div>

          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
            {[
              { nilai: "semua", label: "Semua" },
              { nilai: "aktif", label: "Aktif" },
              { nilai: "nonaktif", label: "Nonaktif" },
            ].map((t) => (
              <button
                key={t.nilai}
                onClick={() => gantiTabStatus(t.nilai)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                  tabStatus === t.nilai
                    ? "bg-white text-primary-700 shadow-sm"
                    : "text-slate-600 hover:text-slate-800",
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
          label="layanan"
        />
      </div>

      <Modal
        open={Boolean(form)}
        onClose={tutupForm}
        title={form?.id ? "Ubah Layanan" : "Tambah Layanan"}
        description="Layanan ini muncul di katalog publik selama statusnya aktif."
        footer={
          <div className="flex gap-3">
            <button
              onClick={tutupForm}
              className="btn-secondary flex-1"
              disabled={simpan}
            >
              Batal
            </button>
            <button
              onClick={kirim}
              className="btn-primary flex-1"
              disabled={simpan}
            >
              {simpan && <Loader2 className="h-4 w-4 animate-spin" />}
              {form?.id ? "Simpan Perubahan" : "Tambah"}
            </button>
          </div>
        }
      >
        {form && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Treatment" required error={errors.merk}>
                <input
                  type="text"
                  value={form.merk}
                  onChange={(e) => ubahField("merk", e.target.value)}
                  className={cn("input", errors.merk && "input-error")}
                  placeholder="Fast Cleaning, Deep Cleaning, Shoes Repaint..."
                />
              </Field>
              <Field
                label="Varian"
                hint="Normal, Express, White, Upper Suede, dll. Kosongkan kalau tidak ada."
              >
                <input
                  type="text"
                  value={form.model}
                  onChange={(e) => ubahField("model", e.target.value)}
                  className="input"
                  placeholder="White, Upper Suede..."
                />
              </Field>
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.rentang}
                onChange={(e) =>
                  setForm((f) => ({ ...f, rentang: e.target.checked }))
                }
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              <span>
                <span className="text-sm font-medium text-slate-800">
                  Harga ada rentang
                </span>
                <span className="block text-xs text-slate-500">
                  Untuk layanan yang harganya tergantung kondisi, mis. Repaint
                  80.000 - 150.000. Transaksi dicatat dari harga bawah, harga
                  final ditetapkan admin di outlet.
                </span>
              </span>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={form.rentang ? "Harga Bawah" : "Harga"}
                required
                error={errors.harga_cuci}
              >
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={form.harga_cuci}
                  onChange={(e) => ubahField("harga_cuci", e.target.value)}
                  className={cn("input", errors.harga_cuci && "input-error")}
                  placeholder="25000"
                />
              </Field>
              {form.rentang && (
                <Field label="Harga Atas" required error={errors.harga_max}>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={form.harga_max}
                    onChange={(e) => ubahField("harga_max", e.target.value)}
                    className={cn("input", errors.harga_max && "input-error")}
                    placeholder="50000"
                  />
                </Field>
              )}
            </div>

            <Field
              label="Keterangan"
              hint="Ditampilkan di kartu katalog, misal: 'upper, midsole, outsole, insole, dan leces'"
            >
              <textarea
                rows={3}
                value={form.keterangan_treatment}
                onChange={(e) =>
                  ubahField("keterangan_treatment", e.target.value)
                }
                className="input resize-none"
                placeholder="Contoh: Bersih noda keras, whitening soles, dan bau."
              />
            </Field>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.status}
                onChange={(e) => ubahField("status", e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              <span>
                <span className="text-sm font-medium text-slate-800">
                  Aktif
                </span>
                <span className="block text-xs text-slate-500">
                  Nonaktif berarti tersembunyi dari katalog publik, tapi riwayat
                  transaksi lama tetap utuh.
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
        judul="Hapus layanan ini?"
        pesan={
          hapus
            ? `"${hapus.merk}${hapus.model ? ` ${hapus.model}` : ""}" akan hilang dari katalog. Kalau masih dipakai transaksi, backend menolak dan sebaiknya nonaktifkan saja.`
            : ""
        }
      />
    </div>
  );
}
