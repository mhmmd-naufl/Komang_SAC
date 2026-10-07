import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Clock,
  Download,
  Footprints,
  Loader2,
  Package,
  TrendingDown,
  TrendingUp,
  Minus,
  Users,
  Wallet,
} from "lucide-react";
import {
  analyticsApi,
  statsApi,
  stockApi,
  transactionsApi,
} from "../services/api";
import { unduhCsv, ambilSemua } from "../utils/csv";
import {
  cn,
  formatDate,
  formatDateTime,
  formatRupiah,
  getStatusConfig,
} from "../utils/helpers";
import { keParameter, labelPeriode, periodeAwal } from "../utils/periode";
import AnalyticsSummary from "./AnalyticsSummary";
import GrafikBatang, { GrafikBatangHorizontal } from "./admin/Grafik";
import PilihPeriode from "./admin/PilihPeriode";
import { toast } from "./Toast";

/**
 * Dashboard admin.
 *
 * DI SINI seluruh angka dan grafik diletakkan, bukan di panel AI.
 *
 * Pembatasannya disengaja:
 *   - Statistik dan tren dihitung backend (analytics.gather_facts) secara
 *     deterministik, lalu dihitung ulang di frontend untuk chart dari angka
 *     yang sama. Tidak ada satu pun angka dashboard yang melewati model bahasa,
 *     karena angka yang berubah-ubah tiap refresh tidak bisa dipakai menghitung
 *     bayar teknisi.
 *   - Panel AI (AnalyticsSummary) hanya menampilkan ringkasan dan saran, dan
 *     menerima datanya dari sini supaya tidak ada permintaan ganda ke
 *     /api/analytics/summary.
 *
 * SEMUA angka periode dihitung dari `selesai_at` -- tanggal teknisi menandai
 * Selesai. Jadi "Omzet Oktober" = pekerjaan yang rampung di Oktober. Lihat
 * utils/periode.js.
 *
 * Transaksi terbaru dan stok menipis SENGAJA tidak difilter periode: keduanya
 * adalah kondisi "sekarang", bukan hasil periode. Menampilkan transaksi
 * terbaru dari bulan lalu di bawah judul "Oktober 2026" hanya membingungkan.
 */

/** Angka yang selalu ada, biar tidak perlu optional-chaining di mana-mana. */
const RINGKASAN_KOSONG = {
  total_transaksi: 0,
  shoes_washed: 0,
  total_pendapatan: 0,
  total_teknisi: 0,
  per_teknisi: [],
  per_status: {},
  masih_jalan: 0,
  total_komisi: 0,
  sisa_untuk_outlet: 0,
  periode: { label: "-", granularitas: "hari" },
};

function TrenBadge({ persen, teks }) {
  if (persen === null || persen === undefined) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
        <Minus className="h-3 w-3" /> belum ada pembanding
      </span>
    );
  }
  const naik = persen > 0;
  const turun = persen < 0;
  const warna = naik
    ? "bg-emerald-50 text-emerald-700"
    : turun
      ? "bg-rose-50 text-rose-700"
      : "bg-slate-100 text-slate-600";
  const Icon = naik ? TrendingUp : turun ? TrendingDown : Minus;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold",
        warna,
      )}
    >
      <Icon className="h-3 w-3" />
      {Math.abs(persen)}% {teks || "vs periode sebelumnya"}
    </span>
  );
}

