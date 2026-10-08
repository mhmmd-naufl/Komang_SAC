"""
Analytics + ringkasan AI untuk dashboard admin.

PEMBAGIAN TUGAS YANG DISEPAKATI
-------------------------------
AI HANYA untuk dua hal: RINGKASAN dan SARAN. Itu saja.

Semua angka, grafik, dan tabel dihitung di file ini dari angka mentah --
tidak pernah lewat model. Alasannya:

  1. Angka dari LLM bisa berbeda antara dua pemanggilan untuk data yang sama,
     jadi dashboard yang "berubah sendiri" saat di-refresh tidak bisa dipercaya
     untuk menghitung bayar teknisi.
  2. Model gratis bisa lambat atau mati sewaktu-waktu. Kalau grafik ikut
     bergantung padanya, seluruh dashboard ikut mati.
  3. Batas token. Meminta model menulis JSON angka ratusan baris prone
     ke hallucination di setiap digit.

Jadi alurnya: `gather_facts` menghitung semuanya secara deterministik, lalu
`openrouter` HANYA membaca angka-angka itu dan menulis narasi + saran. Kalau
OpenRouter gagal, `rule_based` menulis versi yang sama dari perhitungan lokal.

PEMBAGIAN PERIODE
-------------------
Semua omzet dihitung dari `transactions.selesai_at` (tanggal teknisi menandai
Selesai), bukan `created_at`. Cucian yang masuk tanggal 31 dan selesai tanggal 2
adalah hasil bulan 2. Bucket harian/bulanan dihitung di zona WIB supaya transaksi
lewat tengah malam tidak masuk tanggal yang salah.

Catatan privasi: yang dikirim ke OpenRouter hanya angka agregat. Kode transaksi,
nomor telepon, dan nama orang tidak pernah ikut. Endpoint-nya admin-only.
"""

import os
import re
import json
import time
import urllib.request
import urllib.error
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

# Model gratis. Urutan dicoba dari kiri ke kanan; kalau model pertama habis
# kuota (429) atau dihapus dari katalog (404), yang berikutnya dipakai.
# Atur lewat .env:
#   OPENROUTER_MODELS -> daftar fallback, dipisah koma (prioritas utama).
#   OPENROUTER_MODEL  -> satu model saja (kompatibel dengan .env lama).
#
# Catatan hasil uji (Oktober 2026, daftar /models OpenRouter):
#   nvidia/nemotron-3-super-120b-a12b:free  -> dipakai. Cepat (~6 dtk),
#       Bahasa Indonesia enak, tidak bocorkan proses berpikir.
#   nvidia/nemotron-3.5-lightning:free      -> WORKS tapi emit "thinking
#       process" ke dalam jawaban, jadi perlu _buang_pemikiran().
#   nvidia/nemotron-3-ultra-550b-a55b:free  -> WORKS, konteks besar.
#   google/gemma-4-31b-it:free              -> sering 429 (rate limited).
#   google/gemma-4-26b-a4b-it:free          -> alternatif Gemma, lebih jarang 429.
#   thinkingmachines/inkling:free           -> 403, hanya untuk agentic harness.
DEFAULT_MODEL = "nvidia/nemotron-3-super-120b-a12b:free"

# Cadangan bawaan kalau .env tidak menyebut OPENROUTER_MODELS sama sekali.
DEFAULT_FALLBACK_MODELS = [
    DEFAULT_MODEL,
    "nvidia/nemotron-3.5-lightning:free",
    "nvidia/nemotron-3-ultra-550b-a55b:free",
    "google/gemma-4-31b-it:free",
    "google/gemma-4-26b-a4b-it:free",
]


def _daftar_model() -> list[str]:
    """
    Daftar model yang dicoba berurutan sampai ada yang berhasil. Sumber:
      1. OPENROUTER_MODELS (dipisah koma) -- daftar fallback lengkap.
      2. OPENROUTER_MODEL  -- satu model, kompatibel dengan .env lama.
      3. DEFAULT_FALLBACK_MODELS.
    Model duplikat dibuang, urutan tetap dipertahankan.
    """
    mentah = os.getenv("OPENROUTER_MODELS", "").strip()
    if mentah:
        daftar = [m.strip() for m in mentah.split(",") if m.strip()]
    else:
        satu = os.getenv("OPENROUTER_MODEL", "").strip()
        daftar = [satu] if satu else list(DEFAULT_FALLBACK_MODELS)
    unik: list[str] = []
    for m in daftar:
        if m not in unik:
            unik.append(m)
    return unik

STATUS_TAHAP = ["Diterima", "Diproses", "Diperiksa", "Selesai", "Siap diambil"]
STATUS_FINAL = {"Selesai", "Siap diambil"}
STATUS_AWAL = ["Diterima", "Diproses", "Diperiksa"]

# Waktu Indonesia. Bucket harian/bulanan dihitung di zona ini; kalau pakai UTC
# langsung, transaksi yang selesai jam 01:00 WIB masuk ke tanggal sebelumnya.
ZONA_WIB = timezone(timedelta(hours=7))

NAMA_BULAN = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
]
NAMA_BULAN_SINGKAT = [
    "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
    "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
]

TIMEOUT_DETIK = 45.0
MAX_TOKENS = 1400

