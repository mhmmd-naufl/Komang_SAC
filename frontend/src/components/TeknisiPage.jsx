import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Package,
  CheckCircle2,
  AlertTriangle,
  Filter,
  Camera,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Clock,
} from "lucide-react";
import { transactionsApi, stockApi, shoesApi } from "../services/api";
import { useAuth } from "../contexts/AuthContext";
import { getStatusConfig, formatDateTime, cn } from "../utils/helpers";

/**
 * Halaman Teknisi.
 *
 * ATURAN YANG TIDAK BOLEH DILANGGAR: angka komisi dan rasio profit TIDAK
 * pernah tampil di halaman ini. Backend juga tidak mengirim field harga ke
 * teknisi (lihat main.py, endpoint GET /api/transaksi).
 *
 * Yang boleh teknisi lakukan:
 *   - Lihat pekerjaan yang ditugaskan ke dirinya (backend membatasi ini).
 *   - Ambil pekerjaan yang belum ada teknisi.
 *   - Ubah status + catat cacat bawaan.
 *   - Unggah foto sebelum & sesudah (Storage belum diimplementasikan).
 *   - Catat pemakaian bahan dari stok.
 */

const URUTAN = ["Diterima", "Diproses", "Diperiksa", "Selesai", "Siap diambil"];
const BUTUH_FOTO_SETELAH = ["Selesai", "Siap diambil"];

const STATUS_TERSEDIA = [
  "Diterima",
  "Diproses",
  "Diperiksa",
  "Selesai",
  "Siap diambil",
];

function FilterStatus({ value, onChange, hitung, tersedia }) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => onChange("semua")}
        className={cn(
          "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border",
          value === "semua"
            ? "bg-primary-600 text-white border-primary-600"
            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
        )}
      >
        Semua <span className="opacity-70">({hitung.semua})</span>
      </button>
      <button
        onClick={() => onChange("tersedia")}
        className={cn(
          "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border",
          value === "tersedia"
            ? "bg-emerald-600 text-white border-emerald-600"
            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
        )}
      >
        Bisa Diambil <span className="opacity-70">({tersedia.length})</span>
      </button>
      {STATUS_TERSEDIA.map((s) => {
        const cfg = getStatusConfig(s);
        const aktif = value === s;
        return (
          <button
            key={s}
            onClick={() => onChange(aktif ? "semua" : s)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border",
              aktif
                ? cn(cfg.className, "ring-2 ring-offset-1 ring-primary-300")
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
            )}
          >
            {cfg.label} <span className="opacity-70">({hitung[s] || 0})</span>
          </button>
        );
      })}
    </div>
  );
}

