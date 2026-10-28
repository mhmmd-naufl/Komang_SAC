import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  Check,
  Loader2,
  SkipForward,
  UserCog,
} from "lucide-react";
import { transactionsApi } from "../../services/api";
import { toast } from "../Toast";
import { Field } from "../AdminUi";
import { cn, getStatusConfig } from "../../utils/helpers";

const STATUS_FLOW = [
  "Diterima",
  "Diproses",
  "Diperiksa",
  "Selesai",
  "Siap diambil",
];

export default function PanelProsesAdmin({
  transaksi,
  teknisiList,
  adminId,
  onTersimpan,
}) {
  const [statusBaru, setStatusBaru] = useState(transaksi.status);
  const [techId, setTechId] = useState(transaksi.tech?.id || "");
  const [catatan, setCatatan] = useState("");
  const [fotoBefore, setFotoBefore] = useState(null);
  const [fotoAfter, setFotoAfter] = useState(null);
  const [simpan, setSimpan] = useState(false);
  const [konfirmasiLompat, setKonfirmasiLompat] = useState(false);

  const t = transaksi;
  const idxSaatIni = STATUS_FLOW.indexOf(t.status);
  const idxTarget = STATUS_FLOW.indexOf(statusBaru);

  if (t.status === "Siap diambil") return null;

  // Upload foto menggunakan transactionsApi (token otomatis terpasang via Axios interceptor)
  const uploadFoto = async (file, jenis) => {
    if (!file) return;
    // transactionsApi.uploadPhoto(id, jenis, file)
    await transactionsApi.uploadPhoto(t.id, jenis, file);
  };

  const prosesUpdate = async (statusTarget) => {
    setSimpan(true);
    try {
      // 1. Upload foto jika ada
      if (fotoBefore) await uploadFoto(fotoBefore, "before");
      if (fotoAfter) await uploadFoto(fotoAfter, "after");

      // 2. Siapkan payload untuk update status
      // Backend TransactionStatusUpdate menerima defect_notes
      const catatanLama = t.defect_notes || "";
      const catatanBaru = catatan.trim()
        ? catatanLama
          ? `${catatanLama}\n[Admin] ${catatan.trim()}`
          : `[Admin] ${catatan.trim()}`
        : catatanLama;

      const payload = {
        status: statusTarget,
        tech_id: techId || undefined,
        defect_notes: catatanBaru || undefined,
      };

      // 3. Panggil API (Token 'komang_sac_token' otomatis terpasang di sini)
      await transactionsApi.updateStatus(t.id, payload);

      toast.success(
        "Status diperbarui",
        `Transaksi ${t.kode} sekarang ${statusTarget}`,
      );

      // Panggil callback untuk refresh data di parent
      try {
        const { data: trxBaru } = await transactionsApi.get(t.id);
        if (onTersimpan) onTersimpan(trxBaru);
      } catch (e) {
        console.error("Refresh setelah update gagal:", e);
      }

      // Reset form
      setFotoBefore(null);
      setFotoAfter(null);
      setCatatan("");
      setStatusBaru(statusTarget);
    } catch (err) {
      console.error("prosesUpdate gagal:", err);
      // Axios interceptor sudah mengubah error menjadi friendlyMessage
      const pesanError =
        err.friendlyMessage ||
        err.response?.data?.detail ||
        "Gagal memperbarui status";
      toast.error("Gagal memperbarui", pesanError);
    } finally {
      setSimpan(false);
      setKonfirmasiLompat(false);
    }
  };

  const simpanFoto = async () => {
    if (!fotoBefore && !fotoAfter) return;
    setSimpan(true);
    try {
      if (fotoBefore) await uploadFoto(fotoBefore, "before");
      if (fotoAfter) await uploadFoto(fotoAfter, "after");
      toast.success("Foto tersimpan", "Foto berhasil diunggah.");
      const { data: trxBaru } = await transactionsApi.get(t.id);
      if (onTersimpan) onTersimpan(trxBaru);
      setFotoBefore(null);
      setFotoAfter(null);
    } catch (err) {
      console.error("simpanFoto gagal:", err);
      toast.error("Gagal menyimpan foto", err.friendlyMessage || err.message);
    } finally {
      setSimpan(false);
    }
  };

  const handleLanjut = (targetStatus) => {
    setStatusBaru(targetStatus);
    const targetIdx = STATUS_FLOW.indexOf(targetStatus);
    if (targetIdx > idxSaatIni + 1) {
      setKonfirmasiLompat(true);
    } else {
      prosesUpdate(targetStatus);
    }
  };

  const cfgSaatIni = getStatusConfig(t.status);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 rounded-xl bg-primary-50 px-4 py-3">
        <UserCog className="h-5 w-5 text-primary-600" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-primary-900">
            Proses Transaksi (Admin)
          </p>
          <p className="text-xs text-primary-700 mt-0.5">
            Status saat ini:{" "}
            <span className={cfgSaatIni.className}>{t.status}</span>
          </p>
        </div>
      </div>

      {/* Status Flow Visual */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-xs font-medium text-slate-600 mb-3">Alur Status</p>
        <div className="flex items-center justify-between gap-2 overflow-x-auto pb-2">
          {STATUS_FLOW.map((status, idx) => {
            const isPast = idx < idxSaatIni;
            const isCurrent = idx === idxSaatIni;
            const isFuture = idx > idxSaatIni;
            const isTarget = idx === idxTarget;

            return (
              <div
                key={status}
                className="flex flex-col items-center flex-1 min-w-[70px]"
              >
                <div
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all",
                    isPast && "bg-green-100 border-green-500 text-green-700",
                    isCurrent && "bg-primary-600 border-primary-600 text-white",
                    isFuture &&
                      !isTarget &&
                      "bg-slate-50 border-slate-300 text-slate-400",
                    isTarget &&
                      !isCurrent &&
                      "bg-amber-100 border-amber-500 text-amber-700",
                  )}
                >
                  {isPast ? <Check className="h-4 w-4" /> : idx + 1}
                </div>
                <span
                  className={cn(
                    "text-[10px] mt-1.5 text-center leading-tight",
                    isCurrent && "font-semibold text-primary-700",
                    isTarget && !isCurrent && "font-semibold text-amber-700",
                    !isCurrent && !isTarget && "text-slate-500",
                  )}
                >
                  {status}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Form Kontrol */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Assign Teknisi">
          <select
            value={techId}
            onChange={(e) => setTechId(e.target.value)}
            className="input"
          >
            <option value="">-- Belum Ditugaskan --</option>
            {adminId && (
              <option value={adminId}>
                Admin mengerjakan sendiri (komisi 0)
              </option>
            )}
            {teknisiList.map((tech) => (
              <option key={tech.id} value={tech.id}>
                {tech.full_name}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Catatan Internal Admin"
          hint="Tercatat di defect_notes dengan prefix [Admin]"
        >
          <textarea
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            rows={2}
            className="input"
            placeholder="Contoh: Noda membandel, butuh waktu ekstra..."
          />
        </Field>
      </div>

      {/* Upload Foto */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="label mb-1">
            Foto Sebelum {t.photo_before && "(sudah ada)"}
          </p>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setFotoBefore(e.target.files[0])}
            className="w-full text-sm text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
          />
          {fotoBefore && (
            <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
              <Check className="h-3 w-3" /> {fotoBefore.name}
            </p>
          )}
        </div>

        <div>
          <p className="label mb-1">
            📸 Foto Sesudah {t.photo_after && "(sudah ada)"}
          </p>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setFotoAfter(e.target.files[0])}
            className="w-full text-sm text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
          />
          {fotoAfter && (
            <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
              <Check className="h-3 w-3" /> {fotoAfter.name}
            </p>
          )}
        </div>
      </div>

      {/* Tombol Aksi */}
      <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-100">
        {(fotoBefore || fotoAfter) && (
          <button
            onClick={simpanFoto}
            disabled={simpan}
            className="btn-secondary text-sm px-3 py-2 flex items-center gap-1.5"
          >
            <Camera className="h-4 w-4" />
            Simpan Foto
          </button>
        )}

        {idxSaatIni < STATUS_FLOW.length - 1 && (
          <button
            onClick={() => handleLanjut(STATUS_FLOW[idxSaatIni + 1])}
            disabled={simpan}
            className="btn-primary text-sm px-3 py-2 flex items-center gap-1.5"
          >
            {simpan ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowRight className="h-4 w-4" />
            )}
            Lanjut ke {STATUS_FLOW[idxSaatIni + 1]}
          </button>
        )}

        {idxSaatIni < STATUS_FLOW.length - 2 && (
          <button
            onClick={() => handleLanjut("Selesai")}
            disabled={simpan}
            className="btn-secondary text-sm px-3 py-2 flex items-center gap-1.5 text-amber-700 border-amber-300 hover:bg-amber-50"
          >
            <SkipForward className="h-4 w-4" />
            Langsung ke Selesai
          </button>
        )}
      </div>

      {/* Modal Konfirmasi Lompat Status */}
      {konfirmasiLompat && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-base font-semibold text-slate-900">
                  Konfirmasi Lompat Status
                </h4>
                <p className="text-sm text-slate-600 mt-1">
                  Anda akan mengubah status dari{" "}
                  <span className="font-medium">{t.status}</span> langsung ke{" "}
                  <span className="font-medium text-amber-700">
                    {statusBaru}
                  </span>
                  . Pastikan semua langkah di antaranya sudah terpenuhi.
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setKonfirmasiLompat(false);
                  setStatusBaru(t.status);
                }}
                className="btn-secondary text-sm px-3 py-2"
              >
                Batal
              </button>
              <button
                onClick={() => prosesUpdate(statusBaru)}
                disabled={simpan}
                className="btn-primary text-sm px-3 py-2"
              >
                {simpan ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Ya, Lanjutkan"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