# Beberapa model gratis sempat menampilkan proses berpikir di depan
# jawaban. Potong supaya dashboard tidak menampilkan "Here's a thinking
# process" ke user.
_PIKIR = re.compile(
    r"^\s*(here'?s\s+(is\s+)?(a\s+)?thinking\s+process|thinking\s+process|"
    r"analisis\s+proses\s+berpikir|process\s+thinking)\s*:?.*?(\n\s*\n|\Z)",
    re.IGNORECASE | re.DOTALL,
)


def _buang_pemikiran(teks: str) -> str:
    """Buang blok 'thinking process' kalau model menampakkannya."""
    return _PIKIR.sub("", teks, count=1).strip()


def _dengan_retry(fn, max_retry=3, base_delay=0.5):
    """
    Jalankan fungsi Supabase query dengan retry otomatis.
    
    Free tier Supabase connection pooling agresif - koneksi putus kalau idle.
    Retry dengan exponential backoff (0.5s, 1s, 2s).
    """
    last_err = None
    for attempt in range(max_retry):
        try:
            return fn()
        except Exception as e:
            last_err = e
            err_str = str(e).lower()
            # Hanya retry kalau error koneksi (disconnect, timeout, pool)
            if any(k in err_str for k in ("disconnect", "timeout", "pool", "connection", "remote protocol")):
                if attempt < max_retry - 1:
                    time.sleep(base_delay * (2 ** attempt))
                    continue
            raise
    raise last_err


# ==========================================
# 1. KUMPULKAN FAKTA (SELALU DETERMINISTIK)
# ==========================================


def _parse_iso(value: Optional[str]) -> Optional[datetime]:
    """
    Parse timestamp PostgREST. Selalu dikembalikan sebagai aware-UTC.

    Penting: baris yang diseed lama punya created_at TANPA offset
    (2026-10-06T01:35:44.71129), sedangkan baris dari aplikasi punya +00:00.
    Campur dua bentuk itu akan memicu TypeError saat perbandingan, jadi
    timestamp telanjang dianggap UTC.
    """
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def _ke_wib(value: Optional[str]) -> Optional[datetime]:
    """Parse timestamp lalu ubah ke zona WIB. None kalau tidak bisa diparse."""
    dt = _parse_iso(value)
    return dt.astimezone(ZONA_WIB) if dt else None


def _dalam_periode(
    nilai: Optional[str],
    mulai: Optional[datetime],
    selesai: Optional[datetime],
) -> bool:
    """
    Apakah timestamp ini berada di dalam [mulai, selesai).

    Tanpa batas bawah (mulai=None) semua baris ikut, dipakai untuk periode
    "semua".
    """
    dt = _ke_wib(nilai)
    if dt is None:
        return False
    if mulai is not None and dt < mulai:
        return False
    if selesai is not None and dt >= selesai:
        return False
    return True


def _rentang(
    rows: list[dict],
    mulai: Optional[datetime],
    selesai: Optional[datetime],
    kolom: str,
) -> list[dict]:
    """Baris dengan mulai <= <kolom> < selesai. Keduanya boleh None (tanpa batas)."""
    return [r for r in rows if _dalam_periode(r.get(kolom), mulai, selesai)]


def _omzet(rows: list[dict]) -> int:
    return sum(r.get("harga") or 0 for r in rows)


def _growth(sekarang: list[dict], lalu: list[dict]) -> Optional[float]:
    """Perubahan persen omzet. None kalau periode pembanding 0 (tidak bisa dihitung)."""
    a, b = _omzet(sekarang), _omzet(lalu)
    if b == 0:
        return None
    return round((a - b) / b * 100, 1)


def _growth_jumlah(sekarang: list[dict], lalu: list[dict]) -> Optional[float]:
    """
    Perubahan persen JUMLAH pekerjaan (bukan omzet).

    Dipisah dari _growth karena keduanya bisa bergerak berlawanan: omzet bisa
    naik hanya karena satu servis repaint mahal, sementara jumlah cucian justru
    turun. Dashboard admin menampilkan keduanya supaya "omzet naik" tidak
    disimpulkan sebagai "lebih banyak pelanggan" tanpa dicek dulu.

    None kalau periode pembanding kosong -- membagi nol menghasilkan angka yang
    tidak artinya, dan "belum ada pembanding" lebih jujur daripada Infinity%.
    """
    a, b = len(sekarang), len(lalu)
    if b == 0:
        return None
    return round((a - b) / b * 100, 1)


def _ribuan(n: int) -> str:
    """Ringkas untuk narasi: 1500000 -> 'Rp 1,5 juta'."""
    if n >= 1_000_000:
        return f"Rp {n / 1_000_000:.1f} juta"
    if n >= 1_000:
        return f"Rp {n / 1_000:.0f} ribu"
    return f"Rp {n}"


def _persen(n: float) -> str:
    """74.0 -> '74%', 74.5 -> '74,5%'. Kalau persis nol, tulis '0%'."""
    bulat = round(n)
    return f"{bulat}%" if float(bulat) == float(n) else f"{n:g}%"


def _bulat_ke_bulan(dt: datetime, granularitas: str) -> str:
    """Kunci bucket untuk grafik, selalu YYYY-MM-DD atau YYYY-MM."""
    if granularitas == "hari":
        return dt.date().isoformat()
    return f"{dt.year:04d}-{dt.month:02d}"


def _label_bucket(kunci: str, granularitas: str) -> str:
    """Label yang enak dibaca buat sumbu grafik: '2026-10-06' -> '6 Okt'."""
    try:
        if granularitas == "hari":
            tgl = datetime.strptime(kunci, "%Y-%m-%d")
            return f"{tgl.day} {NAMA_BULAN_SINGKAT[tgl.month - 1]}"
        thn, bln = kunci.split("-")
        return f"{NAMA_BULAN_SINGKAT[int(bln) - 1]} {thn[2:]}"
    except (ValueError, IndexError):
        return kunci