export default function TeknisiPage() {
  const { user } = useAuth();
  const [transaksi, setTransaksi] = useState([]);
  const [tersedia, setTersedia] = useState([]);
  const [stok, setStok] = useState([]);
  const [katalog, setKatalog] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("semua");
  const [terbuka, setTerbuka] = useState({});
  const [sibuk, setSibuk] = useState(null);
  const [pesan, setPesan] = useState(null);

  const muat = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // get /api/transaksi hanya mengembalikan shoe_id, bukan nama sepatu.
      // Jadi katalog diambil terpisah lalu dipetakan ke id.
      const [trx, siap, stk, sh] = await Promise.all([
        transactionsApi.list(),
        transactionsApi.available(),
        stockApi.list(),
        shoesApi.list(),
      ]);
      setTransaksi(trx.data || []);
      setTersedia(siap.data || []);
      setStok(stk.data || []);
      setKatalog(Object.fromEntries((sh.data || []).map((s) => [s.id, s])));
    } catch (err) {
      setError(err?.friendlyMessage || "Gagal memuat data kerjaan.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    muat();
  }, [muat]);

  const hitungStatus = useMemo(() => {
    const out = { semua: transaksi.length };
    transaksi.forEach((t) => {
      out[t.status] = (out[t.status] || 0) + 1;
    });
    return out;
  }, [transaksi]);

  const tampil = useMemo(() => {
    if (filter === "tersedia") return tersedia;
    if (filter === "semua") return transaksi;
    return transaksi.filter((t) => t.status === filter);
  }, [transaksi, tersedia, filter]);

  /** Nama sepatu dari katalog. Kalau katalog belum termuat, tampilkan kode pendek. */
  const namaSepatu = (shoeId) => {
    const s = katalog[shoeId];
    if (!s) return "Sepatu";
    return [s.merk, s.model].filter(Boolean).join(" ") || "Sepatu";
  };

  const treatment = (shoeId) => katalog[shoeId]?.jenis_treatment;

  const ubahStatus = async (trx, statusBaru) => {
    setSibuk(trx.id);
    setPesan(null);
    try {
      const payload = { status: statusBaru };
      const res = await transactionsApi.updateStatus(trx.id, payload);
      setTransaksi((prev) =>
        prev.map((t) => (t.id === trx.id ? { ...t, ...res.data } : t)),
      );
      setPesan({
        ok: true,
        teks: `Status diubah ke ${getStatusConfig(statusBaru).label}.`,
      });
    } catch (err) {
      setPesan({
        ok: false,
        teks: err?.friendlyMessage || "Gagal mengubah status.",
      });
    } finally {
      setSibuk(null);
    }
  };

  const klaimPekerjaan = async (trx) => {
    setSibuk(trx.id);
    setPesan(null);
    try {
      await transactionsApi.claim(trx.id);
      setPesan({ ok: true, teks: `Pekerjaan ${trx.kode} berhasil diambil.` });
      await muat();
    } catch (err) {
      setPesan({
        ok: false,
        teks: err?.friendlyMessage || "Gagal mengambil pekerjaan ini.",
      });
    } finally {
      setSibuk(null);
    }
  };

  const kurangiStok = async (item) => {
    setSibuk(item.id);
    setPesan(null);
    try {
      await stockApi.reduce(item.id, 1);
      setPesan({
        ok: true,
        teks: `${item.nama_item} dikurangi 1 ${item.satuan}.`,
      });
      await muat();
    } catch (err) {
      setPesan({
        ok: false,
        teks: err?.friendlyMessage || "Gagal mengurangi stok.",
      });
    } finally {
      setSibuk(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Kepala */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Halo, {user?.full_name?.split(" ")[0]}
        </h1>
        <p className="text-slate-500 mt-1">
          Daftar pekerjaan yang sedang kamu tangani.
        </p>
      </div>

      {pesan && (
        <div
          className={cn(
            "flex items-start gap-2 p-3 rounded-xl text-sm border",
            pesan.ok
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-700",
          )}
        >
          {pesan.ok ? (
            <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          )}
          <span>{pesan.teks}</span>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div>
            <p>{error}</p>
            <button
              onClick={muat}
              className="text-xs font-semibold underline mt-1"
            >
              Coba lagi
            </button>
          </div>
        </div>
      )}

      {/* Ringkasan */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: "Semua pekerjaan",
            nilai: transaksi.length,
            warna: "bg-primary-50 text-primary-600",
          },
          {
            label: "Diterima",
            nilai: hitungStatus.Diterima || 0,
            warna: "bg-blue-50 text-blue-600",
          },
          {
            label: "Sedang dikerjakan",
            nilai: (hitungStatus.Diproses || 0) + (hitungStatus.Diperiksa || 0),
            warna: "bg-amber-50 text-amber-600",
          },
          {
            label: "Selesai",
            nilai: hitungStatus.Selesai || 0,
            warna: "bg-emerald-50 text-emerald-600",
          },
        ].map((k) => (
          <div key={k.label} className="card p-4">
            <div className="flex items-center gap-2">
              <span className={cn("h-2 w-2 rounded-full", k.warna)} />
              <span className="text-xs font-medium text-slate-500">
                {k.label}
              </span>
            </div>
            <p className="mt-1.5 text-2xl font-bold text-slate-900">
              {loading ? "—" : k.nilai}
            </p>
          </div>
        ))}
      </div>

      {/* Daftar pekerjaan */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-bold text-slate-900">Pekerjaan Saya</h2>
          <FilterStatus
            value={filter}
            onChange={setFilter}
            hitung={hitungStatus}
            tersedia={tersedia}
          />
        </div>

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="card p-5 animate-pulse">
                <div className="h-4 w-40 rounded bg-slate-100" />
                <div className="h-3 w-64 rounded bg-slate-100 mt-3" />
              </div>
            ))}
          </div>
        ) : tampil.length === 0 ? (
          <div className="card p-10 text-center">
            <Filter className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600">
              {filter === "tersedia"
                ? "Tidak ada pekerjaan yang tersedia untuk diambil saat ini."
                : filter === "semua"
                  ? "Belum ada pekerjaan yang ditugaskan ke kamu."
                  : `Tidak ada pekerjaan dengan status "${getStatusConfig(filter).label}".`}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {tampil.map((trx) => {
              const cfg = getStatusConfig(trx.status);
              const isOpen = !!terbuka[trx.id];
              const idx = URUTAN.indexOf(trx.status);
              const next =
                idx >= 0 && idx < URUTAN.length - 1 ? URUTAN[idx + 1] : null;
              // Foto setelah WAJIB sebelum Selesai/Siap diambil -- aturan backend.
              const butuhFoto =
                next && BUTUH_FOTO_SETELAH.includes(next) && !trx.photo_after;

              return (
                <div key={trx.id} className="card overflow-hidden">
                  <button
                    onClick={() =>
                      setTerbuka((p) => ({ ...p, [trx.id]: !p[trx.id] }))
                    }
                    className="w-full p-5 text-left flex items-start justify-between gap-4 hover:bg-slate-50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-slate-900">
                          {trx.kode}
                        </span>
                        <span className={cfg.className}>{cfg.label}</span>
                      </div>
                      <p className="text-sm text-slate-600 mt-1.5">
                        {namaSepatu(trx.shoe_id)}
                        {treatment(trx.shoe_id) && (
                          <span className="text-slate-400">
                            {" "}
                            · {treatment(trx.shoe_id)}
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Masuk: {formatDateTime(trx.created_at)}
                      </p>
                      {/* Tanggal selesai dicatat backend otomatis saat status diubah
                          ke Selesai -- bukan diisi teknisi, supaya tidak bisa
                          dipalsukan dan selalu cocok dengan kapan status benar-
                          benar berubah. */}
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Selesai:{" "}
                        {trx.selesai_at
                          ? formatDateTime(trx.selesai_at)
                          : "belum"}
                      </p>
                    </div>
                    {isOpen ? (
                      <ChevronUp className="h-5 w-5 text-slate-400 flex-shrink-0" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-slate-400 flex-shrink-0" />
                    )}
                  </button>

                  {isOpen && (
                    <div className="border-t border-slate-100 p-5 bg-slate-50/50">
                      {/* Catatan konsumen -- wajib dibaca, ini yang biasanya
                          jadi bahan klaim dan perdebatan bibit. */}
                      {trx.catatan_konsumen && (
                        <div className="mb-4 p-3 rounded-xl bg-blue-50 border border-blue-100">
                          <p className="text-xs font-semibold text-blue-800 mb-1 flex items-center gap-1.5">
                            <MessageSquare className="h-3.5 w-3.5" />
                            Catatan konsumen
                          </p>
                          <p className="text-sm text-blue-900">
                            {trx.catatan_konsumen}
                          </p>
                        </div>
                      )}

                      {trx.defect_notes && (
                        <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-100">
                          <p className="text-xs font-semibold text-amber-800 mb-1">
                            Cacat yang sudah kamu catat
                          </p>
                          <p className="text-sm text-amber-900">
                            {trx.defect_notes}
                          </p>
                        </div>
                      )}

                      {/* Foto -- belum ada Storage, jadi placeholder */}
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className="p-3 rounded-xl bg-white border border-dashed border-slate-200 text-center">
                          <Camera className="h-5 w-5 text-slate-300 mx-auto mb-1" />
                          <p className="text-[11px] text-slate-500">
                            Foto sebelum
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {trx.photo_before ? "Tersimpan" : "Belum ada"}
                          </p>
                        </div>
                        <div
                          className={cn(
                            "p-3 rounded-xl text-center border border-dashed",
                            trx.photo_after
                              ? "bg-white border-slate-200"
                              : "bg-rose-50 border-rose-200",
                          )}
                        >
                          <Camera
                            className={cn(
                              "h-5 w-5 mx-auto mb-1",
                              trx.photo_after
                                ? "text-slate-300"
                                : "text-rose-400",
                            )}
                          />
                          <p className="text-[11px] text-slate-500">
                            Foto sesudah
                          </p>
                          <p className="text-[10px] text-rose-500 mt-0.5 font-medium">
                            {trx.photo_after
                              ? "Tersimpan"
                              : "WAJIB sebelum Selesai"}
                          </p>
                        </div>
                      </div>

                      {/* Advance status */}
                      {filter === "tersedia" ? (
                        <div>
                          <p className="text-[11px] text-emerald-700 mb-2">
                            Pekerjaan ini masih tersedia dan siap diambil
                            teknisi.
                          </p>
                          <button
                            onClick={() => klaimPekerjaan(trx)}
                            disabled={sibuk === trx.id}
                            className="btn-primary w-full"
                          >
                            {sibuk === trx.id ? (
                              <span className="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full" />
                            ) : (
                              "Ambil pekerjaan"
                            )}
                          </button>
                        </div>
                      ) : (
                        next && (
                          <div>
                            {butuhFoto && (
                              <p className="text-[11px] text-rose-600 mb-2 flex items-center gap-1.5">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                Foto sesudah belum ada, jadi belum bisa lanjut
                                ke {getStatusConfig(next).label}.
                              </p>
                            )}
                            {next === "Selesai" && (
                              <p className="text-[11px] text-slate-500 mb-2">
                                Saat status diubah ke Selesai, backend mencatat
                                tanggal selesai otomatis. Tanggal itu yang
                                dipakai untuk laporan omzet per bulan/tahun.
                              </p>
                            )}
                            <button
                              onClick={() => ubahStatus(trx, next)}
                              disabled={sibuk === trx.id || butuhFoto}
                              className="btn-primary w-full"
                            >
                              {sibuk === trx.id ? (
                                <span className="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full" />
                              ) : (
                                <>Lanjut ke {getStatusConfig(next).label}</>
                              )}
                            </button>
                          </div>
                        )
                      )}

                      {trx.status === "Siap diambil" && (
                        <p className="text-center text-xs text-emerald-700 flex items-center justify-center gap-1.5 py-2">
                          <CheckCircle2 className="h-4 w-4" />
                          Pekerjaan selesai. Menunggu diambil di outlet.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Stok bahan */}
      <div>
        <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
          <Package className="h-5 w-5 text-primary-600" />
          Catat Pemakaian Bahan
        </h2>
        <p className="text-xs text-slate-500 mb-3">
          Tekan tombol saat memakai 1 {stok[0]?.satuan || "unit"}. Sisa bahan
          ikut terpotong di dashboard admin.
        </p>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {stok.map((item) => {
            const menipis = item.jumlah <= item.batas_minimum;
            return (
              <div
                key={item.id}
                className={cn(
                  "card p-4 flex items-center justify-between gap-3",
                  menipis && "border-rose-200 bg-rose-50/40",
                )}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {item.nama_item}
                  </p>
                  <p
                    className={cn(
                      "text-xs mt-0.5",
                      menipis ? "text-rose-600" : "text-slate-500",
                    )}
                  >
                    Sisa <span className="font-semibold">{item.jumlah}</span>{" "}
                    {item.satuan}
                    {menipis && ` (min ${item.batas_minimum})`}
                  </p>
                </div>
                <button
                  onClick={() => kurangiStok(item)}
                  disabled={sibuk === item.id || item.jumlah <= 0}
                  className="btn-secondary px-3 py-1.5 text-xs flex-shrink-0"
                >
                  Pakai 1
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Catatan kaki */}
      <div className="flex items-start gap-2 p-3 rounded-xl bg-slate-100 text-xs text-slate-600">
        <Clock className="h-4 w-4 flex-shrink-0 mt-0.5 text-slate-400" />
        <p>
          Kolom harga dan komisi sengaja tidak ditampilkan di halaman ini. Kalau
          ada yang perlu ditanyakan soal bayaran, ajukan ke admin.
        </p>
      </div>
    </div>
  );
}
