"""
Analytics + ringkasan AI untuk dashboard admin.

Dua jalur, selalu mengembalikan sesuatu:

  1. AI       -> OpenRouter (model gratis). Naratif seperti tulisan analis.
  2. Fallback -> hitungan deterministik di file ini, Bahasa Indonesia.

Fallback dipakai kalau: API key kosong, model tidak tersedia (403/429),
timeout, status server error, atau balasan tidak bisa diparse. Jadi ringkasan
di dashboard tidak pernah kosong hanya karena layanan AI sedang tidak sehat.

Catatan privasi: yang dikirim ke OpenRouter hanya angka agregat. Kode transaksi,
nomor telepon, dan nama orang tidak pernah ikut. Endpoint-nya admin-only.
"""

import os
import re
import json
import urllib.request
import urllib.error
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

# Model gratis. Ganti lewat .env (OPENROUTER_MODEL) kalau model ini habis kuota.
#
# Catatan hasil uji (Oktober 2026, daftar /models OpenRouter):
#   nvidia/nemotron-3-super-120b-a12b:free  -> dipakai. Cepat (~6 dtk),
#       Bahasa Indonesia enak, tidak bocorkan proses berpikir.
#   nvidia/nemotron-3.5-lightning:free      -> WORKS tapi emit "thinking
#       process" ke dalam jawaban, jadi perlu _buang_pemikiran().
#   google/gemma-4-31b-it:free              -> sering 429 (rate limited).
#   thinkingmachines/inkling:free           -> 403, hanya untuk agentic harness.
DEFAULT_MODEL = "nvidia/nemotron-3-super-120b-a12b:free"

STATUS_TAHAP = ["Diterima", "Diproses", "Diperiksa", "Selesai", "Siap diambil"]
STATUS_FINAL = {"Selesai", "Siap diambil"}
STATUS_AWAL = ["Diterima", "Diproses", "Diperiksa"]

TIMEOUT_DETIK = 45.0
MAX_TOKENS = 1400

# Beberapa model gratis sempat menampakkankan proses berpikir di depan
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


# ==========================================
# 1. KUMPULKAN FAKTA
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


def _rentang(rows: list[dict], mulai: datetime, selesai: datetime) -> list[dict]:
    """Transaksi dengan mulai <= created_at < selesai."""
    hasil = []
    for r in rows:
        dibuat = _parse_iso(r.get("created_at"))
        if dibuat and mulai <= dibuat < selesai:
            hasil.append(r)
    return hasil


def _omzet(rows: list[dict]) -> int:
    return sum(r.get("harga") or 0 for r in rows)


def _growth(sekarang: list[dict], lalu: list[dict]) -> Optional[float]:
    """Perubahan persen omzet. None kalau periode pembanding 0 (tidak bisa dihitung)."""
    a, b = _omzet(sekarang), _omzet(lalu)
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