def _buat_bucket(
    mulai: Optional[datetime],
    selesai: Optional[datetime],
    granularitas: str,
    per_hari: dict[str, dict[str, int]],
) -> list[dict]:
    """
    Deret grafik dengan semua bucket terisi, termasuk yang kosong.

    Slot kosong harus ada: kalau hanya bucket yang punya transaksi yang
    dikirim, sumbu-x menumpuk tanggal dan grafik terlihat miring (mis. 1 Okt
    lalu langsung 5 Okt) sehingga admin menyimpulkan ada hari tanpa transaksi.
    """
    if granularitas == "hari":
        # Periodenya satu bulan. Bucket harian dibatasi 31 baris, tidak perlu
        # iterasi per detik.
        if mulai is None or selesai is None:
            kunci_urut = sorted(per_hari.keys())
            return [
                {
                    "kunci": k,
                    "label": _label_bucket(k, "hari"),
                    "jumlah": per_hari[k]["jumlah"],
                    "omzet": per_hari[k]["omzet"],
                }
                for k in kunci_urut
            ]
        hasil = []
        d = mulai
        while d < selesai:
            k = d.date().isoformat()
            sel = per_hari.get(k, {"jumlah": 0, "omzet": 0})
            hasil.append({
                "kunci": k,
                "label": _label_bucket(k, "hari"),
                "jumlah": sel["jumlah"],
                "omzet": sel["omzet"],
            })
            d += timedelta(days=1)
        return hasil

    # Granularitas bulan: satu tahun = 12 bucket, atau seluruh riwayat.
    if mulai is None:
        kunci_urut = sorted(per_hari.keys())
        return [
            {
                "kunci": k,
                "label": _label_bucket(k, "bulan"),
                "jumlah": per_hari[k]["jumlah"],
                "omzet": per_hari[k]["omzet"],
            }
            for k in kunci_urut
        ]

    hasil = []
    thn, bln = mulai.year, mulai.month
    akhir = selesai  # eksklusif
    while True:
        k = f"{thn:04d}-{bln:02d}"
        if k >= _bulat_akhir(akhir):
            break
        sel = per_hari.get(k, {"jumlah": 0, "omzet": 0})
        hasil.append({
            "kunci": k,
            "label": _label_bucket(k, "bulan"),
            "jumlah": sel["jumlah"],
            "omzet": sel["omzet"],
        })
        bln += 1
        if bln > 12:
            bln = 1
            thn += 1
    return hasil


def _bulat_akhir(dt: datetime) -> str:
    """Kunci YYYY-MM dari sebuah batas atas eksklusif."""
    return f"{dt.year:04d}-{dt.month:02d}"


def _selesai_ke_periode(dt: datetime, granularitas: str) -> str:
    """Kunci bucket dari satu timestamp selesai (sudah di zona WIB)."""
    return _bulat_ke_bulan(dt, granularitas)