export default function AdminDashboard() {
  const [periode, setPeriode] = useState(() => periodeAwal());
  const [loading, setLoading] = useState(true);
  const [memuatAi, setMemuatAi] = useState(false);
  const [error, setError] = useState(null);
  const [errorAi, setErrorAi] = useState(null);
  const [data, setData] = useState(null);
  const [ai, setAi] = useState(null);
  const [modeGrafik, setModeGrafik] = useState("jumlah");
  const [mengekspor, setMengekspor] = useState("");

  // Parameter backend dihitung sekali per perubahan periode, lalu dipakai lagi
  // oleh muat() dan oleh ekspor. Kalau dihitung di dua tempat, tidak ada
  // jaminan keduanya benar-benar sama -- dan laporan yang diekspor berbeda dari
  // yang tampil adalah kegagalan yang paling sulit dicari.
  const param = useMemo(() => keParameter(periode), [periode]);
  const label = useMemo(() => labelPeriode(periode), [periode]);

  const muat = useCallback(
    async (diam = false) => {
      if (diam) setMemuatAi(true);
      else setLoading(true);
      setError(null);
      try {
        // Backend expect single integer untuk bulan/tahun, bukan array.
        // Kalau multi-select, kirim periode=semua (tanpa filter bulan/tahun).
        const p = (param.bulan?.length === 1 && param.tahun?.length === 1)
          ? { bulan: param.bulan[0], tahun: param.tahun[0] }
          : { periode: 'semua' };

        // Core dashboard diambil dari endpoint gabungan supaya satu refresh
        // hanya butuh satu panggilan untuk angka, grafik, dan stok kritis.
        const [dashboard, trx, stock] = await Promise.all([
          statsApi.admin(p),
          transactionsApi.list({ limit: 8 }),
          stockApi.list({ low_stock: true }),
        ]);

        setData({
          ringkasan: dashboard?.data?.ringkasan || dashboard?.data || RINGKASAN_KOSONG,
          terbaru: Array.isArray(trx.data) ? trx.data : [],
          stok_menipis: Array.isArray(stock.data) ? stock.data : [],
        });

        // Analytics boleh gagal: panel AI menampilkan penyebabnya, sementara
        // angka dan grafik di atasnya tetap valid. Jadi dipisah try/catch-nya.
        try {
          const analitik = await analyticsApi.summary(p);
          setAi(analitik.data);
          setErrorAi(null);
        } catch (errAi) {
          setAi(null);
          setErrorAi(errAi?.friendlyMessage || "Gagal memuat ringkasan.");
        }
      } catch (err) {
        // 403/401 = sesi tidak valid, biarkan interceptor yang tangani. Jadi
        // di sini cuma error lain yang perlu ditampilkan, dan dashboard harus
        // tetap tampil dengan angka nol -- layar kosong lebih buruk daripada
        // angka yang jelas salah.
        setError(err?.friendlyMessage || "Gagal memuat data dashboard.");
        setErrorAi(null);
      } finally {
        setLoading(false);
        setMemuatAi(false);
      }
    },
    [param],
  );

  useEffect(() => {
    muat();
  }, [muat]);

  const r = data?.ringkasan || RINGKASAN_KOSONG;
  const fakta = ai?.fakta || {};
  const tren = Array.isArray(fakta.grafik) ? fakta.grafik : [];
  const pakaiOmzet = modeGrafik === "omzet";

  /* ---------------------------------------------------------------- */
  /* EKSPOR CSV                                                        */
  /* ---------------------------------------------------------------- */
  /*
   * Tiga berkas terpisah, masing-masing satu bentuk tabel. Dictionaries
   * satu-baris ("Ringkasan") sengaja tidak digabung dengan daftar per teknisi
   * atau deret harian: begitu dicampur ke satu sheet, kolom "Omzet" jadi
   * campuran angka rupiah dan jumlah pekerjaan, dan SUM di Excel menghitung
   * hal yang tidak pernah ada artinya.
   */

  const namaBerkas = (akhiran) =>
    `komang-sac-${akhiran}-${param.tahun || "semua"}${param.bulan ? `-${String(param.bulan).padStart(2, "0")}` : ""}`;

  const eksporRingkasan = () => {
    const growth = fakta.perubahan_omzet_persen;
    const baris = [
      ["Periode", r.periode?.label || label],
      ["Transaksi selesai", r.total_transaksi ?? 0],
      ["Sepatu dicuci (selesai)", r.shoes_washed ?? 0],
      ["Omzet", r.total_pendapatan ?? 0],
      ["Komisi teknisi", r.total_komisi ?? 0],
      ["Sisa untuk outlet", r.sisa_untuk_outlet ?? 0],
      ["Perubahan omzet vs periode sebelumnya (%)", growth ?? ""],
      ["Omzet periode sebelumnya", fakta.periode_lalu_omzet ?? ""],
      ["Masih dikerjakan (semua periode)", r.masih_jalan ?? 0],
      ["Jumlah teknisi", r.total_teknisi ?? 0],
      ["Stok di bawah minimum", fakta.jumlah_stok_kritis ?? 0],
      ["Pekerjaan tertahan > 2 hari", fakta.jumlah_tertahan ?? 0],
    ];
    unduhCsv(
      namaBerkas("ringkasan"),
      [
        { judul: "Keterangan", kunci: "k" },
        { judul: "Nilai", kunci: "v" },
      ],
      baris.map(([k, v]) => ({ k, v })),
    );
  };

  const eksporTren = () => {
    unduhCsv(
      namaBerkas("tren"),
      [
        { judul: "Periode", kunci: "label" },
        { judul: "Satuan sumbu", kunci: "satuan" },
        { judul: "Pekerjaan selesai", kunci: "jumlah" },
        { judul: "Omzet", kunci: "omzet" },
      ],
      tren.map((d) => ({
        ...d,
        satuan: r.periode?.granularitas === "bulan" ? "Per bulan" : "Per hari",
      })),
    );
  };

  const eksporTransaksi = async () => {
    setMengekspor("trx");
    try {
      const { baris, terpotong } = await ambilSemua("/api/transaksi", {
        dari_selesai: param.selesaiDari,
        sampai_selesai: param.selesaiSampai,
        urut: "terlama",
      });
      unduhCsv(
        namaBerkas("transaksi"),
        [
          { judul: "Kode", kunci: "kode" },
          {
            judul: "Tanggal Masuk",
            nilai: (t) => formatDateTime(t.created_at),
          },
          {
            judul: "Tanggal Selesai",
            nilai: (t) => (t.selesai_at ? formatDateTime(t.selesai_at) : ""),
          },
          { judul: "Pelanggan", nilai: (t) => t.customer?.full_name || "" },
          { judul: "Layanan", nilai: (t) => t.shoe?.merk || "" },
          { judul: "Varian", nilai: (t) => t.shoe?.model || "" },
          { judul: "Kelompok", nilai: (t) => t.shoe?.kelompok || "" },
          { judul: "Teknisi", nilai: (t) => t.tech?.full_name || "" },
          { judul: "Status", kunci: "status" },
          { judul: "Harga", nilai: (t) => t.harga ?? "" },
          { judul: "Komisi Teknisi", nilai: (t) => t.tech_commission ?? "" },
        ],
        baris,
      );
      if (terpotong) {
        toast.warning(
          "Ekspor dipotong",
          "Berkas berisi 5.000 baris pertama. Persempit periodenya untuk sisanya.",
        );
      } else {
        toast.success(
          "Ekspor selesai",
          `${baris.length} transaksi selesai ${label} diunduh.`,
        );
      }
    } catch (err) {
      toast.error("Gagal mengekspor", err?.friendlyMessage || err?.message);
    } finally {
      setMengekspor("");
    }
  };

  const eksporSemua = async () => {
    eksporRingkasan();
    eksporTren();
    await eksporTransaksi();
  };

  /* ---------------------------------------------------------------- */

  const cards = [
    {
      label: "Sepatu Dicuci",
      value: r.shoes_washed,
      sub: "pekerjaan selesai di periode ini",
      icon: Footprints,
      warna: "bg-blue-50 text-blue-600",
    },
    {
      label: "Omzet",
      value: formatRupiah(r.total_pendapatan),
      sub: <TrenBadge persen={fakta.perubahan_omzet_persen} />,
      icon: Wallet,
      warna: "bg-emerald-50 text-emerald-600",
    },
    {
      label: "Transaksi",
      value: r.total_transaksi,
      sub: `${r.masih_jalan || 0} masih dikerjakan`,
      icon: TrendingUp,
      warna: "bg-violet-50 text-violet-600",
    },
    {
      label: "Sisa untuk Outlet",
      value: formatRupiah(r.sisa_untuk_outlet),
      sub: `setelah komisi teknisi ${formatRupiah(r.total_komisi)}`,
      icon: Users,
      warna: "bg-cyan-50 text-cyan-600",
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Kepala + pemilih periode + ekspor */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">
            Performa laundry, dihitung dari pekerjaan yang selesai di {label}.
          </p>
        </div>
      </div>

      <div className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PilihPeriode nilai={periode} onGanti={setPeriode} />
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={eksporSemua}
              disabled={mengekspor === "trx" || !r.total_transaksi}
              className="btn-primary px-3 py-2 text-xs"
              title="Unduh ringkasan, tren, dan transaksi periode ini"
            >
              {mengekspor === "trx" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              Ekspor CSV
            </button>
          </div>
        </div>
        <p className="mt-2.5 text-[11px] text-slate-500">
          Angka di bawah dihitung dari tanggal selesai yang dicatat teknisi.
          Pekerjaan yang masih dikerjakan saat ini (belum masuk hitungan periode
          mana pun): <strong>{r.masih_jalan || 0}</strong>.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Data dashboard belum bisa dimuat.</p>
            <p className="text-xs mt-0.5">{error}</p>
            <button
              onClick={() => muat()}
              className="text-xs font-semibold underline mt-1.5"
            >
              Coba lagi
            </button>
          </div>
        </div>
      )}

      {/* Kartu angka */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="card p-5">
            <div
              className={cn(
                "h-10 w-10 rounded-xl flex items-center justify-center mb-3",
                c.warna,
              )}
            >
              <c.icon className="h-5 w-5" />
            </div>
            <p className="text-xl sm:text-2xl font-bold text-slate-900 truncate">
              {c.value}
            </p>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              {c.label}
            </p>
            {c.sub && (
              <div className="text-[11px] text-slate-500 mt-1">{c.sub}</div>
            )}
          </div>
        ))}
      </div>

      {/* Grafik tren */}
      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-900">
              {pakaiOmzet ? "Omzet" : "Pekerjaan selesai"}{" "}
              {r.periode?.granularitas === "bulan" ? "per bulan" : "per hari"}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Dihitung dari tanggal selesai di {label}.
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
            {[
              { kunci: "jumlah", label: "Jumlah" },
              { kunci: "omzet", label: "Omzet" },
            ].map((m) => (
              <button
                key={m.kunci}
                onClick={() => setModeGrafik(m.kunci)}
                aria-pressed={modeGrafik === m.kunci}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                  modeGrafik === m.kunci
                    ? "bg-white text-primary-700 shadow-sm"
                    : "text-slate-600 hover:text-slate-800",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <GrafikBatang
            data={tren}
            tinggi={200}
            nilai={pakaiOmzet ? (d) => d.omzet || 0 : (d) => d.jumlah || 0}
            formatTooltip={(d) =>
              `${d.label}: ${d.jumlah} pekerjaan, ${formatRupiah(d.omzet)}`
            }
            satuanTotal={pakaiOmzet ? "rupiah" : "pekerjaan"}
            kosong={`Belum ada pekerjaan yang selesai pada ${label}.`}
          />
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Transaksi terbaru -- kondisi sekarang, bukan periode */}
        <div className="lg:col-span-2 card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Transaksi Terbaru</h2>
            <span className="text-xs text-slate-500">8 terakhir masuk</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="px-5 py-3 text-left font-medium">Kode</th>
                  <th className="px-5 py-3 text-left font-medium">Status</th>
                  <th className="px-5 py-3 text-left font-medium">Biaya</th>
                  <th className="px-5 py-3 text-left font-medium">Masuk</th>
                  <th className="px-5 py-3 text-left font-medium">Selesai</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(data?.terbaru || []).map((t) => (
                  <tr
                    key={t.kode || t.id}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-5 py-3 font-mono text-xs font-medium">
                      {t.kode || "—"}
                    </td>
                    <td className="px-5 py-3">
                      <span className={cn(getStatusConfig(t.status).className)}>
                        {getStatusConfig(t.status).label}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-medium">
                      {formatRupiah(t.harga)}
                    </td>
                    <td className="px-5 py-3 text-slate-500 text-xs whitespace-nowrap">
                      {formatDate(t.created_at)}
                    </td>
                    <td className="px-5 py-3 text-slate-500 text-xs whitespace-nowrap">
                      {t.selesai_at ? formatDate(t.selesai_at) : "—"}
                    </td>
                  </tr>
                ))}
                {(data?.terbaru || []).length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-5 py-10 text-center text-slate-400"
                    >
                      Belum ada transaksi.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          {/* Komisi teknisi -- periode berjalan */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-semibold text-slate-900">Komisi Teknisi</h2>
              <span className="text-xs text-slate-500">50% dari harga</span>
            </div>
            <p className="text-xs text-slate-500 mb-4">Per {label}</p>
            <GrafikBatangHorizontal
              data={(r.per_teknisi || []).map((t) => ({
                kunci: t.id,
                nama: t.full_name,
                nilai: t.tech_commission,
                keterangan: `${t.jumlah_pekerjaan} pekerjaan`,
              }))}
              label="Tinggi batang sebanding dengan komisi. Angka di sebelahnya sudah diformat sebagai rupiah."
            />
          </div>

          {/* Stok menipis -- kondisi sekarang */}
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <h2 className="font-semibold text-slate-900">Stok Menipis</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {(data?.stok_menipis || []).map((s) => (
                <div
                  key={s.id}
                  className="px-5 py-3 flex items-center justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {s.nama_item}
                    </p>
                    <p className="text-xs text-slate-500">
                      min. {s.batas_minimum} {s.satuan}
                    </p>
                  </div>
                  <span className="badge bg-rose-100 text-rose-800 whitespace-nowrap ml-3">
                    {s.jumlah} {s.satuan}
                  </span>
                </div>
              ))}
              {(data?.stok_menipis || []).length === 0 && (
                <p className="px-5 py-8 text-center text-sm text-emerald-600">
                  Semua stok aman.
                </p>
              )}
            </div>
          </div>

          {/* Perlu perhatian -- dari fakta deterministik, bukan dari AI */}
          {fakta.pekerjaan_tertahan?.length > 0 && (
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="h-4 w-4 text-amber-500" />
                <h2 className="font-semibold text-slate-900">
                  Pekerjaan Tertahan
                </h2>
              </div>
              <ul className="space-y-1.5">
                {fakta.pekerjaan_tertahan.slice(0, 5).map((t, i) => (
                  <li
                    key={i}
                    className="text-xs text-slate-600 flex justify-between gap-2"
                  >
                    <span className="font-mono truncate">{t.kode}</span>
                    <span className="shrink-0 text-slate-500">
                      {t.status} · {t.umur_hari} hari
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {fakta.stok_kritis?.length > 0 && (
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-3">
                <Package className="h-4 w-4 text-rose-500" />
                <h2 className="font-semibold text-slate-900">
                  Bahan Perlu Dibeli
                </h2>
              </div>
              <ul className="space-y-1.5">
                {fakta.stok_kritis.slice(0, 5).map((s, i) => (
                  <li
                    key={i}
                    className="text-xs text-slate-600 flex justify-between gap-2"
                  >
                    <span className="truncate">{s.nama}</span>
                    <span className="font-semibold shrink-0 text-rose-700">
                      {s.sisa}/{s.minimum} {s.satuan}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Ringkasan + saran (AI) -- narasi saja, tidak ada angka atau grafik */}
      <AnalyticsSummary
        data={ai}
        loading={memuatAi}
        error={errorAi}
        labelPeriode={label}
        onPerbarui={() => muat(true)}
      />
    </div>
  );
}