def gather_facts(supabase) -> dict[str, Any]:
    """Hitung semua angka yang dibutuhkan ringkasan. Semua nol aman."""
    now = datetime.now(timezone.utc)
    hari_ini = now - timedelta(days=1)
    minggu_lalu = now - timedelta(days=7)
    dua_minggu_lalu = now - timedelta(days=14)
    bulan_lalu = now - timedelta(days=30)

    transaksi = (
        supabase.from_("transactions")
        .select(
            "id, kode, shoe_id, harga, tech_id, status, created_at, "
            "photo_after, catatan_konsumen, defect_notes"
        )
        .execute().data or []
    )
    dengan_sepatu = (
        supabase.from_("transactions")
        .select("shoe_id, harga, created_at")
        .execute().data or []
    )
    sepatu = (
        supabase.from_("shoes")
        .select("id, merk, model, harga_cuci, jenis_treatment")
        .execute().data or []
    )
    teknisi = (
        supabase.from_("profiles").select("id, full_name").eq("role", "technician").execute().data or []
    )
    pelanggan = supabase.from_("profiles").select("id").eq("role", "customer").execute().data or []
    bahan = (
        supabase.from_("stock")
        .select("nama_item, jumlah, satuan, batas_minimum")
        .execute().data or []
    )
    titik = supabase.from_("drop_points").select("nama, aktif").execute().data or []

    harga_by_id = {s["id"]: s for s in sepatu}
    nama_teknisi = {t["id"]: t["full_name"] for t in teknisi}

    # --- agregasi per transaksi ---
    per_status: dict[str, int] = {s: 0 for s in STATUS_TAHAP}
    per_hari: dict[str, dict[str, int]] = {}
    foto_terisi = 0
    catatan_konsumen = 0
    catatan_cacat = 0
    pekerjaan_teknisi: dict[str, int] = {}

    for r in transaksi:
        status = r.get("status") or ""
        if status in per_status:
            per_status[status] += 1
        if r.get("photo_after"):
            foto_terisi += 1
        if r.get("catatan_konsumen"):
            catatan_konsumen += 1
        if r.get("defect_notes"):
            catatan_cacat += 1

        tech_id = r.get("tech_id")
        if tech_id:
            pekerjaan_teknisi[tech_id] = pekerjaan_teknisi.get(tech_id, 0) + 1

        dibuat = _parse_iso(r.get("created_at"))
        if dibuat:
            kunci = dibuat.astimezone(timezone.utc).date().isoformat()
            sel = per_hari.setdefault(kunci, {"jumlah": 0, "omzet": 0})
            sel["jumlah"] += 1
            sel["omzet"] += r.get("harga") or 0

    # --- layanan terlaris, 7 hari terakhir ---
    per_layanan: dict[str, int] = {}
    per_layanan_omzet: dict[str, int] = {}
    for r in _rentang(dengan_sepatu, minggu_lalu, now):
        s = harga_by_id.get(r.get("shoe_id"))
        if not s:
            continue
        label = " ".join(x for x in [s.get("merk"), s.get("model")] if x) or "Tanpa nama"
        per_layanan[label] = per_layanan.get(label, 0) + 1
        per_layanan_omzet[label] = per_layanan_omzet.get(label, 0) + (r.get("harga") or 0)

    # --- periode ---
    seit = {
        "7h": _rentang(transaksi, minggu_lalu, now),
        "30h": _rentang(transaksi, bulan_lalu, now),
        "7h_lalu": _rentang(transaksi, dua_minggu_lalu, minggu_lalu),
    }

    # --- grafik 14 hari, hari kosong tetap 0 agar sumbu-x tidak bolong ---
    grafik = []
    for i in range(13, -1, -1):
        hari = (now - timedelta(days=i)).date().isoformat()
        sel = per_hari.get(hari, {"jumlah": 0, "omzet": 0})
        grafik.append({"tanggal": hari, "jumlah": sel["jumlah"], "omzet": sel["omzet"]})

    # --- stok kritis ---
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

    # --- pekerjaan tertahan: belum final dan sudah lewat 2 hari ---
    tertahan = []
    for r in transaksi:
        if (r.get("status") or "") in STATUS_FINAL:
            continue
        dibuat = _parse_iso(r.get("created_at"))
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

    return {
        "dihitung_pada": now.isoformat(),
        "total_transaksi": len(transaksi),
        "omzet_total": _omzet(transaksi),
        "per_status": per_status,
        "transaksi_7h": len(seit["7h"]),
        "transaksi_30h": len(seit["30h"]),
        "omzet_7h": _omzet(seit["7h"]),
        "omzet_30h": _omzet(seit["30h"]),
        "perubahan_omzet_persen": _growth(seit["7h"], seit["7h_lalu"]),
        "tren_harian": grafik,
        "layanan_terlaris": [{"nama": n, "jumlah": c} for n, c in terlaris],
        "layanan_omzet_tertinggi": [{"nama": n, "omzet": c} for n, c in termahal],
        "jumlah_teknisi": len(teknisi),
        "pekerjaan_per_teknisi": [
            {"nama": nama_teknisi.get(tid, "Tidak dikenal"), "jumlah": c}
            for tid, c in sorted(pekerjaan_teknisi.items(), key=lambda x: x[1], reverse=True)
        ],
        "jumlah_pelanggan": len(pelanggan),
        "jumlah_drop_point_aktif": len([p for p in titik if p.get("aktif", True)]),
        "jumlah_stok_kritis": len(kritis),
        "stok_kritis": kritis[:8],
        "jumlah_tertahan": len(tertahan),
        "pekerjaan_tertahan": tertahan[:8],
        "transaksi_sudah_selesai": per_status.get("Selesai", 0) + per_status.get("Siap diambil", 0),
        "transaksi_masih_jalan": sum(per_status.get(s, 0) for s in STATUS_AWAL),
        "foto_after_terisi": foto_terisi,
        "catatan_konsumen_ada": catatan_konsumen,
        "catatan_cacat_ada": catatan_cacat,
    }


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

    ps = f["per_status"]
    bagian: list[str] = []

    # --- kondisi umum ---
    skel = (
        f"Selama 7 hari terakhir tercatat {f['transaksi_7h']} transaksi senilai "
        f"{_ribuan(f['omzet_7h'])}. Dalam 30 hari, {f['transaksi_30h']} transaksi "
        f"senilai {_ribuan(f['omzet_30h'])}. Total sejak sistem dipakai: "
        f"{total} transaksi atau {_ribuan(f['omzet_total'])}."
    )

    growth = f.get("perubahan_omzet_persen")
    if growth is None:
        skel += (
            " Perbandingan dengan minggu sebelumnya belum bisa dihitung karena "
            "periode pembandingnya masih kosong."
        )
    elif growth > 0:
        skel += f" Omzet naik {_persen(growth)} dibanding 7 hari sebelumnya."
    elif growth < 0:
        skel += f" Omzet turun {_persen(abs(growth))} dibanding 7 hari sebelumnya, ini yang perlu dicek."
    else:
        skel += " Omzet tetap sama dengan 7 hari sebelumnya."
    bagian.append(skel)

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
            paling_raut = f["layanan_omzet_tertinggi"][0]
            if paling_raut["nama"] == top["nama"]:
                bagian.append(
                    f"Layanan yang paling sering dipesan 7 hari terakhir sekaligus "
                    f"penyumbang omzet terbesar adalah {top['nama']}, dengan "
                    f"{top['jumlah']} kali pesan senilai {_ribuan(paling_raut['omzet'])}."
                )
            else:
                bagian.append(
                    f"Layanan yang paling sering dipesan 7 hari terakhir adalah {top['nama']} "
                    f"({top['jumlah']} kali), tapi penyumbang omzet terbesar justru "
                    f"{paling_raut['nama']} dengan {_ribuan(paling_raut['omzet'])}. Jadi "
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
        bagian.append("Yang perlu ditindak: " + ", lalu ".join(tindakan) + ".")

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


# ==========================================
# 3. OPENROUTER (opsional)
# ==========================================

SYSTEM_PROMPT = """Kamu adalah analis operasional untuk bisnis cuci sepatu \
yang beralamat di Jl. Cisadane No.3, Singonegaran, Banyuwangi. Kamu \
menerima data agregat (angka, bukan data pribadi) dan menulis ringkasan \
bisnis dalam Bahasa Indonesia yang lugas dan praktis.

Aturan:
- Maksimal 5 paragraf pendek.
- Semua nominal rupiah ditulis seperti "Rp 350.000".
- Sebutkan temuan konkret dari data. Jangan kalimat umum yang bisa ditulis tanpa data.
- Beri 2 sampai 4 rekomendasi tindakan yang bisa langsung dikerjakan pemilik.
- Jangan mengarang angka yang tidak ada di data. Kalau datanya kurang, katakan begitu.
- Jangan menyebut kode transaksi, nomor telepon, atau nama orang secara spesifik.
- Gaya: seperti pemilik toko yang sudah biasa baca data, bukan bahasa korporat."""


def openrouter_summary(facts: dict[str, Any], api_key: str, model: str) -> Optional[str]:
    """Panggil OpenRouter. Kembalikan None kalau gagal dalam bentuk apa pun."""
    if not api_key:
        return None

    # Jangan kirim seluruh katalog: hanya angka agregat yang relevan.
    untuk_ai = {k: v for k, v in facts.items() if k != "dihitung_pada"}
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    "Data operasional 14 hari terakhir:\n\n"
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
        with urllib.request.urlopen(req, timeout=TIMEOUT_DETIK) as resp:
            hasil = json.loads(resp.read().decode("utf-8"))
        teks = hasil["choices"][0]["message"]["content"] or ""
        teks = _buang_pemikiran(teks)
        return teks or None
    except Exception:
        # 429 (kuota model gratis habis), 403 (key tak punya akses model),
        # 404 (model sudah dihapus dari katalog), timeout, HTML dari proxy,
        # atau JSON aneh. Semuanya normal dan wajar, bukan bug -- jadi diamkan
        # saja dan biar ringkasan rule-based yang dipakai.
        return None


# ==========================================
# 4. ORKESTRASI
# ==========================================


def build_summary(supabase) -> dict[str, Any]:
    facts = gather_facts(supabase)

    api_key = os.getenv("OPENROUTER_API_KEY", "").strip()
    model = os.getenv("OPENROUTER_MODEL", "").strip() or DEFAULT_MODEL

    if api_key:
        teks = openrouter_summary(facts, api_key, model)
        if teks:
            return {
                "ringkasan": teks,
                "sumber": "ai",
                "model": model,
                "catatan": None,
                "fakta": facts,
            }
        alasan = (
            "Layanan AI sedang tidak tersedia (kuota model gratis habis, timeout, "
            "atau API key ditolak). Ringkasan di bawah dihitung dari data langsung."
        )
    else:
        alasan = (
            "OPENROUTER_API_KEY belum diisi di .env, jadi ringkasan di bawah "
            "dihitung dari data langsung tanpa AI."
        )

    return {
        "ringkasan": rule_based_summary(facts),
        "sumber": "fallback",
        "model": None,
        "catatan": alasan,
        "fakta": facts,
    }