def gather_facts(
    supabase,
    mulai: Optional[datetime] = None,
    selesai: Optional[datetime] = None,
    granularitas: str = "hari",
    label_periode: str = "Semua waktu",
) -> dict[str, Any]:
    """
    Hitung semua angka yang dibutuhkan ringkasan dan grafik.

    Fungsi ini TIDAK pernah memanggil AI. Keluarannya deterministik: dipanggil
    dua kali dengan data yang sama selalu menghasilkan angka yang sama. Itu
    yang membuat grafik dan tabel di dashboard bisa dipercaya, sementara
    narasi AI tetap boleh berubah-ubah kata.

    Parameter `mulai`/`selesai` sudah dalam zona WIB. Kalau keduanya None,
    periode dianggap "semua" dan grafik memakai bucket bulanan.
    """
    now = datetime.now(timezone.utc)
    minggu_lalu = now - timedelta(days=7)
    bulan_lalu = now - timedelta(days=30)

    # ---------- transaksi ----------
    # `selesai_at` ikut diambil karena seluruh laporan omzet memakainya.
    transaksi = _dengan_retry(lambda: (
        supabase.from_("transactions")
        .select(
            "id, kode, shoe_id, harga, tech_id, status, created_at, selesai_at, "
            "tech_commission, photo_after, catatan_konsumen, defect_notes"
        )
        .execute().data or []
    ))
    sepatu = _dengan_retry(lambda: (
        supabase.from_("shoes")
        .select("id, merk, model")
        .execute().data or []
    ))
    teknisi = _dengan_retry(lambda: (
        supabase.from_("profiles").select("id, full_name").eq("role", "technician").execute().data or []
    ))
    pelanggan = _dengan_retry(lambda: (
        supabase.from_("profiles").select("id").eq("role", "customer").execute().data or []
    ))
    bahan = _dengan_retry(lambda: (
        supabase.from_("stock")
        .select("nama_item, jumlah, satuan, batas_minimum")
        .execute().data or []
    ))
    titik = _dengan_retry(lambda: (
        supabase.from_("drop_points").select("nama, aktif").execute().data or []
    ))
    # Hanya agregat yang dipakai. `keterangan` sengaja TIDAK diambil: isinya
    # catatan bebas yang bisa memuat nama orang, dan tidak boleh ikut ke AI.
    pengeluaran = _dengan_retry(lambda: (
        supabase.from_("expenses").select("kategori, jumlah, tanggal").execute().data or []
    ))

    harga_by_id = {s["id"]: s for s in sepatu}
    nama_teknisi = {t["id"]: t["full_name"] for t in teknisi}

    # ---------- agregasi per transaksi ----------
    per_status: dict[str, int] = {s: 0 for s in STATUS_TAHAP}
    per_bucket: dict[str, dict[str, int]] = {}
    foto_terisi = 0
    catatan_konsumen = 0
    catatan_cacat = 0
    pekerjaan_teknisi: dict[str, int] = {}
    foto_after_belum = 0

    # Transaksi yang masuk ke periode laporan (selesai di dalam rentang).
    dalam_periode: list[dict] = []

    for r in transaksi:
        status = r.get("status") or ""
        if status in per_status:
            per_status[status] += 1
        if r.get("photo_after"):
            foto_terisi += 1
        else:
            foto_after_belum += 1
        if r.get("catatan_konsumen"):
            catatan_konsumen += 1
        if r.get("defect_notes"):
            catatan_cacat += 1

        tech_id = r.get("tech_id")
        if tech_id:
            pekerjaan_teknisi[tech_id] = pekerjaan_teknisi.get(tech_id, 0) + 1

        # Transaksi lama sering sudah masuk status final (Selesai / Siap diambil)
        # tapi belum punya `selesai_at`; untuk dashboard, fallback ke created_at
        # supaya angka riwayat masih tampil tanpa mengubah arti bisnis.
        selesai_terpakai = r.get("selesai_at") or (
            r.get("created_at") if status in STATUS_FINAL else None
        )
        dt_selesai = _ke_wib(selesai_terpakai)
        if dt_selesai and _dalam_periode(selesai_terpakai, mulai, selesai):
            dalam_periode.append(r)
            kunci = _selesai_ke_periode(dt_selesai, granularitas)
            sel = per_bucket.setdefault(kunci, {"jumlah": 0, "omzet": 0})
            sel["jumlah"] += 1
            sel["omzet"] += r.get("harga") or 0

    # ---------- layanan terlaris dalam periode ----------
    per_layanan: dict[str, int] = {}
    per_layanan_omzet: dict[str, int] = {}
    for r in dalam_periode:
        s = harga_by_id.get(r.get("shoe_id"))
        if not s:
            continue
        lbl = " ".join(x for x in [s.get("merk"), s.get("model")] if x) or "Tanpa nama"
        per_layanan[lbl] = per_layanan.get(lbl, 0) + 1
        per_layanan_omzet[lbl] = per_layanan_omzet.get(lbl, 0) + (r.get("harga") or 0)

    # ---------- pembanding untuk growth ----------
    # Bandingkan periode terpilih dengan periode sepanjang durasi yang sama
    # yang langsung sebelumnya. Ini yang membuat "Omzet naik 12% dibanding
    # periode sebelumnya" bermakna baik untuk bulan maupun untuk tahun.
    pembanding = _periode_sebelumnya(mulai, selesai)
    if pembanding is not None:
        lalu = _rentang(transaksi, pembanding[0], pembanding[1], "selesai_at")
    else:
        lalu = []

    # ---------- pembanding mingguan (dipakai untuk kartu info tambahan) ----------
    seit_7h = _rentang(transaksi, minggu_lalu, now, "selesai_at")
    seit_30h = _rentang(transaksi, bulan_lalu, now, "selesai_at")

    grafik = _buat_bucket(mulai, selesai, granularitas, per_bucket)

    # ---------- stok kritis (selalu "sekarang", bukan periode) ----------
    # Stok tidak punya tanggal, jadi tidak bisa difilter per bulan. Menampilkannya
    # sebagai kondisi saat ini -- bukan kondisi bulan lalu -- memang yang benar.
    kritis = [
        {
            "nama": b.get("nama_item"),
            "sisa": b.get("jumlah") or 0,
            "minimum": b.get("batas_minimum") or 0,
            "satuan": b.get("satuan"),
        }
        for b in bahan
        if (b.get("jumlah") or 0) <= (b.get("batas_minimum") or 0)
    ]
    kritis.sort(key=lambda x: (x["sisa"] - x["minimum"]))

    # ---------- pekerjaan tertahan (antrean, selalu "sekarang") ----------
    tertahan = []
    for r in transaksi:
        if (r.get("status") or "") in STATUS_FINAL:
            continue
        dibuat = _ke_wib(r.get("created_at"))
        if not dibuat:
            continue
        umur = (now - dibuat).days
        if umur >= 2:
            tertahan.append({
                "kode": r.get("kode"),
                "status": r.get("status"),
                "umur_hari": umur,
                "ada_foto": bool(r.get("photo_after")),
            })
    tertahan.sort(key=lambda x: x["umur_hari"], reverse=True)

    terlaris = sorted(per_layanan.items(), key=lambda x: x[1], reverse=True)[:5]
    termahal = sorted(per_layanan_omzet.items(), key=lambda x: x[1], reverse=True)[:5]

    omzet_periode = _omzet(dalam_periode)
    komisi_periode = sum(r.get("tech_commission") or 0 for r in dalam_periode)

    # ---------- pengeluaran operasional dalam periode ----------
    # Kolom tanggal bertipe DATE; batas periode dikonversi ke date supaya
    # perbandingannya apel-ke-apel. `selesai` eksklusif, sama dengan selesai_at.
    def _tgl_exp(mentah: Any) -> Optional[date]:
        try:
            return date.fromisoformat(str(mentah)[:10])
        except (TypeError, ValueError):
            return None

    mulai_d = mulai.date() if mulai else None
    selesai_d = selesai.date() if selesai else None
    exp_periode: list[dict] = []
    for r in pengeluaran:
        d = _tgl_exp(r.get("tanggal"))
        if d is None:
            continue
        if mulai_d and d < mulai_d:
            continue
        if selesai_d and d >= selesai_d:
            continue
        exp_periode.append(r)

    total_pengeluaran = sum(r.get("jumlah") or 0 for r in exp_periode)
    per_kategori: dict[str, int] = {}
    for r in exp_periode:
        kat = r.get("kategori") or "lainnya"
        per_kategori[kat] = per_kategori.get(kat, 0) + (r.get("jumlah") or 0)
    kategori_terurut = sorted(per_kategori.items(), key=lambda x: x[1], reverse=True)

    return {
        "dihitung_pada": now.isoformat(),
        "periode": {
            "label": label_periode,
            "granularitas": granularitas,
            "mulai": mulai.isoformat() if mulai else None,
            "selesai": selesai.isoformat() if selesai else None,
        },

        # --- angka periode (semua dari selesai_at) ---
        "transaksi_periode": len(dalam_periode),
        "omzet_periode": omzet_periode,
        "komisi_periode": komisi_periode,
        "laba_outlet_periode": omzet_periode - komisi_periode,
        # Pengeluaran operasional + sisa sesudahnya ("profit bersih" sederhana).
        "pengeluaran_periode": total_pengeluaran,
        "pengeluaran_per_kategori": [
            {"kategori": k, "jumlah": j} for k, j in kategori_terurut
        ],
        "laba_bersih_periode": omzet_periode - komisi_periode - total_pengeluaran,
        "total_transaksi": len(transaksi),
        "omzet_total": _omzet(transaksi),
        "grafik": grafik,
        "tren_harian": grafik if granularitas == "hari" else [],
        "perubahan_omzet_persen": _growth(dalam_periode, lalu),
        "perubahan_transaksi_persen": _growth_jumlah(dalam_periode, lalu),
        "periode_lalu_omzet": _omzet(lalu),
        "periode_lalu_transaksi": len(lalu),

        # --- pembanding bergulir (dipakai untuk kartu info) ---
        "transaksi_7h": len(seit_7h),
        "omzet_7h": _omzet(seit_7h),
        "transaksi_30h": len(seit_30h),
        "omzet_30h": _omzet(seit_30h),
        "transaksi_masih_jalan": sum(per_status.get(s, 0) for s in STATUS_AWAL),
        "transaksi_sudah_selesai": per_status.get("Selesai", 0) + per_status.get("Siap diambil", 0),

        # --- status (selalu seluruh riwayat, bukan periode) ---
        "per_status": per_status,

        # --- layanan ---
        "layanan_terlaris": [{"nama": n, "jumlah": c} for n, c in terlaris],
        "layanan_omzet_tertinggi": [{"nama": n, "omzet": c} for n, c in termahal],

        # --- orang ---
        "jumlah_teknisi": len(teknisi),
        "pekerjaan_per_teknisi": [
            {"nama": nama_teknisi.get(tid, "Tidak dikenal"), "jumlah": c}
            for tid, c in sorted(pekerjaan_teknisi.items(), key=lambda x: x[1], reverse=True)
        ],
        "jumlah_pelanggan": len(pelanggan),
        "jumlah_drop_point_aktif": len([p for p in titik if p.get("aktif", True)]),

        # --- stok & antrean (kondisi saat ini) ---
        "jumlah_stok_kritis": len(kritis),
        "stok_kritis": kritis[:8],
        "jumlah_tertahan": len(tertahan),
        "pekerjaan_tertahan": tertahan[:8],

        # --- kualitas input ---
        "foto_after_terisi": foto_terisi,
        "foto_after_belum": foto_after_belum,
        "catatan_konsumen_ada": catatan_konsumen,
        "catatan_cacat_ada": catatan_cacat,
    }


def _periode_sebelumnya(
    mulai: Optional[datetime], selesai: Optional[datetime]
) -> Optional[tuple[datetime, datetime]]:
    """
    Periode sepanjang durasi yang sama, tepat sebelum `mulai`.

    Untuk bulan -> bulan sebelumnya. Untuk tahun -> tahun sebelumnya.
    Kalau `mulai` None (periode "semua"), tidak ada pembanding yang masuk akal
    sehingga None dikembalikan dan growth dihitung sebagai None.
    """
    if mulai is None or selesai is None:
        return None
    durasi = selesai - mulai
    return (mulai - durasi, mulai)


# ==========================================
# 2. FALLBACK — RULE BASED
# ==========================================


def rule_based_summary(f: dict[str, Any]) -> str:
    """Ringkasan deterministik. Selalu berhasil, tidak butuh jaringan."""
    total = f["total_transaksi"]
    if total == 0:
        return (
            "Belum ada transaksi yang tercatat, jadi belum ada pola yang bisa dibaca. "
            "Begitu ada booking masuk, ringkasan ini akan terisi otomatis dengan tren "
            "omzet, layanan terlaris, dan catatan stok yang perlu disiapkan."
        )

    label = f["periode"]["label"]
    ps = f["per_status"]
    bagian: list[str] = []

    # --- kondisi periode terpilih ---
    n_periode = f["transaksi_periode"]
    if n_periode == 0:
        skel = (
            f"Belum ada pekerjaan yang selesai pada {label}, jadi belum ada omzet "
            "yang bisa dilaporkan untuk periode ini."
        )
    else:
        skel = (
            f"Pada {label} tercatat {n_periode} pekerjaan selesai dengan omzet "
            f"{_ribuan(f['omzet_periode'])}. Dari angka itu, komisi teknisi "
            f"{_ribuan(f['komisi_periode'])} dan sisa untuk outlet "
            f"{_ribuan(f['laba_outlet_periode'])}."
        )
        if f.get("pengeluaran_periode"):
            skel += (
                f" Pengeluaran operasional tercatat {_ribuan(f['pengeluaran_periode'])}, "
                f"sehingga sisa bersihnya {_ribuan(f['laba_bersih_periode'])}."
            )

    growth = f.get("perubahan_omzet_persen")
    if growth is None:
        skel += (
            " Perbandingan dengan periode sebelumnya belum bisa dihitung karena "
            "periode pembandingnya masih kosong."
        )
    elif growth > 0:
        skel += f" Omzet naik {_persen(growth)} dibanding periode sebelumnya."
    elif growth < 0:
        skel += f" Omzet turun {_persen(abs(growth))} dibanding periode sebelumnya, ini yang perlu dicek."
    else:
        skel += " Omzet sama dengan periode sebelumnya."
    bagian.append(skel)

    # --- pembanding bergulir (supaya ada konteks walau periode-nya sepi) ---
    if f["transaksi_7h"] or f["transaksi_30h"]:
        bagian.append(
            f"Sebagai pembanding, 7 hari terakhir ada {f['transaksi_7h']} pekerjaan "
            f"senilai {_ribuan(f['omzet_7h'])}, dan 30 hari terakhir "
            f"{f['transaksi_30h']} pekerjaan {_ribuan(f['omzet_30h'])}. "
            f"Total sejak sistem dipakai: {total} pekerjaan."
        )

    # --- antrean kerja ---
    jalan = f["transaksi_masih_jalan"]
    if jalan:
        bagian.append(
            f"Antrean kerja: {jalan} pekerjaan masih di tahap awal "
            f"(Diterima {ps.get('Diterima', 0)}, Diproses {ps.get('Diproses', 0)}, "
            f"Diperiksa {ps.get('Diperiksa', 0)}), sementara "
            f"{f['transaksi_sudah_selesai']} sudah selesai atau siap diambil."
        )

    # --- layanan ---
    if f["layanan_terlaris"]:
        top = f["layanan_terlaris"][0]
        if f["layanan_omzet_tertinggi"]:
            paling_omzet = f["layanan_omzet_tertinggi"][0]
            if paling_omzet["nama"] == top["nama"]:
                bagian.append(
                    f"Layanan yang paling sering dipesan pada {label} sekaligus "
                    f"penyumbang omzet terbesar adalah {top['nama']}, dengan "
                    f"{top['jumlah']} kali pesan senilai {_ribuan(paling_omzet['omzet'])}."
                )
            else:
                bagian.append(
                    f"Layanan yang paling sering dipesan pada {label} adalah {top['nama']} "
                    f"({top['jumlah']} kali), tapi penyumbang omzet terbesar justru "
                    f"{paling_omzet['nama']} dengan {_ribuan(paling_omzet['omzet'])}. Jadi "
                    "pemesanan terbanyak tidak otomatis jadi penyumbang omzet terbesar."
                )
        else:
            bagian.append(
                f"Layanan yang paling sering dipesan adalah {top['nama']} ({top['jumlah']} kali)."
            )

    # --- beban teknisi ---
    if f["pekerjaan_per_teknisi"]:
        beban = f["pekerjaan_per_teknisi"][0]
        sisa = f["jumlah_teknisi"] - 1
        if sisa > 0:
            bagian.append(
                f"Dari {f['jumlah_teknisi']} teknisi, {beban['nama']} memegang "
                f"{beban['jumlah']} pekerjaan, sementara {sisa} teknisi lain belum memegang "
                "pekerjaan sebanyak itu. Pembagian tugas masih bisa diimbangi."
            )
        else:
            bagian.append(
                f"Seluruh pekerjaan yang ada dipegang oleh {beban['nama']} ({beban['jumlah']} pekerjaan)."
            )

    # --- hal yang perlu ditindak ---
    tindakan: list[str] = []
    if f["jumlah_tertahan"]:
        paling = f["pekerjaan_tertahan"][0]
        tindakan.append(
            f"{f['jumlah_tertahan']} pekerjaan sudah lebih dari 2 hari belum selesai; "
            f"yang tertua {paling['kode']} masih di tahap {paling['status']} selama "
            f"{paling['umur_hari']} hari"
        )
    if f["jumlah_stok_kritis"]:
        nama = ", ".join(s["nama"] for s in f["stok_kritis"][:3] if s.get("nama"))
        tindakan.append(f"{f['jumlah_stok_kritis']} bahan menyentuh batas minimum ({nama})")
    if tindakan:
        bagian.append("Yang perlu ditindak: " + "; ".join(tindakan) + ".")

    # --- kualitas input (informasi, bukan teguran) ---
    catatan = []
    if total > 0 and f["catatan_cacat_ada"] == 0:
        catatan.append("belum ada catatan cacat sama sekali dari teknisi")
    if total > 0 and f["catatan_konsumen_ada"] == 0:
        catatan.append("konsumen belum pernah mengisi catatan saat titip")
    if catatan:
        bagian.append(
            "Catatan: " + " dan ".join(catatan) + ". Kalau mulai tercatat, klaim kerusakan "
            "lebih mudah ditangani karena ada bukti tertulis."
        )

    return " ".join(p for p in bagian if p)


def rule_based_saran(f: dict[str, Any]) -> list[str]:
    """
    Saran deterministik. Mengembalikan daftar string (bisa kosong).

    Dipisah dari ringkasan supaya frontend bisa menampilkannya sebagai daftar
    berpoin, bukan paragraf. Bentuknya harus sama dengan output AI supaya
    frontend tidak perlu tahu sumber mana yang dipakai.
    """
    saran: list[str] = []

    # 1. Stok kritis -- yang paling konkret dan bisa langsung ditindak.
    if f["jumlah_stok_kritis"]:
        nama = ", ".join(s["nama"] for s in f["stok_kritis"][:3] if s.get("nama"))
        saran.append(f"Segera beli {nama} sebelum kehabisan. Ini yang paling cepat jadi masalah.")

    # 2. Pekerjaan lama.
    if f["jumlah_tertahan"]:
        paling = f["pekerjaan_tertahan"][0]
        saran.append(
            f"Tinjau {paling['kode']} yang sudah {paling['umur_hari']} hari di tahap "
            f"{paling['status']}. Cek apakah ada yang menghambat, atau jadwalkan ulang."
        )

    # 3. Beban kerja tidak seimbang.
    if f["pekerjaan_per_teknisi"]:
        beban = f["pekerjaan_per_teknisi"][0]
        sisa = f["jumlah_teknisi"] - 1
        if sisa > 0:
            saran.append(
                f"Sebagian besar kerjaan ada di {beban['nama']} ({beban['jumlah']} pekerjaan). "
                "Bagikan ke teknisi lain supaya waktu tunggunya lebih seimbang."
            )

    # 4. Tren turun.
    growth = f.get("perubahan_omzet_persen")
    if growth is not None and growth < -10:
        saran.append(
            f"Omzet turun {_persen(abs(growth))} dibanding periode sebelumnya. "
            "Cek apakah karena musim sepi, layanan yang dulu ramai hilang, atau ada pesaing."
        )

    # 5. Burst naik -- siapkan stok dan kapasitas.
    if growth is not None and growth > 20:
        saran.append(
            f"Omzet naik {_persen(growth)}. Pastikan stok bahan dan jam kerja teknisi masih cukup."
        )

    # 6. Kualitas dokumentasi.
    if f["foto_after_belum"] and f["jumlah_tertahan"]:
        saran.append(
            "Beberapa pekerjaan lama belum punya foto setelah. Minta teknisi lengkapi "
            "supaya aman kalau ada klaim."
        )

    # 7. Periode sepi.
    if f["transaksi_periode"] == 0 and f["total_transaksi"] > 0:
        saran.append(
            "Belum ada pekerjaan selesai di periode ini. Kalau bukan karena sepi, "
            "periksa juga apakah teknisi sudah menandai status Selesai."
        )

    return saran


# ==========================================
# 3. OPENROUTER (opsional, HANYA narasi + saran)
# ==========================================

SYSTEM_PROMPT = """Kamu adalah analis operasional untuk bisnis cuci sepatu \
yang beralamat di Jl. Cisadane No.3, Singonegaran, Banyuwangi. Kamu \
menerima data agregat (angka, bukan data pribadi).

Tugasmu HANYA dua hal:
1. RINGKASAN: maksimal 4 paragraf pendek tentang apa yang terjadi di \
   periode ini.
2. SARAN: 2 sampai 4 rekomendasi tindakan konkret yang bisa langsung \
   dikerjakan pemilik.

Yang TIDAK boleh kamu lakukan:
- Menghitung ulang atau mengarang angka. Semua angka sudah dihitung sistem; \
  cukup mengutip angka yang ada di data.
- Menyebut kode transaksi, nomor telepon, atau nama orang.
- Memberi saran di luar data (misal membuka cabang baru) kecuali kamu \
  menyatakan jelas bahwa itu di luar jangkauan data.

Gaya: seperti pemilik toko yang sudah biasa baca data, bukan bahasa korporat.
Semua nominal rupiah ditulis seperti "Rp 350.000".

Balas HANYA dengan JSON valid, tanpa teks lain, dengan bentuk persis:
{"ringkasan": "paragraf 1\n\nparagraf 2", "saran": ["saran 1", "saran 2"]}"""


def openrouter_insight(
    facts: dict[str, Any],
    api_key: str,
    model: str,
    timeout: float = TIMEOUT_DETIK,
) -> Optional[tuple[str, list[str]]]:
    """
    Panggil OpenRouter untuk (ringkasan, saran).

    Kembalikan None kalau gagal dalam bentuk apa pun -- biarkan
    `rule_based_*` yang pakai. Tidak ada retries ke model yang sama: kalau
    model gratis sedang lambat, menunggu 45 detik untuk setiap pembukaan
    dashboard adalah pengalaman yang buruk. `timeout` diturunkan pemanggil
    saat ada beberapa model cadangan supaya total tunggu tetap terkendali.
    """
    if not api_key:
        return None

    # Jangan kirim seluruh facts: hanya angka agregat yang relevan.
    untuk_ai = {k: v for k, v in facts.items() if k != "dihitung_pada"}

    # Daftar panjang dan teks panjang dipangkas supaya tidak menghabiskan token
    # dan supaya model lebih fokus ke angka ringkasnya.
    untuk_ai.pop("stok_kritis", None)
    untuk_ai.pop("pekerjaan_tertahan", None)
    untuk_ai.pop("grafik", None)
    untuk_ai.pop("tren_harian", None)

    label = facts.get("periode", {}).get("label", "periode terpilih")

    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    f"Periode laporan: {label}\n\n"
                    "Data agregat:\n\n"
                    + json.dumps(untuk_ai, ensure_ascii=False, indent=2)
                ),
            },
        ],
        "temperature": 0.4,
        "max_tokens": MAX_TOKENS,
    }

    req = urllib.request.Request(
        OPENROUTER_URL,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/mhmmd-naufl/Komang_SAC",
            "X-Title": "Komang SAC Analytics",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            hasil = json.loads(resp.read().decode("utf-8"))
        teks = hasil["choices"][0]["message"]["content"] or ""
        teks = _buang_pemikiran(teks)
        return _urai_json(teks)
    except Exception:
        # 429 (kuota model gratis habis), 403 (key tak punya akses model),
        # 404 (model sudah dihapus dari katalog), timeout, HTML dari proxy,
        # atau JSON aneh. Semuanya normal dan wajar, bukan bug -- jadi diamkan
        # saja dan biarkan ringkasan rule-based yang dipakai.
        return None


def _urai_json(teks: str) -> Optional[tuple[str, list[str]]]:
    """
    Parse balasan model jadi (ringkasan, saran).

    Model gratis tidak selalu mengembalikan JSON murni.
    Sebagian membungkus dengan pagar ```json, sebagian mendahului dengan
    "Here is the JSON:". Jadi: coba parse apa adanya; kalau gagal, ambil
    objek JSON pertama yang kurung kurawalnya seimbang.
    """
    teks = (teks or "").strip()
    if not teks:
        return None

    kandidat = [teks]

    # Buang pagar kode kalau ada.
    pagar = re.search(r"```(?:json)?\s*(.*?)```", teks, re.DOTALL)
    if pagar:
        kandidat.append(pagar.group(1).strip())

    # Cari objek JSON pertama yang seimbang.
    awal = teks.find("{")
    if awal >= 0:
        depth = 0
        for i in range(awal, len(teks)):
            if teks[i] == "{":
                depth += 1
            elif teks[i] == "}":
                depth -= 1
                if depth == 0:
                    kandidat.append(teks[awal : i + 1])
                    break

    for k in kandidat:
        try:
            obj = json.loads(k)
        except (ValueError, TypeError):
            continue
        if not isinstance(obj, dict):
            continue
        ringkasan = obj.get("ringkasan") or obj.get("summary") or ""
        saran = obj.get("saran") or obj.get("suggestions") or []
        if isinstance(saran, str):
            saran = [baris.strip("- ").strip() for baris in saran.split("\n") if baris.strip()]
        if isinstance(saran, list):
            saran = [str(s).strip() for s in saran if str(s).strip()]
        else:
            saran = []
        if ringkasan:
            return _buang_pemikiran(str(ringkasan).strip()), saran[:5]
    return None


# ==========================================
# 4. ORKESTRASI
# ==========================================


def build_summary(
    supabase,
    mulai: Optional[datetime] = None,
    selesai: Optional[datetime] = None,
    granularitas: str = "hari",
    label_periode: str = "Semua waktu",
) -> dict[str, Any]:
    """
    Ringkasan + saran (AI atau fallback), disertai fakta untuk grafik.

    Kontrak penting: `fakta` SELALU hasil perhitungan lokal, apa pun yang
    terjadi pada pemanggilan AI. Frontend menggambar grafik dari `fakta`,
    jadi grafik tidak pernah berubah karena alasan bahasa.
    """
    facts = gather_facts(
        supabase,
        mulai=mulai,
        selesai=selesai,
        granularitas=granularitas,
        label_periode=label_periode,
    )

    api_key = os.getenv("OPENROUTER_API_KEY", "").strip()
    models = _daftar_model()

    if api_key:
        # Coba model satu per satu: kalau yang pertama kena 429/404/timeout,
        # lanjut ke cadangan berikutnya sebelum menyerah ke rule-based.
        # Total tunggu dijaga ~TIMEOUT_DETIK: makin banyak cadangan, makin
        # pendek jatah tiap model (minimal 12 detik supaya tidak mustahil).
        per_model = max(12.0, TIMEOUT_DETIK / max(1, len(models)))
        for model in models:
            hasil = openrouter_insight(facts, api_key, model, timeout=per_model)
            if hasil:
                ringkasan, saran = hasil
                return {
                    "ringkasan": ringkasan,
                    "saran": saran,
                    "sumber": "ai",
                    "model": model,
                    "catatan": None,
                    "fakta": facts,
                }
        alasan = (
            f"Layanan AI sedang tidak tersedia (semua model dalam daftar gagal: "
            f"{', '.join(models)} -- kuota habis, timeout, atau API key ditolak). "
            "Ringkasan dan saran di bawah dihitung dari data langsung."
        )
    else:
        alasan = (
            "OPENROUTER_API_KEY belum diisi di .env, jadi ringkasan dan saran "
            "di bawah dihitung dari data langsung tanpa AI."
        )

    return {
        "ringkasan": rule_based_summary(facts),
        "saran": rule_based_saran(facts),
        "sumber": "fallback",
        "model": None,
        "catatan": alasan,
        "fakta": facts,
    }