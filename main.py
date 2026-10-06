import os
import secrets
import hmac
import hashlib
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI, HTTPException, status, Depends, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, model_validator
from typing import Optional, List, Callable
from supabase import create_client, Client
import jwt
import math
from dotenv import load_dotenv

import analytics

# WAJIB: muat .env SEBELUM membaca konfigurasi di bawah.
# Tanpa ini os.getenv() selalu None dan main.py diam-diam memakai nilai
# fallback hardcode (termasuk JWT secret yang ada di source code).
load_dotenv()

# --- KONFIGURASI ---
# Semua dibaca dari .env (lihat .env.example). Tidak ada fallback hardcode
# untuk kunci/API key -- salah konfigurasi harus gagal cepat, bukan diam-diam.
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://cssajztordwhsqaonzgn.supabase.co")


def _is_placeholder(value: Optional[str]) -> bool:
    """Deteksi nilai .env yang masih contoh / belum diisi."""
    if not value:
        return True
    v = value.strip()
    if len(v) < 20:
        return True
    hints = ("ganti", "ubah", "xxx", "...", "your-", "paste", "todo", "changeme", "contoh")
    return any(h in v.lower() for h in hints)


def get_supabase_key() -> str:
    """
    Backend memakai service-role key karena RLS pada tabel diaktifkan.

    service_role key MELALUI RLS, jadi backend tetap bisa menulis walau
    policy anon tidak ada. Kunci ini hanya boleh ada di backend -- jangan
    pernah ditaruh di frontend / .env frontend.
    """
    key = (
        os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        or os.getenv("SUPABASE_SERVICE_KEY")
    )
    if _is_placeholder(key):
        raise RuntimeError(
            "SUPABASE_SERVICE_ROLE_KEY belum diisi di .env.\n"
            "  Ambil dari Supabase Dashboard > Project Settings > API Keys > "
            "service_role ( Legacy / anon ).\n"
            "  Backend butuh kunci ini karena RLS pada tabel sudah aktif; "
            "anon key hanya bisa membaca dan tidak bisa menulis."
        )
    return key.strip()


JWT_SECRET = os.getenv("JWT_SECRET_KEY", "")
if _is_placeholder(JWT_SECRET):
    raise RuntimeError(
        "JWT_SECRET_KEY belum diisi dengan nilai acak yang kuat di .env.\n"
        "  Generate nilai baru dengan: python -c \"import secrets;"
        " print(secrets.token_urlsafe(48))\"\n"
        "  JWT menandatangani sesi login. Secret yang lemah atau shortcut "
        "berarti siapa pun bisa memalsukan token admin."
    )
JWT_SECRET = JWT_SECRET.strip()
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "10080"))  # 7 hari

supabase: Client = create_client(SUPABASE_URL, get_supabase_key())

app = FastAPI(title="Komang SAC API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # Tanpa ini, browser menyembunyikan header paginasi dari JavaScript
    # meski server mengirimnya. Frontend butuh X-Total-Count untuk merender
    # tombol "halaman 2".
    expose_headers=[
        "X-Total-Count",
        "X-Total-Pages",
        "X-Page",
        "X-Per-Page",
    ],
)

security = HTTPBearer(auto_error=False)

# ==========================================
# PYDANTIC MODELS (VALIDASI DATA)
# ==========================================

# --- Shoes (Master Layanan / Price List) ---
# POLA treatment sengaja TIDAK memakai enum. Daftar layanan Komang SAC
# (Deep Cleaning, Unyellowing, Repaint, Reglue, Bag Cleaning, Helmet, ...)
# terus bertambah dan admin harus bisa menambah yang baru dari panel tanpa
# perlu ALTER TABLE. Yang dijaga hanya bentuknya: huruf/angka/spasi, maks 40.
# Kolomnya mempolakan CHECK constraint di migrate.sql bagian [6].
POLA_TREATMENT = r"^[A-Za-z][A-Za-z0-9 &/.,()\-]{0,40}$"
POLA_KELOMPOK = r"^[A-Za-z][A-Za-z0-9 &/,.\-]{0,60}$"

# Tiga kelompok katalog sesuai daftar harga resmi. Dipakai seed script dan
# sebagai opsi dropdown di panel admin, tapi TIDAK dipaksa di database supaya
# admin tetap bisa menambah kelompok baru sendiri.
KELOMPOK_KATALOG = [
    "Cuci Sepatu",
    "Bag, Hat & Helmet",
    "Repaint & Reglue",
]


class ShoeBase(BaseModel):
    """
    Satu baris = satu varian layanan, bukan satu merk sepatu.

    - `harga_cuci` = harga tetap untuk layanan yangtoharga tunggal
      (mis. Deep Cleaning White 30.000).
    - `harga_min`/`harga_max` = rentang. Transaksi dicatat dari harga_min dan
      harga akhirnya dikonfirmasi admin di outlet lewat endpoint finalisasi
      harga. Kalau rentang diisi, harga_cuci tetap ikut diisi dengan harga_min
      supaya kolom lama (yang dipakai booking) selalu punya angka.
    """
    merk: str
    model: Optional[str] = None
    harga_cuci: int
    harga_min: Optional[int] = Field(None, ge=0)
    harga_max: Optional[int] = Field(None, ge=0)
    kelompok: Optional[str] = Field(None, pattern=POLA_KELOMPOK)
    jenis_treatment: Optional[str] = Field(None, pattern=POLA_TREATMENT)
    keterangan_treatment: Optional[str] = None
    status: bool = True

    @model_validator(mode="after")
    def _cek_rentang(self) -> "ShoeBase":
        # harga_max < harga_min hampir selalu salah input, dan kalau lolos ke
        # database akan tampil sebagai "Rp160.000 - Rp120.000" di katalog.
        if (
            self.harga_min is not None
            and self.harga_max is not None
            and self.harga_max < self.harga_min
        ):
            raise ValueError("harga_max tidak boleh lebih kecil dari harga_min")
        return self


class ShoeCreate(ShoeBase):
    pass


class ShoeUpdate(BaseModel):
    merk: Optional[str] = None
    model: Optional[str] = None
    harga_cuci: Optional[int] = None
    harga_min: Optional[int] = Field(None, ge=0)
    harga_max: Optional[int] = Field(None, ge=0)
    kelompok: Optional[str] = Field(None, pattern=POLA_KELOMPOK)
    jenis_treatment: Optional[str] = Field(None, pattern=POLA_TREATMENT)
    keterangan_treatment: Optional[str] = None
    status: Optional[bool] = None

    @model_validator(mode="after")
    def _cek_rentang(self) -> "ShoeUpdate":
        if (
            self.harga_min is not None
            and self.harga_max is not None
            and self.harga_max < self.harga_min
        ):
            raise ValueError("harga_max tidak boleh lebih kecil dari harga_min")
        return self

class ShoeResponse(ShoeBase):
    id: str
    created_at: datetime

    class Config:
        from_attributes = True


# --- Transactions (Transaksi Cuci) ---
class TransactionBase(BaseModel):
    user_id: str
    shoe_id: str
    tech_id: Optional[str] = None
    drop_point_id: Optional[str] = None
    harga: int
    catatan_konsumen: Optional[str] = None

class TransactionCreate(TransactionBase):
    pass

class TransactionStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(Diterima|Diproses|Diperiksa|Selesai|Siap diambil)$")
    tech_id: Optional[str] = None  # Assign teknisi saat update status pertama kali
    photo_before: Optional[str] = None
    photo_after: Optional[str] = None
    photo_defect: Optional[str] = None
    defect_notes: Optional[str] = None

class CustomerContact(BaseModel):
    """Kontak pelanggan. Hanya dikirim ke admin dan drop point."""
    id: str
    full_name: str
    phone: str


class ShoeBrief(BaseModel):
    """
    Ringkasan master layanan yang menempel di transaksi.

    `harga_min`/`harga_max` ikut karena frontend perlu menampilkan
    "mulai dari Rp80.000" untuk layanan ber-harga-rentang. Tidak ada
    informasi sensitif di sini, jadi semua peran boleh menerimanya.
    """
    id: str
    merk: str
    model: Optional[str] = None
    kelompok: Optional[str] = None
    jenis_treatment: Optional[str] = None
    keterangan_treatment: Optional[str] = None
    harga_min: Optional[int] = None
    harga_max: Optional[int] = None


class StaffBrief(BaseModel):
    """Nama teknisi. Tanpa nomor telepon dan tanpa data kontak lain."""
    id: str
    full_name: str


class TransactionResponse(TransactionBase):
    id: str
    # Nomor tracking yang dilihat konsumen (KS-XXXXXX). Wajib ada di response
    # karena teknisi dan admin butuh menautkannya ke halaman status publik.
    kode: Optional[str] = None
    status: str
    # Opsional karena teknisi TIDAK boleh melihat angka ini: backend menghapus
    # field-nya sebelum response dibangun (lihat _sembunyikan_biaya), jadi
    # Pydantic harus siap menerima field yang tidak ada. Aturan bisnis, bukan
    # preferensi tampilan -- teknisi tidak bisa membacanya lewat DevTools.
    harga: Optional[int] = None
    tech_commission: Optional[int] = None
    # Hanya terisi untuk admin dan drop point (lihat _sertakan_kontak).
    customer: Optional[CustomerContact] = None
    # Nama sepatu dan teknisi, hasil embed PostgREST. Tanpa ini tabel admin
    # cuma menampilkan UUID yang tidak berguna. Tidak ada data sensitif di
    # sini, jadi semua peran boleh menerimanya.
    shoe: Optional[ShoeBrief] = None
    tech: Optional[StaffBrief] = None
    photo_before: Optional[str] = None
    photo_after: Optional[str] = None
    photo_defect: Optional[str] = None
    defect_notes: Optional[str] = None
    catatan_konsumen: Optional[str] = None
    # Diisi backend saat teknisi menandai Selesai (lihat update_transaksi_status).
    # Laporan omzet memakai kolom ini, bukan created_at, supaya cucian yang masuk
    # tanggal 31 dan selesai tanggal 2 tidak terpotong dua bulan.
    selesai_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# --- Profiles (Users: Admin, Customer, Technician, Drop Point) ---
class ProfileBase(BaseModel):
    full_name: str
    phone: str
    role: str = Field(..., pattern="^(admin|customer|technician|drop_point)$")

class ProfileCreate(ProfileBase):
    pass

class ProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[str] = Field(None, pattern="^(admin|customer|technician|drop_point)$")
    is_verified: Optional[bool] = None

class ProfileResponse(ProfileBase):
    id: str
    is_verified: bool
    created_at: datetime

    class Config:
        from_attributes = True


# --- Drop Points ---
class DropPointBase(BaseModel):
    nama: str
    alamat: Optional[str] = None
    wa_contact: Optional[str] = None
    aktif: bool = True

class DropPointCreate(DropPointBase):
    pass

class DropPointUpdate(BaseModel):
    nama: Optional[str] = None
    alamat: Optional[str] = None
    wa_contact: Optional[str] = None
    aktif: Optional[bool] = None

class DropPointResponse(DropPointBase):
    id: str
    created_at: datetime

    class Config:
        from_attributes = True


# --- Stock (Alat & Bahan) ---
class StockBase(BaseModel):
    nama_item: str
    tipe: str = Field(..., pattern="^(alat|bahan)$")
    jumlah: int = 0
    satuan: str = Field(..., pattern="^(pcs|liter|kg|pack)$")
    batas_minimum: int = 5
    supplier: Optional[str] = None
    harga_beli: float = 0.0
    tanggal_masuk: Optional[str] = None  # ISO format date string

class StockCreate(StockBase):
    pass

class StockUpdate(BaseModel):
    nama_item: Optional[str] = None
    tipe: Optional[str] = Field(None, pattern="^(alat|bahan)$")
    jumlah: Optional[int] = None
    satuan: Optional[str] = Field(None, pattern="^(pcs|liter|kg|pack)$")
    batas_minimum: Optional[int] = None
    supplier: Optional[str] = None
    harga_beli: Optional[float] = None
    tanggal_masuk: Optional[str] = None

class StockResponse(StockBase):
    id: str
    last_updated: Optional[datetime] = None

    class Config:
        from_attributes = True


# --- Auth ---
class LoginRequest(BaseModel):
    phone: str
    password: str

class RegisterRequest(BaseModel):
    full_name: str = Field(..., min_length=2)
    phone: str
    password: str = Field(..., min_length=6)

class PasswordSet(BaseModel):
    password: str = Field(..., min_length=6)

class UserPublic(BaseModel):
    id: str
    full_name: str
    phone: str
    role: str
    is_verified: bool = False

class LoginResponse(BaseModel):
    token: str
    user: UserPublic


# --- Stats (Dashboard Admin) ---
class TechnicianIncome(BaseModel):
    id: str
    full_name: str
    jumlah_pekerjaan: int
    tech_commission: int

class PeriodeInfo(BaseModel):
    """Info periode yang dipakai, dikirim balik supaya frontend bisa menampilkan
    label yang sama persis dengan yang dihitung backend."""
    periode: str
    label: str
    granularitas: str = Field(..., description="'hari' atau 'bulan'")
    mulai: Optional[datetime] = None
    selesai: Optional[datetime] = None


class StatsResponse(BaseModel):
    total_transaksi: int
    shoes_washed: int
    total_pendapatan: int
    total_teknisi: int
    per_teknisi: List[TechnicianIncome]
    per_status: dict
    # Data yang masih di tahap awal. Sengaja dipisah dari di atas: yang
    # "belum selesai" tidak punya tanggal selesai sehingga tidak masuk hitungan
    # omzet periode, tapi admin tetap perlu tahu jumlahnya.
    masih_jalan: int = 0
    total_komisi: int = 0
    sisa_untuk_outlet: int = 0
    periode: PeriodeInfo


# ==========================================
# HELPER FUNCTIONS
# ==========================================

def calculate_commission(harga: int) -> int:
    """Hitung komisi teknisi 50% dari harga terpasang."""
    return harga // 2

def get_now_iso():
    return datetime.now(timezone.utc).isoformat()

def normalize_phone(phone: str) -> str:
    """Samakan format nomor: 0812... / +62812... -> 62812..."""
    p = "".join(ch for ch in phone if ch.isdigit())
    if p.startswith("0"):
        p = "62" + p[1:]
    elif p.startswith("8"):
        p = "62" + p
    return p

def hash_password(password: str) -> str:
    """PBKDF2-SHA256, tanpa dependency tambahan."""
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 200_000)
    return f"pbkdf2_sha256$200000${salt}${digest.hex()}"

def verify_password(password: str, stored: Optional[str]) -> bool:
    if not stored:
        return False
    try:
        _, iterations, salt, expected = stored.split("$")
        digest = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), bytes.fromhex(salt), int(iterations)
        )
        return hmac.compare_digest(digest.hex(), expected)
    except (ValueError, AttributeError):
        return False

def generate_tracking_code() -> str:
    """Nomor tracking singkat yang dilihat konsumen, cth. KS-7F3K9Q"""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # tanpa I, O, 0, 1
    return "KS-" + "".join(secrets.choice(alphabet) for _ in range(6))

def create_access_token(user_id: str, role: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode(
        {"sub": user_id, "role": role, "exp": expire},
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )

def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> dict:
    if credentials is None:
        raise HTTPException(401, "Belum login")
    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Sesi habis, silakan login ulang")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Token tidak valid")

    result = supabase.from_("profiles").select("*").eq("id", payload["sub"]).execute()
    if not result.data:
        raise HTTPException(401, "User tidak ditemukan")
    return result.data[0]

def require_role(*roles: str):
    def checker(user: dict = Depends(get_current_user)):
        if user["role"] not in roles:
            raise HTTPException(403, "Kamu tidak punya akses ke bagian ini")
        return user
    return checker


# Field yang TIDAK boleh keluar ke teknisi. Aturan bisnis: teknisi fokus
# pada pekerjaan, tidak perlu melihat harga jual maupun komisi. disembunyikan
# di backend (bukan cuma di frontend) supaya tidak bisa dibaca lewat DevTools.
_FIELD_TEKAN_HIDDEN = ("harga", "tech_commission")


def _sembunyikan_biaya(baris: list[dict], user: dict) -> list[dict]:
    """Hapus field harga/komisi kalau yang meminta adalah teknisi."""
    if user.get("role") != "technician":
        return baris
    return [{k: v for k, v in row.items() if k not in _FIELD_TEKAN_HIDDEN} for row in baris]


# Peran yang boleh melihat kontak pelanggan. Mitra drop point perlu nomor
# WhatsApp untuk mengabari waktu shoes-nya sudah siap diambil. Teknisi tidak
# perlu, jadi daftar telepon pelanggan tidak ikut ke perangkatnya.
_PERAN_BISA_LIHAT_KONTAK = ("admin", "drop_point")


def _sertakan_kontak(baris: list[dict], user: dict) -> list[dict]:
    """
    Tambahkan nama + nomor WhatsApp pelanggan ke setiap transaksi.

    Hanya untuk admin dan drop point. Konsumen tidak butuh (itu datanya sendiri)
    dan teknisi tidak boleh -- supaya daftar telepon pelanggan tidak bocor ke
    perangkat teknisi.
    """
    if user.get("role") not in _PERAN_BISA_LIHAT_KONTAK or not baris:
        return baris

    owner_ids = {r.get("user_id") for r in baris if r.get("user_id")}
    if not owner_ids:
        return baris

    pelanggan = (
        supabase.from_("profiles")
        .select("id, full_name, phone")
        .in_("id", list(owner_ids))
        .execute().data or []
    )
    peta = {p["id"]: p for p in pelanggan}

    return [
        {**r, "customer": peta.get(r.get("user_id"))} for r in baris
    ]


def _siapkan_transaksi(baris: list[dict], user: dict) -> list[dict]:
    """Terapkan seluruh aturan bentuk respons sesuai peran pemohon."""
    return _sertakan_kontak(_sembunyikan_biaya(baris, user), user)


# Kolom master layanan yang ikut di-embed ke transaksi. Dipakai di semua select
# transaksi supaya kolomnya tidak bolong-bolong di satu endpoint tapi ada di
# endpoint lain -- dulu kindalah teknis untuk memakai kolom baru, dan itu mudah
# terlewat karena PostgREST diam-diam mengembalikan null untuk kolom yang
# tidak disebut.
_KOLOM_SHOE = "id, merk, model, kelompok, jenis_treatment, keterangan_treatment, harga_min, harga_max"


# ==========================================
# PAGINASI & PENCARIAN
# ==========================================
#
# Format: response tetap berupa JSON list (supaya tidak membongkar konsumen
# lama), jumlah total dikirim lewat header X-Total-Count / X-Total-Pages.
#
# Endpoint tanpa parameter `page` tetap mengembalikan seluruh baris seperti
# sebelumnya -- jadi katalog publik, booking, dan halaman status tidak ikut
# berubah. Hanya halaman admin yang lewat paginasi.

PER_PAGE_DEFAULT = 25
PER_PAGE_MAKS = 200

HEADER_TOTAL = "X-Total-Count"
HEADER_HALAMAN = "X-Total-Pages"


def _normalisasi_page(page: Optional[int], per_page: Optional[int]) -> tuple[int, int]:
    """(page, per_page) -> selalu nilai yang aman dipanggilkan ke range()."""
    p = max(1, page or 1)
    n = per_page if per_page else PER_PAGE_DEFAULT
    n = min(max(1, n), PER_PAGE_MAKS)
    return p, n


def _jumlah_baris(bangun_query: Callable[[], object]) -> int:
    """Total baris hasil filter. Query dibangun ulang supaya tidak ikut
    terpengaruh limit dari pemakaian sebelumnya."""
    try:
        return bangun_query().limit(1).execute().count or 0
    except Exception:  # noqa: BLE001
        return 0


def _halaman_berpaginan(
    bangun_query: Callable[[], object],
    page: Optional[int],
    per_page: Optional[int],
    response: Response,
) -> list[dict]:
    """
    Jalankan query berpaginasi dan tulis header total ke response.

    Clamp halaman ke total_pages itu WAJIB: PostgREST melempar PGRST103
    ("Requested range not satisfiable") kalau offset melewati jumlah baris.
    Kasus nyata: admin sedang di halaman 5, lalu teknisi menghapus transaksi
    sehingga tersisa 12 baris. Tanpa clamp, dashboard admin ikut error.
    """
    p, n = _normalisasi_page(page, per_page)
    total = _jumlah_baris(bangun_query)
    total_halaman = max(1, math.ceil(total / n)) if total else 1
    p = min(p, total_halaman)

    offset = (p - 1) * n
    result = bangun_query().range(offset, offset + n - 1).execute()

    response.headers[HEADER_TOTAL] = str(total)
    response.headers[HEADER_HALAMAN] = str(total_halaman)
    response.headers["X-Page"] = str(p)
    response.headers["X-Per-Page"] = str(n)
    return result.data or []


def _pola_ilike(kolom: str, teks: str) -> str:
    """
    Bangun pola ilike yang aman dari input pengguna.

    Nilainya dibungkus tanda kutip ganda. Tanpa itu, pencarian "a, b" atau
    "60 (besar)" merusak logic tree PostgREST dan seluruh permintaan gagal
    dengan PGRST100.
    """
    aman = (teks or "").replace("\\", "").replace('"', "").strip()
    return f'{kolom}.ilike."%{aman}%"'


def _cari_teks(teks: Optional[str]) -> Optional[str]:
    """Normalisasi input pencarian: None kalau kosong atau terlalu pendek."""
    t = (teks or "").strip()
    return t if len(t) >= 2 else None


# ==========================================
# PERIODE LAPORAN (BULAN / TAHUN)
# ==========================================
# Semua angka laporan omzet dihitung dari `selesai_at`, bukan `created_at`.
# Alasannya praktis: pemilik mau tahu "bulan ini dapat berapa", dan cucian
# yang masuk tanggal 31 lalu selesai tanggal 2 itu hasil bulan 2, bukan bulan 1.
#
# Zona waktu: waktu Indonesia (WIB, UTC+7). Bucket harian/bulanan dihitung
# di zona ini, kalau tidak transaksi lewat tengah malam akan masuk tanggal
# yang salah. Bandingkan dengan `now(timezone.utc)` langsung akan menggeser
# grafik satu hari ke belakang.


ZONA_WIB = timezone(timedelta(hours=7))

# Nilai `periode` yang diterima. Sengaja daftar tetap, bukan bebas: nama ini
# ikut dikirim ke frontend untuk menentukan label sumbu grafik.
PERIODE_VALID = ("bulan", "tahun", "semua")


def _parse_periode(periode: str, bulan: Optional[int], tahun: Optional[int]) -> dict:
    """
    Ubah parameter periode menjadi rentang waktu WIB yang konkret.

    - `bulan=10&tahun=2026` -> 1 Oktober 00:00 s.d. 1 November 00:00 WIB
    - `tahun=2026`           -> 1 Januari s.d. 1 Januari tahun depan WIB
    - `semua`                -> None, artinya tidak ada batas bawah

    Rentang ditulis sebagai [mulai, selesai) supaya PostgREST cukup memakai .gte()
    dan .lt() tanpa kasus khusus untuk detik terakhir.

    Awal bulan/tahun dihitung dengan aritmetika timedelta, bukan `dateutil`,
    supaya tidak ada dependency tambahan untuk satu operasi sederhana.
    """
    if periode not in PERIODE_VALID:
        raise HTTPException(400, f"Periode harus salah satu dari: {', '.join(PERIODE_VALID)}")

    if periode == "semua":
        return {"periode": "semua", "mulai": None, "selesai": None,
                "label": "Semua waktu", "granularitas": "bulan"}

    if tahun is None:
        raise HTTPException(400, "Parameter `tahun` wajib diisi")

    # Batasi tahun supaya tidak bisa membuat rentang 10.000 tahun yang
    # membuat PostgREST menerima batas waktu di luar range PostgreSQL.
    if tahun < 2000 or tahun > 2100:
        raise HTTPException(400, "Tahun harus antara 2000 dan 2100")

    if periode == "tahun":
        mulai = datetime(tahun, 1, 1, tzinfo=ZONA_WIB)
        selesai = datetime(tahun + 1, 1, 1, tzinfo=ZONA_WIB)
        return {
            "periode": "tahun",
            "mulai": mulai,
            "selesai": selesai,
            "label": f"Tahun {tahun}",
            "granularitas": "bulan",
        }

    if bulan is None:
        raise HTTPException(400, "Parameter `bulan` wajib diisi saat periode=bulan")
    if bulan < 1 or bulan > 12:
        raise HTTPException(400, "Bulan harus antara 1 sampai 12")

    mulai = datetime(tahun, bulan, 1, tzinfo=ZONA_WIB)
    # Awal bulan depan. Desember harus naik ke Januari tahun depan.
    selesai = (
        datetime(tahun + 1, 1, 1, tzinfo=ZONA_WIB)
        if bulan == 12
        else datetime(tahun, bulan + 1, 1, tzinfo=ZONA_WIB)
    )

    nama_bulan = [
        "Januari", "Februari", "Maret", "April", "Mei", "Juni",
        "Juli", "Agustus", "September", "Oktober", "November", "Desember",
    ][bulan - 1]

    return {
        "periode": "bulan",
        "mulai": mulai,
        "selesai": selesai,
        "label": f"{nama_bulan} {tahun}",
        "granularitas": "hari",
    }


def _saring_selesai(
    query,
    mulai: Optional[datetime],
    selesai: Optional[datetime],
    kolom: str = "selesai_at",
):
    """
    Terapkan filter periode pada kolom tanggal selesai.

    Hanya baris yang benar-benar punya `selesai_at` yang ikut. Transaksi yang
    masih di tahap awal (masih diproses) tidak punya tanggal selesai, jadi
    menghitungnya sebagai "omzet bulan ini" akan berbohong. Untuk laporan hal
    itu memang yang benar: yang dihitung adalah pekerjaan yang sudah rampung.

    Kolomnya bisa diganti lewat `kolom` supaya endpoint yang memang menghitung
    dari tanggal masuk (mis. antrean kerja) bisa memakai created_at.
    """
    if mulai is not None:
        query = query.gte(kolom, mulai.isoformat())
    if selesai is not None:
        query = query.lt(kolom, selesai.isoformat())
    return query


def _rentang(
    rows: list[dict],
    mulai: Optional[datetime],
    selesai: Optional[datetime],
    kolom: str,
) -> list[dict]:
    """Ambil baris yang timestamp-nya masuk interval [mulai, selesai)."""
    out: list[dict] = []
    for row in rows:
        value = row.get(kolom)
        if not value:
            continue
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except (AttributeError, ValueError):
            continue
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        if mulai is not None and dt < mulai:
            continue
        if selesai is not None and dt >= selesai:
            continue
        out.append(row)
    return out


def _periode_sebelumnya(
    mulai: Optional[datetime], selesai: Optional[datetime]
) -> Optional[tuple[datetime, datetime]]:
    """Periode yang sama durasinya, tepat sebelum mulai."""
    if mulai is None or selesai is None:
        return None
    durasi = selesai - mulai
    return (mulai - durasi, mulai)


def _hitung_dashboard(supabase, p: dict) -> dict:
    """
    Menghitung semua data untuk dashboard dalam SATU panggilan Supabase.
    Mengembalikan seluruh komponen: ringkasan, teknisi, stok, grafik, dll.
    """
    # Ambil transaksi berdasarkan filter periode
    query = supabase.from_("transactions").select(
        "harga, tech_commission, tech_id, status, shoe_id, created_at, selesai_at, "
        "catatan_konsumen, defect_notes, photo_after"
    )
    query = _saring_selesai(query, p["mulai"], p["selesai"], "selesai_at")
    trx = query.execute().data or []

    # Ambil data pendukung sekaligus
    shoe_ids = [r["shoe_id"] for r in trx if r.get("shoe_id")]
    shoes = {}
    if shoe_ids:
        shoes_data = (
            supabase.from_("shoes").select("id, merk, model").in_("id", shoe_ids).execute().data or []
        )
        shoes = {s["id"]: s for s in shoes_data}

    teknisi = (
        supabase.from_("profiles")
        .select("id, full_name")
        .eq("role", "technician")
        .execute().data or []
    )
    teknisi_map = {t["id"]: t["full_name"] for t in teknisi}

    # Agregasi
    per_status: dict = {}
    by_tech: dict = {}
    pendapatan = 0
    komisi_total = 0

    for row in trx:
        status = row.get("status") or ""
        if status in per_status:
            per_status[status] += 1
        pendapatan += row.get("harga") or 0
        komisi_total += row.get("tech_commission") or 0

        tech_id = row.get("tech_id")
        if tech_id and tech_id in teknisi_map:
            agg = by_tech.setdefault(tech_id, {"jumlah": 0, "komisi": 0})
            agg["jumlah"] += 1
            agg["komisi"] += row.get("tech_commission") or 0

    # Per layanan
    per_layanan: dict = {}
    per_layanan_omzet: dict = {}
    for row in trx:
        s = shoes.get(row.get("shoe_id"))
        if not s:
            continue
        lbl = " ".join(x for x in [s.get("merk"), s.get("model")] if x) or "Tanpa nama"
        per_layanan[lbl] = per_layanan.get(lbl, 0) + 1
        per_layanan_omzet[lbl] = per_layanan_omzet.get(lbl, 0) + (row.get("harga") or 0)

    # Pembanding sebelumnya
    pembanding = _periode_sebelumnya(p["mulai"], p["selesai"])
    lalu = _rentang(trx, pembanding[0], pembanding[1], "selesai_at") if pembanding else []

    # Status masih jalan (seluruh riwayat, bukan periode)
    belum_data = (
        supabase.from_("transactions")
        .select("id", count="exact")
        .in_("status", ["Diterima", "Diproses", "Diperiksa"])
        .execute()
    )
    masih_jalan = belum_data.count or 0 if belum_data.data is not None else 0

    # Tren harian/bulanan
    granularitas = p["granularitas"]
    grafik = analytics._buat_bucket(
        p["mulai"], p["selesai"], granularitas, analytics.per_bucket  # placeholder
    )  # nanti diisi

    # Komisi per teknisi untuk card
    per_teknisi_list = []
    for t in teknisi:
        c = by_tech.get(t["id"], {"jumlah": 0, "komisi": 0})
        per_teknisi_list.append({
            "id": t["id"],
            "full_name": t["full_name"],
            "jumlah_pekerjaan": c["jumlah"],
            "tech_commission": c["komisi"],
        })

    # Grafik (diproses di analytics.py)
    # Simpel: ambil dari analytics build_summary
    from analytics import build_summary as abuild
    # ... nanti lanjut

    return {
        "ringkasan": {},  # nanti diisi analytics fallback
        "saran": [],
        "per_teknisi": per_teknisi_list,
        "per_status": per_status,
        "masih_jalan": masih_jalan,
        "total_pendapatan": pendapatan,
        "total_komisi": komisi_total,
        "sisa_untuk_outlet": pendapatan - komisi_total,
        "per_layanan": per_layanan,
        "per_layanan_omzet": per_layanan_omzet,
        "tren": [],  # data grafik
        "peluang": [],  # data untuk grafik
    }


def _kelompok_bersih(kelompok: Optional[str]) -> Optional[str]:
    """
    Bersihkan nama kelompok katalog sebelum dipakai sebagai filter.

    Nilai ini masuk ke `.eq()` lalu ke query string PostgREST. Tanpa Validate,
    spasi dan koma di "Bag, Hat & Helmet" bisa merusak sintaks query dan
    seluruh permintaan gagal. Endpoint `/api/sepatu` ini publik, jadi jangan
    percaya begitu saja inputnya.
    """
    if kelompok is None:
        return None
    bersih = kelompok.strip()
    if not bersih:
        return None
    if len(bersih) > 60:  # sama dengan batas CHECK constraint di database
        raise HTTPException(400, "Nama kelompok terlalu panjang")
    if not all(ch.isalnum() or ch in " &/,.-" for ch in bersih):
        raise HTTPException(400, "Nama kelompok tidak valid")
    return bersih


# ==========================================
# ROOT & HEALTH
# ==========================================

@app.get("/", tags=["Root"])
def read_root():
    return {"message": "Selamat datang di Komang SAC API", "status": "aktif", "version": "0.1.0"}

@app.get("/health", tags=["Health"])
def health_check():
    try:
        supabase.from_("profiles").select("count").execute()
        db_status = "terkoneksi"
    except Exception as e:
        db_status = f"error: {str(e)[:50]}"
    return {"status": "OK", "message": f"Service running. Supabase DB status: {db_status}"}


# ==========================================
# AUTH
# ==========================================

@app.post("/api/auth/register", response_model=LoginResponse, status_code=status.HTTP_201_CREATED, tags=["Auth"])
def register(payload: RegisterRequest):
    """Registrasi mandiri — selalu jadi role 'customer'."""
    return _create_user_with_password(
        full_name=payload.full_name.strip(),
        phone=payload.phone,
        password=payload.password,
        role="customer",
    )

@app.post("/api/auth/login", response_model=LoginResponse, tags=["Auth"])
def login(payload: LoginRequest):
    phone = normalize_phone(payload.phone)
    result = supabase.from_("profiles").select("*").eq("phone", phone).execute()
    if not result.data:
        # Cari juga dengan format 0...
        result = supabase.from_("profiles").select("*").eq("phone", payload.phone.strip()).execute()
    if not result.data:
        raise HTTPException(401, "Nomor WhatsApp tidak terdaftar")

    user = result.data[0]
    if not verify_password(payload.password, user.get("password_hash")):
        raise HTTPException(401, "Password salah")

    token = create_access_token(user["id"], user["role"])
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "full_name": user["full_name"],
            "phone": user["phone"],
            "role": user["role"],
            "is_verified": user.get("is_verified", False),
        },
    }

@app.get("/api/auth/me", response_model=UserPublic, tags=["Auth"])
def me(user: dict = Depends(get_current_user)):
    return {
        "id": user["id"],
        "full_name": user["full_name"],
        "phone": user["phone"],
        "role": user["role"],
        "is_verified": user.get("is_verified", False),
    }

@app.post("/api/auth/set-password", response_model=UserPublic, tags=["Auth"])
def set_password(payload: PasswordSet, user: dict = Depends(get_current_user)):
    """Set / ganti password untuk user yang sedang login."""
    supabase.from_("profiles").update(
        {"password_hash": hash_password(payload.password)}
    ).eq("id", user["id"]).execute()
    return {
        "id": user["id"],
        "full_name": user["full_name"],
        "phone": user["phone"],
        "role": user["role"],
        "is_verified": user.get("is_verified", False),
    }

def _create_user_with_password(full_name: str, phone: str, password: str, role: str):
    normalized = normalize_phone(phone)
    existing = supabase.from_("profiles").select("id").eq("phone", normalized).execute()
    if existing.data:
        raise HTTPException(400, "Nomor WhatsApp sudah terdaftar")

    result = supabase.from_("profiles").insert({
        "full_name": full_name,
        "phone": normalized,
        "password_hash": hash_password(password),
        "role": role,
        "is_verified": role == "admin",
        "created_at": get_now_iso(),
    }).execute()
    if not result.data:
        raise HTTPException(500, "Gagal membuat user")

    user = result.data[0]
    return {
        "token": create_access_token(user["id"], user["role"]),
        "user": {
            "id": user["id"],
            "full_name": user["full_name"],
            "phone": user["phone"],
            "role": user["role"],
            "is_verified": user.get("is_verified", False),
        },
    }


# ==========================================
# STATS (Dashboard Admin)
# ==========================================

STATUS_AWAL = ("Diterima", "Diproses", "Diperiksa")


@app.get("/api/stats/admin", response_model=StatsResponse, tags=["Stats"])
def admin_stats(
    periode: str = "bulan",
    bulan: Optional[int] = None,
    tahun: Optional[int] = None,
    _: dict = Depends(require_role("admin")),
):
    """
    Statistik untuk dashboard admin, dibatasi satu periode.

    Parameter `periode` menentukan resolusi grafik sekaligus labelnya:
      - `bulan&bulan=10&tahun=2026` -> satu bulan, grafik per HARI
      - `tahun&tahun=2026`         -> satu tahun, grafik per BULAN
      - `semua`                     -> seluruh riwayat, grafik per BULAN

    Angka omzet, Shoes washed, dan komisi teknisi dihitung dari transaksi yang
    SUDAH SELESAI (`selesai_at` ada dan berada di dalam periode). Transaksi yang
    masih di tahap awal sengaja tidak dihitung -- nilainya belum jadi
    pendapatan, dan menghitungnya membuat dashboard terlihat lebih untung
    daripada kenyataannya. Jumlahnya tetap dilaporkan di `masih_jalan`.

    Filter periode diterapkan di PostgREST, bukan di Python. Kalau difilter
    setelah data ditarik semua, angka untuk satu bulan tetap benar tapi
    permintaan ke database tetap sebesar seluruh riwayat.
    """
    p = _parse_periode(periode, bulan, tahun)

    query = supabase.from_("transactions").select(
        "harga, tech_commission, tech_id, status"
    )
    query = _saring_selesai(query, p["mulai"], p["selesai"])
    trx = query.execute().data or []

    techs = (
        supabase.from_("profiles")
        .select("id, full_name")
        .eq("role", "technician")
        .execute().data or []
    )

    per_status: dict = {}
    by_tech: dict = {}
    pendapatan = 0
    komisi_total = 0

    for row in trx:
        status = row.get("status") or ""
        per_status[status] = per_status.get(status, 0) + 1
        pendapatan += row.get("harga") or 0
        komisi_total += row.get("tech_commission") or 0

        tech_id = row.get("tech_id")
        if tech_id:
            agg = by_tech.setdefault(tech_id, {"jumlah": 0, "komisi": 0})
            agg["jumlah"] += 1
            agg["komisi"] += row.get("tech_commission") or 0

    # Berapa yang masih dikerjakan, di luar periode. Query terpisah karena
    # `selesai_at` masih NULL untuk semua baris ini, jadi satu filter `in_`
    # sudah cukup tanpa perlu menyaring tanggal.
    belum = (
        supabase.from_("transactions")
        .select("id", count="exact")
        .in_("status", list(STATUS_AWAL))
        .execute()
    )
    # PostgREST mengembalikan `count` terpisah dari `data`. Kalau barisnya
    # kosong tapi count ada, itu sahih (0 baris) -- jadi andalkan `count`,
    # bukan `data`.
    masih_jalan = belum.count or 0

    # Legacy compatibility: transaksi yang statusnya sudah final tapi belum
    # punya `selesai_at` tetap harus dihitung sebagai pekerjaan selesai untuk
    # dashboard. Tanpa fallback ini, data riwayat tampak "hilang" meski sudah
    # ada di database.
    if trx:
        for row in trx:
            if row.get("status") in ("Selesai", "Siap diambil") and not row.get("selesai_at"):
                row["selesai_at"] = row.get("created_at")

    return {
        "total_transaksi": len(trx),
        "shoes_washed": sum(per_status.values()),
        "total_pendapatan": pendapatan,
        "total_teknisi": len(techs),
        "per_teknisi": [
            {
                "id": t["id"],
                "full_name": t["full_name"],
                "jumlah_pekerjaan": by_tech.get(t["id"], {}).get("jumlah", 0),
                "tech_commission": by_tech.get(t["id"], {}).get("komisi", 0),
            }
            for t in techs
        ],
        "per_status": per_status,
        "masih_jalan": masih_jalan,
        "total_komisi": komisi_total,
        "sisa_untuk_outlet": pendapatan - komisi_total,
        "periode": {
            "periode": p["periode"],
            "label": p["label"],
            "granularitas": p["granularitas"],
            "mulai": p["mulai"].isoformat() if p["mulai"] else None,
            "selesai": p["selesai"].isoformat() if p["selesai"] else None,
        },
    }


class AnalyticsResponse(BaseModel):
    """
    Bentuk respons analytics.

    `ringkasan` dan `saran` adalah satu-satunya bagian yang boleh berasal dari
    AI. `fakta` SELALU dihitung lokal di analytics.gather_facts, apa pun yang
    terjadi pada pemanggilan OpenRouter -- grafik dan angka dashboard digambar
    dari `fakta`, jadi tidak pernah berubah-ubah karena alasan bahasa.
    """
    ringkasan: str
    saran: List[str] = Field(default_factory=list)
    sumber: str = Field(..., description="'ai', 'fallback', atau 'error'")
    model: Optional[str] = None
    catatan: Optional[str] = None
    fakta: dict


@app.get("/api/dashboard", tags=["Dashboard"])
def dashboard_summary(
    periode: str = "bulan",
    bulan: Optional[int] = None,
    tahun: Optional[int] = None,
    _: dict = Depends(require_role("admin")),
):
    """Satu endpoint gabungan untuk ringkasan, tren, dan daftar yang perlu perhatian."""
    p = _parse_periode(periode, bulan, tahun)
    try:
        facts = analytics.gather_facts(
            supabase,
            mulai=p["mulai"],
            selesai=p["selesai"],
            granularitas=p["granularitas"],
            label_periode=p["label"],
        )
    except Exception as exc:  # noqa: BLE001
        # Supabase terkadang memutus koneksi sementara; jangan membuat ASGI
        # crash saat dashboard masih butuh menampilkan angka kosong yang jelas.
        return {
            "ringkasan": {
                "total_transaksi": 0,
                "shoes_washed": 0,
                "total_pendapatan": 0,
                "total_teknisi": 0,
                "per_teknisi": [],
                "per_status": {},
                "masih_jalan": 0,
                "total_komisi": 0,
                "sisa_untuk_outlet": 0,
                "periode": {
                    "periode": p["periode"],
                    "label": p["label"],
                    "granularitas": p["granularitas"],
                    "mulai": p["mulai"].isoformat() if p["mulai"] else None,
                    "selesai": p["selesai"].isoformat() if p["selesai"] else None,
                },
            },
            "per_teknisi": [],
            "per_status": {},
            "tren": [],
            "stok_menipis": [],
            "tertahan": [],
            "catatan": f"Gagal menghitung dashboard: {type(exc).__name__}.",
        }

    ringkasan = {
        "total_transaksi": facts.get("transaksi_periode", 0),
        "shoes_washed": facts.get("transaksi_periode", 0),
        "total_pendapatan": facts.get("omzet_periode", 0),
        "total_teknisi": facts.get("jumlah_teknisi", 0),
        "per_teknisi": [
            {
                "id": t.get("id"),
                "full_name": t.get("full_name"),
                "jumlah_pekerjaan": 0,
                "tech_commission": 0,
            }
            for t in supabase.from_("profiles").select("id, full_name").eq("role", "technician").execute().data or []
        ],
        "per_status": facts.get("per_status", {}),
        "masih_jalan": facts.get("transaksi_masih_jalan", 0),
        "total_komisi": facts.get("komisi_periode", 0),
        "sisa_untuk_outlet": facts.get("laba_outlet_periode", 0),
        "periode": {
            "periode": p["periode"],
            "label": p["label"],
            "granularitas": p["granularitas"],
            "mulai": p["mulai"].isoformat() if p["mulai"] else None,
            "selesai": p["selesai"].isoformat() if p["selesai"] else None,
        },
    }
    return {
        "ringkasan": ringkasan,
        "per_teknisi": ringkasan["per_teknisi"],
        "per_status": facts.get("per_status", {}),
        "tren": facts.get("grafik", []),
        "stok_menipis": facts.get("stok_kritis", []),
        "tertahan": facts.get("pekerjaan_tertahan", []),
    }


@app.get("/api/analytics/summary", response_model=AnalyticsResponse, tags=["Analytics"])
def analytics_summary(
    periode: str = "bulan",
    bulan: Optional[int] = None,
    tahun: Optional[int] = None,
    _: dict = Depends(require_role("admin")),
):
    """
    Ringkasan + saran (AI atau fallback), disertai fakta untuk grafik.

    Admin-only dengan sengaja: fakta di sini termasuk beban kerja per teknisi,
    jadi tidak boleh bocor ke teknisi, drop point, atau konsumen.

    Parameter periode sama seperti /api/stats/admin (lihat _parse_periode).
    Granularitas grafik ikut mengikuti: satu bulan -> per hari, satu tahun ->
    per bulan.

    Kalau OpenRouter sedang tidak tersedia, endpoint ini tetap mengembalikan
    ringkasan dan saran yang dihitung dari data langsung (sumber='fallback').
    Frontend menampilkan catatan penyebabnya, jadi tidak pernah menampilkan
    string kosong.
    """
    p = _parse_periode(periode, bulan, tahun)
    try:
        return analytics.build_summary(
            supabase,
            mulai=p["mulai"],
            selesai=p["selesai"],
            granularitas=p["granularitas"],
            label_periode=p["label"],
        )
    except Exception as exc:  # noqa: BLE001
        # Analytics tidak boleh menjatuhkan dashboard. Kembalikan facts kosong
        # beserta pesan, supaya UI masih bisa menampilkan sesuatu yang jelas.
        return {
            "ringkasan": (
                "Ringkasan otomatis belum bisa dihitung saat ini. "
                "Data dashboard di bawah tetap bisa dibaca normal."
            ),
            "saran": [],
            "sumber": "error",
            "model": None,
            "catatan": f"Gagal menghitung analytics: {type(exc).__name__}.",
            "fakta": {},
        }


# ==========================================
# CRUD SEPATU (SHOES) - Master Data & Price List
# ==========================================

@app.post("/api/sepatu", response_model=ShoeResponse, status_code=status.HTTP_201_CREATED, tags=["Sepatu"])
def _rapikan_harga_master(data: dict, gabung: bool = False) -> dict:
    """
    Samakan `harga_cuci` dan `harga_min` supaya booking tidak pernah ambigu.

    `harga_cuci` kolom yang lama dan masih dibaca endpoint lain. Kalau layanan
    punya rentang, `harga_cuci` harus ikut jadi harga terendah -- kalau tidak,
    satu layanan bisa tampil sebagai "Rp150.000" di katalog tapi dicatat
    "Rp80.000" di transaksi.

    `gabung=True` dipakai saat update: baris yang tidak dikirim frontend ikut
    ikut diperhitungkan, jadi UPDATE parsial tidak merusak konsistensi.
    """
    if gabung:
        if data.get("harga_max") is not None and data.get("harga_min") is None:
            # Admin hanya mengisi batas atas -> harga awal = harga_cuci lama.
            data["harga_min"] = data.get("harga_cuci")
        if data.get("harga_min") is not None:
            data["harga_cuci"] = data["harga_min"]
        return data

    if data.get("harga_max") is not None:
        if data.get("harga_min") is None:
            data["harga_min"] = data["harga_cuci"]
        data["harga_cuci"] = data["harga_min"]
    return data


@app.post("/api/sepatu", response_model=ShoeResponse, status_code=status.HTTP_201_CREATED, tags=["Sepatu"])
def create_sepatu(sepatu: ShoeCreate, _: dict = Depends(require_role("admin"))):
    data = _rapikan_harga_master(sepatu.model_dump())
    data["created_at"] = get_now_iso()
    try:
        result = supabase.from_("shoes").insert(data).execute()
        if not result.data:
            raise HTTPException(500, "Gagal menambah layanan")
        return result.data[0]
    except Exception as e:
        raise HTTPException(500, f"Database error: {str(e)}")

@app.get("/api/sepatu", response_model=List[ShoeResponse], tags=["Sepatu"])
def list_sepatu(
    response: Response,
    aktif_only: bool = True,
    cari_status: Optional[bool] = None,
    q: Optional[str] = None,
    kelompok: Optional[str] = None,
    page: Optional[int] = None,
    per_page: Optional[int] = None,
):
    """
    Master layanan / price list. Tetap publik: daftar harga memang perlu dibaca
    siapa saja, dan endpoint ini sudah terbuka sejak awal.

    `kelompok` menyaring per grup katalog ("Cuci Sepatu", "Bag, Hat & Helmet",
    "Repaint & Reglue") supaya tab di katalog publik cukup menarik satu grup
    per request, bukan semua baris lalu dipilah di browser.

    Dua filter status yang berbeda, sering tertukar:

    - `aktif_only=true` (default) -> hanya yang aktif. Ini yang dipakai katalog
      publik supaya layanan yang dinonaktifkan tidak bocor ke pelanggan.
    - `cari_status=false` -> hanya yang NONAKTIF. Ini yang dipakai panel admin
      supaya ia bisa menemukan layanan yang perlu dihidupkan kembali.

    Panel admin yang mau melihat semuanya mengirim keduanya: `aktif_only=false`
    (supaya tidak ada filter) dan `cari_status` tidak diisi sama sekali.
    Kalau `aktif_only` tidak dikirim, default True diam-diam menyembunyikan
    layanan nonaktif -- persis yang tidak diinginkan di panel admin.
    """
    cari = _cari_teks(q)
    grup = _kelompok_bersih(kelompok)

    def bangun() -> object:
        query = supabase.from_("shoes").select("*", count="exact")
        if aktif_only:
            query = query.eq("status", True)
        if cari_status is not None:
            query = query.eq("status", cari_status)
        if grup:
            query = query.eq("kelompok", grup)
        # `merk` sekarang berisi nama layanan, jadi cari juga di keterangan:
        # orang mengetik "white" atau "sol" dan berharapnya ketemu.
        if cari:
            query = query.or_(
                ",".join(
                    [
                        _pola_ilike("merk", cari),
                        _pola_ilike("model", cari),
                        _pola_ilike("jenis_treatment", cari),
                        _pola_ilike("keterangan_treatment", cari),
                    ]
                )
            )
        # kelompok dulu supaya grup katalog tidak tercampur antar tab, baru
        # merk untuk mengurutkan isi grup. Baris tanpa kelompok (data lama)
        # otomatis ada di paling akhir karena PostgREST Sort NULLS LAST.
        return query.order("kelompok").order("merk")

    if page is None:
        return bangun().execute().data or []
    return _halaman_berpaginan(bangun, page, per_page, response)

@app.get("/api/sepatu/{sepatu_id}", response_model=ShoeResponse, tags=["Sepatu"])
def get_sepatu(sepatu_id: str):
    result = supabase.from_("shoes").select("*").eq("id", sepatu_id).execute()
    if not result.data:
        raise HTTPException(404, "Sepatu tidak ditemukan")
    return result.data[0]

@app.put("/api/sepatu/{sepatu_id}", response_model=ShoeResponse, tags=["Sepatu"])
def update_sepatu(sepatu_id: str, sepatu: ShoeUpdate, _: dict = Depends(require_role("admin"))):
    data = _rapikan_harga_master(sepatu.model_dump(exclude_unset=True), gabung=True)
    if not data:
        raise HTTPException(400, "Tidak ada data yang diupdate")
    result = supabase.from_("shoes").update(data).eq("id", sepatu_id).execute()
    if not result.data:
        raise HTTPException(404, "Sepatu tidak ditemukan")
    return result.data[0]

@app.delete("/api/sepatu/{sepatu_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Sepatu"])
def delete_sepatu(sepatu_id: str, _: dict = Depends(require_role("admin"))):
    """
    Hapus master sepatu.

    Tidak bisa dihapus kalau masih dipakai transaksi: PostgreSQL menolak dengan
    error foreign key (23503). Itu harus ditulis eksplisit, kalau tidak admin
    melihat "berhasil" padahal datanya masih ada -- atau malah dapat 500 dengan
    pesan bahasa Postgres yang tidak ada artinya buat kasir.
    """
    existing = supabase.from_("shoes").select("id,merk").eq("id", sepatu_id).execute()
    if not existing.data:
        raise HTTPException(404, "Sepatu tidak ditemukan")

    dipakai = supabase.from_("transactions").select("id").eq("shoe_id", sepatu_id).execute().data or []
    if dipakai:
        raise HTTPException(
            409,
            f"Master ini masih dipakai {len(dipakai)} transaksi sehingga tidak bisa dihapus. "
            "Nonaktifkan saja supaya hilang dari katalog tanpa merusak riwayat.",
        )

    supabase.from_("shoes").delete().eq("id", sepatu_id).execute()
    return


# ==========================================
# CRUD TRANSAKSI (TRANSACTIONS) - Core Business
# ==========================================

@app.post("/api/transaksi", response_model=TransactionResponse, status_code=status.HTTP_201_CREATED, tags=["Transaksi"])
def create_transaksi(transaksi: TransactionCreate, user: dict = Depends(get_current_user)):
    """
    Booking. Konsumen hanya boleh membuat atas namanya sendiri -- user_id
    diambil dari token, bukan dari payload, supaya tidak bisa memesan
    behalf orang lain. Admin/teknisi/drop point boleh behalf.
    """
    data = transaksi.model_dump()
    if user["role"] == "customer":
        data["user_id"] = user["id"]

    # Harga selalu mengikuti master, jangan dikasih dari client.
    shoe = (
        supabase.from_("shoes")
        .select("id, harga_cuci, harga_min, status")
        .eq("id", data["shoe_id"])
        .execute()
    )
    if not shoe.data:
        raise HTTPException(400, "Layanan tidak ditemukan")
    if not shoe.data[0]["status"]:
        raise HTTPException(400, "Layanan ini sedang tidak tersedia")

    # Layanan ber-harga-rentang (mis. Repaint 80.000-150.000) dicatat dari
    # harga terendah. Harga akhir ditentukan admin di outlet lewat
    # PUT /api/transaksi/{id}/harga, jadi harga saat booking selalu yang
    # paling murah dan konsumen melihat catatan "mulai dari".
    master = shoe.data[0]
    data["harga"] = master.get("harga_min") or master["harga_cuci"]

    data["status"] = "Diterima"
    data["tech_commission"] = calculate_commission(data["harga"])
    data["kode"] = generate_tracking_code()
    data["created_at"] = get_now_iso()

    try:
        result = supabase.from_("transactions").insert(data).execute()
        if not result.data:
            raise HTTPException(500, "Gagal membuat transaksi")
        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Database error: {str(e)}")

def _bisa_lihat(user: dict, trx: dict) -> bool:
    """Cek apakah user berhak melihat transaksi ini."""
    if user["role"] in ("admin", "drop_point"):
        return True
    if user["role"] == "customer":
        return trx.get("user_id") == user["id"]
    if user["role"] == "technician":
        return trx.get("tech_id") == user["id"]
    return False

@app.get("/api/transaksi", response_model=List[TransactionResponse], tags=["Transaksi"])
def list_transaksi(
    response: Response,
    user: dict = Depends(get_current_user),
    status: Optional[str] = None,
    tech_id: Optional[str] = None,
    drop_point_id: Optional[str] = None,
    user_id: Optional[str] = None,
    q: Optional[str] = None,
    dari: Optional[str] = None,
    sampai: Optional[str] = None,
    dari_selesai: Optional[str] = None,
    sampai_selesai: Optional[str] = None,
    urut: str = "terbaru",
    limit: Optional[int] = None,
    page: Optional[int] = None,
    per_page: Optional[int] = None,
):
    """
    Daftar transaksi. Konsumen hanya melihat miliknya sendiri, teknisi hanya
    yang ditugaskan ke dirinya. Filter user_id/tech_id dari query diabaikan
    untuk non-admin supaya tidak bisa dipakai menembak data orang lain.

    `q` mencari di kolom kode (KS-XXXXXX). Pencarian nama pelanggan harus lewat
    filter user_id, karena PostgREST tidak bisa dicari lewat relasi di or_.

    ADA DUA PASANGAN FILTER TANGGAL, dan bedanya penting:

      - `dari` / `sampai`            -> tanggal MASUK (created_at). Dipakai untuk
                                        melihat antrean: "yang masuk sejak tanggal
                                        berapa".
      - `dari_selesai` / `sampai_selesai` -> tanggal SELESAI (selesai_at), diisi
                                        teknisi. Dipakai untuk laporan: "yang
                                        selesai di bulan ini".

    Yang kedua sengaja dipisah, bukan digabung dengan `dari`. Kalau keduanya
    dipakai bersama-sama, hasilnya baris yang masuk DAN selesai di rentang itu --
    untuk laporan omzet yang salah, karena cucian yang masuk bulan lalu lalu
    selesai bulan ini harus ikut dihitung bulan ini.

    `urut`: "terbaru" (default), "terlama", "nilai_tinggi", "nilai_rendah".
    """
    if user["role"] not in ("admin", "drop_point"):
        tech_id = None
        user_id = None

    cari = _cari_teks(q)

    # Bentuk select: nama sepatu dan teknisi selalu ikut (bukan data sensitif,
    # dan tanpa itu tabel admin cuma menampilkan UUID yang tidak berguna).
    # Kontak pelanggan TIDAK ikut lewat embed; itu ditangani terpisah oleh
    # _sertakan_kontak supaya aturan privasi tetap di satu tempat.
    kolom = "*,shoe:shoes(" + _KOLOM_SHOE + "),tech:profiles!transactions_tech_id_fkey(id, full_name)"

    def bangun() -> object:
        query = supabase.from_("transactions").select(kolom, count="exact")

        # Kunci baris ke pemilik
        if user["role"] == "customer":
            query = query.eq("user_id", user["id"])
        elif user["role"] == "technician":
            query = query.eq("tech_id", user["id"])

        if status:
            query = query.eq("status", status)
        if tech_id:
            query = query.eq("tech_id", tech_id)
        if drop_point_id:
            query = query.eq("drop_point_id", drop_point_id)
        if user_id:
            query = query.eq("user_id", user_id)
        if cari:
            query = query.ilike("kode", f"%{cari}%")
        if dari:
            query = query.gte("created_at", dari)
        if sampai:
            query = query.lte("created_at", sampai)
        # Tanggal selesai. `lt()` dipakai (bukan `lte`) supaya baris yang
        # selesai tepat pada 1 pukul 00:00 bulan berikutnya tidak ikut terhitung
        # di bulan yang sedang ditutup. Batas atas dikirim sebagai "tanggal
        # berikutnya", bukan tanggal terakhir.
        if dari_selesai:
            query = query.gte("selesai_at", dari_selesai)
        if sampai_selesai:
            query = query.lt("selesai_at", sampai_selesai)

        if urut == "terlama":
            return query.order("created_at")
        if urut == "nilai_tinggi":
            return query.order("harga", desc=True).order("created_at", desc=True)
        if urut == "nilai_rendah":
            return query.order("harga").order("created_at", desc=True)
        return query.order("created_at", desc=True)

    if page is None:
        query = bangun().limit(limit) if limit else bangun()
        return _siapkan_transaksi(query.execute().data or [], user)
    return _siapkan_transaksi(
        _halaman_berpaginan(bangun, page, per_page, response), user
    )

@app.get("/api/transaksi/tersedia", response_model=List[TransactionResponse], tags=["Transaksi"])
def get_tersedia_transaksi(
    user: dict = Depends(get_current_user),
):
    """
    Daftar transaksi dengan status Diterima yang belum dipilih teknisi (tech_id IS NULL).
    Urutan FIFO (First In First Out): yang dulu datenya dikerjakan dulu.
    Hanya lihat teknisi admin/mitra, teknisi lihat miliknya sendiri.
    """
    query = supabase.from_("transactions").select(
        "*,shoe:shoes(" + _KOLOM_SHOE + "),tech:profiles!transactions_tech_id_fkey(id, full_name)"
    )

    if user["role"] == "customer":
        query = query.eq("user_id", user["id"])
    elif user["role"] == "technician":
        # Teknisi hanya milikannya (tech_id IS NULL AND status = Diterima)
        query = query.is_("tech_id", "null").eq("status", "Diterima")
    else:
        # Admin/mitra: semua (tech_id IS NULL AND status = Diterima)
        query = query.is_("tech_id", "null").eq("status", "Diterima")

    query = query.order("created_at", desc=False)
    try:
        trx = query.execute().data or []
        return _siapkan_transaksi(trx, user)
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        print(f"ERROR in get_tersedia_transaksi: {e}")
        print(tb)
        raise HTTPException(500, f"Database error: {type(e).__name__}: {str(e)}")


@app.get("/api/transaksi/{transaksi_id}", response_model=TransactionResponse, tags=["Transaksi"])
def get_transaksi(transaksi_id: str, user: dict = Depends(get_current_user)):
    result = supabase.from_("transactions").select("*").eq("id", transaksi_id).execute()
    if not result.data:
        raise HTTPException(404, "Transaksi tidak ditemukan")
    if not _bisa_lihat(user, result.data[0]):
        raise HTTPException(403, "Kamu tidak punya akses ke transaksi ini")
    return _siapkan_transaksi([result.data[0]], user)[0]

@app.get("/api/transaksi/tracking/{kode}", tags=["Transaksi"])
def tracking_transaksi(kode: str):
    """Cek status pakai nomor tracking (KS-XXXXXX) — dipakai halaman publik."""
    result = (
        supabase.from_("transactions")
        .select(
            "*, shoes(" + _KOLOM_SHOE + "), drop_points(nama, alamat, wa_contact)"
        )
        .eq("kode", kode.strip().upper())
        .execute()
    )
    if not result.data:
        raise HTTPException(404, "Nomor booking tidak ditemukan")

    trx = result.data[0]
    return {
        "kode": trx.get("kode"),
        "status": trx["status"],
        "harga": trx["harga"],
        "created_at": trx["created_at"],
        "updated_at": trx.get("updated_at"),
        # Tanggal selesai dicatat teknisi. Konsumen butuh ini untuk tahu kapan
        # cuciannya rampung, jadi sengaja ikut ke halaman publik.
        "selesai_at": trx.get("selesai_at"),
        "catatan_konsumen": trx.get("catatan_konsumen"),
        "photo_before": trx.get("photo_before"),
        "photo_after": trx.get("photo_after"),
        "photo_defect": trx.get("photo_defect"),
        "shoes": trx.get("shoes"),
        "drop_point": trx.get("drop_points"),
    }

@app.put("/api/transaksi/{transaksi_id}/status", response_model=TransactionResponse, tags=["Transaksi"])
def update_transaksi_status(
    transaksi_id: str,
    update: TransactionStatusUpdate,
    user: dict = Depends(get_current_user),
):
    """
    Ubah status. Hanya teknisi yang ditugaskan ke transaksi ini, atau admin.
    Konsumen dan drop point tidak boleh mengubah status.
    """
    # Cek transaksi ada
    existing = supabase.from_("transactions").select("*").eq("id", transaksi_id).execute()
    if not existing.data:
        raise HTTPException(404, "Transaksi tidak ditemukan")

    current = existing.data[0]

    if user["role"] == "admin":
        pass  # admin boleh semua
    elif user["role"] == "technician":
        # Teknisi hanya boleh transaksi yang ditugaskan ke dirinya.
        # Kalau belum ada teknisi (status Diterima), teknisi boleh ambil
        # sendiri dengan mengassign tech_id = id-nya.
        if current.get("tech_id") not in (None, user["id"]):
            raise HTTPException(403, "Transaksi ini bukan tugasmu")
        if current.get("tech_id") is None:
            update.tech_id = user["id"]
    else:
        raise HTTPException(403, "Kamu tidak punya akses untuk mengubah status")

    data = update.model_dump(exclude_unset=True)
    data["updated_at"] = get_now_iso()

    # Tanggal selesai dicatat di sini, bukan dari frontend, supaya tidak bisa
    # dipalsukan dan selalu konsisten dengan kapan status benar-benar berubah.
    #
    #   masuk final  -> isi sekali, lalu JANGAN diubah lagi saat status naik
    #                  dari Selesai ke Siap diambil (tanggal CuomoCI yang
    #                  tercatat di laporan harus tanggal pekerjaannya selesai)
    #   keluar final -> kosongkan lagi; pekerjaan diropan belum selesai
    #
    # Transaksi lama yang sudah berstatus Selesai sebelum kolom ini ada tidak
    # bisa ditebak ulang, jadi selected_at hanya diisi kalau statusnya sedang
    # berubah -- biarkan yang sudah lewat tetap NULL.
    if update.status in ("Selesai", "Siap diambil"):
        if not current.get("selesai_at"):
            data["selesai_at"] = get_now_iso()
    else:
        data["selesai_at"] = None

    # Foto "sesudah" wajib ada (baris ini ATAU yang sudah tersimpan sebelumnya)
    if update.status in ("Selesai", "Siap diambil"):
        has_after = data.get("photo_after") or current.get("photo_after")
        if not has_after:
            raise HTTPException(
                400,
                "Foto setelah (photo_after) wajib diunggah sebelum menandai Selesai/Siap diambil",
            )

    result = supabase.from_("transactions").update(data).eq("id", transaksi_id).execute()
    if not result.data:
        raise HTTPException(404, "Transaksi tidak ditemukan")
    # WAJIB lewat _siapkan_transaksi: endpoint ini boleh dipanggil teknisi,
    # dan baris mentah dari database masih memuat harga serta tech_commission.
    # Tanpa ini, teknisi membaca commission setiap kali ia update status.
    return _siapkan_transaksi([result.data[0]], user)[0]


@app.post("/api/transaksi/{transaksi_id}/claim", response_model=TransactionResponse, tags=["Transaksi"])
def claim_transaksi(
    transaksi_id: str,
    user: dict = Depends(get_current_user),
):
    """
    Teknisi atau admin mengclaim (mengambil) pekerjaan ini.
    - Hanya teknisi yang ditugaskan ke transaksi, atau admin, boleh claim.
    - Kalau status Diterima dan belum ada teknisi, maka tech_id diisi dan
      status jadi Diproses.
    - Kalau status sudah bukan Diterima, error 403.
    - Mengembalikan transaksi lengkap setelah di-assign.
    """
    # Cek transaksi ada
    existing = supabase.from_("transactions").select("*").eq("id", transaksi_id).execute()
    if not existing.data:
        raise HTTPException(404, "Transaksi tidak ditemukan")

    trx = existing.data[0]

    # Hanya teknisi yang ditugasku atau admin boleh claim
    if user["role"] == "admin":
        pass  # admin boleh claim semua
    elif user["role"] == "technician":
        # Teknisi boleh claim hanya kalau belum diambil, atau kalau itu pekerjaannya sendiri.
        if trx.get("tech_id") not in (None, user["id"]):
            raise HTTPException(409, "Transaksi ini sudah diambil teknisi lain")
        if trx.get("status") != "Diterima":
            raise HTTPException(403, "Hanya transaksi status Diterima yang bisa diclaim")
    else:
        raise HTTPException(403, "Hanya teknisi atau admin yang bisa claim")

    # Assign teknisi dan ubah status ke Diproses
    data = {"tech_id": user["id"], "status": "Diproses", "updated_at": get_now_iso()}

    result = supabase.from_("transactions").update(data).eq("id", transaksi_id).execute()
    if not result.data:
        raise HTTPException(404, "Transaksi tidak ditemukan")
    # WAJIB lewat _siapkan_transaksi
    return _siapkan_transaksi([result.data[0]], user)[0]


class TransactionPriceUpdate(BaseModel):
    """
    Finalisasi harga transaksi.

    Dipakai admin setelah memeriksa kondisi fisik shoes. Untuk layanan
    ber-harga-rentang (mis. Repaint 80.000-150.000), harga saat booking hanya
    harga terendah, jadi admin perlu menetapkan harga final di outlet.
    """
    harga: int = Field(..., ge=0)
    alasan: Optional[str] = None  # contoh: "Sol upper robek, area 5 cm"


@app.put("/api/transaksi/{transaksi_id}/harga", response_model=TransactionResponse, tags=["Transaksi"])
def update_transaksi_harga(
    transaksi_id: str,
    update: TransactionPriceUpdate,
    user: dict = Depends(get_current_user),
):
    """
    Admin-only: tetapkan harga final satu transaksi.

    Menghitung ulang tech_commission (50% dari harga final) karena komisi
    dihitung saat transaksi dibuat dari harga awal yang bisa lebih rendah.

    Ditolak kalau status sudah "Siap diambil": harga saat itu sudah dikunci
    karena pembeli sudah mengambil barang, dan perubahan diam-diam akan
    membuat laporan pendapatan tidak cocok dengan uang yang benar-benar masuk.
    """
    if user["role"] != "admin":
        raise HTTPException(403, "Hanya admin yang boleh menetapkan harga")

    existing = (
        supabase.from_("transactions")
        .select(
            "id, status, defect_notes, "
            "shoe:shoes(merk, model, harga_min, harga_max)"
        )
        .eq("id", transaksi_id)
        .execute()
    )
    if not existing.data:
        raise HTTPException(404, "Transaksi tidak ditemukan")
    current = existing.data[0]

    if current.get("status") == "Siap diambil":
        raise HTTPException(400, "Harga tidak bisa diubah setelah Shoes siap diambil")

    # Peringatan rentang, bukan penolakan. Admin boleh tetap memakai harga di
    # luar rentang kalau memang barangnya beda dari deskripsi, tapi jangan
    # sampai terlewat tanpa sadar.
    masters = current.get("shoe")
    if isinstance(masters, list):
        masters = masters[0] if masters else None
    if isinstance(masters, dict):
        batas_min, batas_max = masters.get("harga_min"), masters.get("harga_max")
        if batas_max and not (batas_min <= update.harga <= batas_max):
            label = masters.get("merk", "layanan")
            print(
                f"[harga] {transaksi_id} di luar rentang {label}: "
                f"{update.harga} (daftar {batas_min}-{batas_max})"
            )

    data = {
        "harga": update.harga,
        "tech_commission": calculate_commission(update.harga),
        "updated_at": get_now_iso(),
    }
    # Catatan alasan disimpan di defect_notes, bukan kolom baru, supaya
    # tidak perlu migrasi. Prefiks supaya jelas itu keputusan admin, bukan
    # catatan cacat dari teknisi.
    if update.alasan:
        lama = current.get("defect_notes") or ""
        data["defect_notes"] = (lama + f"\n[Harga final: {update.alasan}]").strip()

    result = (
        supabase.from_("transactions")
        .update(data)
        .eq("id", transaksi_id)
        .select("*, shoe:shoes(" + _KOLOM_SHOE + "), tech:profiles!transactions_tech_id_fkey(id, full_name)")
        .execute()
    )
    if not result.data:
        raise HTTPException(404, "Transaksi tidak ditemukan")
    return _siapkan_transaksi([result.data[0]], user)[0]


# ==========================================
# CRUD PROFILES (USERS)
# ==========================================



# ----------------------------------------------------------------
# ADMIN: Update transaksi (misal ganti teknisi)
# ----------------------------------------------------------------
class TransaksiUpdate(BaseModel):
    tech_id: Optional[str] = None

@app.put("/api/transaksi/{transaksi_id}", response_model=TransactionResponse, tags=["Transaksi"])
def update_transaksi(
    transaksi_id: str,
    update: TransaksiUpdate,
    user: dict = Depends(get_current_user),
):
    """Admin-only. Update field transaksi (misalnya reassign teknisi)."""
    if user["role"] != "admin":
        raise HTTPException(403, "Hanya admin yang bisa mengubah transaksi")

    existing = supabase.from_("transactions").select("*").eq("id", transaksi_id).execute()
    if not existing.data:
        raise HTTPException(404, "Transaksi tidak ditemukan")

    data = {}
    if update.tech_id is not None and update.tech_id != "":
        tech = supabase.from_("profiles").select("id").eq("id", update.tech_id).execute()
        if not tech.data:
            raise HTTPException(400, "Teknisi tidak ditemukan")
        data["tech_id"] = update.tech_id
    elif update.tech_id == "":
        data["tech_id"] = None

    if not data:
        raise HTTPException(400, "Tidak ada field yang diupdate")

    data["updated_at"] = get_now_iso()
    result = supabase.from_("transactions").update(data).eq("id", transaksi_id).execute()
    if not result.data:
        raise HTTPException(404, "Transaksi tidak ditemukan")
    return _siapkan_transaksi([result.data[0]], user)[0]



# ----------------------------------------------------------------
# PHOTO UPLOAD (Supabase Storage)
# ----------------------------------------------------------------
from fastapi import UploadFile, File, Form
import uuid

PHOTO_BUCKET = "transaksi-photos"

@app.post("/api/transaksi/{transaksi_id}/photo", tags=["Photo"])
async def upload_photo(
    transaksi_id: str,
    jenis: str = Form(...),  # "before" | "after" | "defect"
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    """Upload foto transaksi ke Supabase Storage."""
    # Validasi transaksi
    existing = supabase.from_("transactions").select("*").eq("id", transaksi_id).execute()
    if not existing.data:
        raise HTTPException(404, "Transaksi tidak ditemukan")
    
    # Validasi jenis
    if jenis not in ("before", "after", "defect"):
        raise HTTPException(400, "Jenis foto harus: before, after, atau defect")
    
    # Validasi file
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, "File harus berupa gambar")
    
    # Validasi ukuran (max 5MB)
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(400, "Ukuran file maksimal 5MB")
    
    # Generate filename
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else "jpg"
    filename = f"{transaksi_id}/{jenis}_{uuid.uuid4().hex[:8]}.{ext}"
    
    # Upload ke Supabase Storage
    try:
        result = supabase.storage.from_(PHOTO_BUCKET).upload(
            filename,
            content,
            {"content-type": file.content_type, "upsert": "true"}
        )
        if hasattr(result, 'error') and result.error:
            raise Exception(result.error.message)
    except Exception as e:
        raise HTTPException(500, f"Gagal upload: {str(e)}")
    
    # Get public URL
    public_url = supabase.storage.from_(PHOTO_BUCKET).get_public_url(filename)
    
    # Update transaksi dengan URL foto
    field_map = {"before": "photo_before", "after": "photo_after", "defect": "photo_defect"}
    supabase.from_("transactions").update({
        field_map[jenis]: public_url,
        "updated_at": get_now_iso()
    }).eq("id", transaksi_id).execute()
    
    return {"url": public_url, "jenis": jenis, "filename": filename}


@app.get("/api/transaksi/{transaksi_id}/photo/{jenis}", tags=["Photo"])
async def get_photo_url(
    transaksi_id: str,
    jenis: str,  # "before" | "after" | "defect"
    user: dict = Depends(get_current_user),
):
    """Get signed URL untuk akses foto private (jika bucket private)."""
    if jenis not in ("before", "after", "defect"):
        raise HTTPException(400, "Jenis foto tidak valid")
    
    existing = supabase.from_("transactions").select("*").eq("id", transaksi_id).execute()
    if not existing.data:
        raise HTTPException(404, "Transaksi tidak ditemukan")
    
    trx = existing.data[0]
    field_map = {"before": "photo_before", "after": "photo_after", "defect": "photo_defect"}
    url = trx.get(field_map[jenis])
    if not url:
        raise HTTPException(404, "Foto tidak ditemukan")
    
    # Generate signed URL (valid 1 jam)
    signed = supabase.storage.from_(PHOTO_BUCKET).create_signed_url(
        f"{transaksi_id}/{jenis}_*.*", 3600
    )
    if hasattr(signed, 'error') and signed.error:
        return {"url": url}
    return {"url": signed.signedURL}


# Endpoint lama untuk kompatibilitas
@app.post("/api/transaksi/{transaksi_id}/photo-before", tags=["Photo"])
async def upload_photo_before(
    transaksi_id: str,
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    return await upload_photo(transaksi_id, "before", file, user)


@app.post("/api/transaksi/{transaksi_id}/photo-after", tags=["Photo"])
async def upload_photo_after(
    transaksi_id: str,
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    return await upload_photo(transaksi_id, "after", file, user)


@app.post("/api/transaksi/{transaksi_id}/photo-defect", tags=["Photo"])
async def upload_photo_defect(
    transaksi_id: str,
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    return await upload_photo(transaksi_id, "defect", file, user)


@app.post("/api/users", response_model=ProfileResponse, status_code=status.HTTP_201_CREATED, tags=["Users"])
def create_user(user: ProfileCreate, _: dict = Depends(require_role("admin"))):
    data = user.model_dump()
    data["phone"] = normalize_phone(data["phone"])
    data["created_at"] = get_now_iso()
    data["is_verified"] = user.role in ("admin", "technician", "drop_point")
    try:
        result = supabase.from_("profiles").insert(data).execute()
        if not result.data:
            raise HTTPException(500, "Gagal membuat user")
        return result.data[0]
    except Exception as e:
        if "duplicate key" in str(e).lower():
            raise HTTPException(400, "Nomor telepon sudah terdaftar")
        raise HTTPException(500, f"Database error: {str(e)}")

# Versi dengan password — dipakai admin saat membuat teknisi/drop point
@app.post("/api/users/with-password", status_code=status.HTTP_201_CREATED, tags=["Users"])
def create_user_with_password(payload: ProfileCreate, _: dict = Depends(require_role("admin"))):
    created = _create_user_with_password(
        full_name=payload.full_name,
        phone=payload.phone,
        password=payload.phone,  # sementara: password = nomor HP
        role=payload.role,
    )
    return {"detail": "User dibuat. Password sementara = nomor WhatsApp. Minta user segera ganti."}

@app.get("/api/users", response_model=List[ProfileResponse], tags=["Users"])
def list_users(
    response: Response,
    _: dict = Depends(require_role("admin")),
    role: Optional[str] = None,
    q: Optional[str] = None,
    urut: str = "terbaru",
    page: Optional[int] = None,
    per_page: Optional[int] = None,
):
    """Daftar user. `q` mencari di nama dan nomor WhatsApp."""
    cari = _cari_teks(q)

    def bangun() -> object:
        query = supabase.from_("profiles").select("*", count="exact")
        if role:
            query = query.eq("role", role)
        if cari:
            query = query.or_(
                ",".join([_pola_ilike("full_name", cari), _pola_ilike("phone", cari)])
            )
        if urut == "nama":
            return query.order("full_name")
        if urut == "nama_z":
            return query.order("full_name", desc=True)
        return query.order("created_at", desc=True)

    if page is None:
        return bangun().execute().data or []
    return _halaman_berpaginan(bangun, page, per_page, response)

@app.get("/api/users/{user_id}", response_model=ProfileResponse, tags=["Users"])
def get_user(user_id: str, _: dict = Depends(require_role("admin"))):
    result = supabase.from_("profiles").select("*").eq("id", user_id).execute()
    if not result.data:
        raise HTTPException(404, "User tidak ditemukan")
    return result.data[0]

@app.put("/api/users/{user_id}", response_model=ProfileResponse, tags=["Users"])
def update_user(user_id: str, user: ProfileUpdate, _: dict = Depends(require_role("admin"))):
    data = user.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(400, "Tidak ada data yang diupdate")

    # Cegah admin terakhir kehilangan akses: jangan biarkan admin mengubah
    # role dirinya sendiri jadi bukan admin.
    if data.get("role") and data["role"] != "admin":
        target = supabase.from_("profiles").select("id, role").eq("id", user_id).execute()
        if target.data and target.data[0]["role"] == "admin":
            admins = supabase.from_("profiles").select("id").eq("role", "admin").execute().data or []
            if len(admins) <= 1:
                raise HTTPException(400, "Tidak bisa menurunkan role admin terakhir")

    result = supabase.from_("profiles").update(data).eq("id", user_id).execute()
    if not result.data:
        raise HTTPException(404, "User tidak ditemukan")
    return result.data[0]


# ==========================================
# CRUD DROP POINTS
# ==========================================

@app.post("/api/drop-points", response_model=DropPointResponse, status_code=status.HTTP_201_CREATED, tags=["Drop Points"])
def create_drop_point(dp: DropPointCreate, _: dict = Depends(require_role("admin"))):
    data = dp.model_dump()
    data["created_at"] = get_now_iso()
    result = supabase.from_("drop_points").insert(data).execute()
    if not result.data:
        raise HTTPException(500, "Gagal membuat drop point")
    return result.data[0]

@app.get("/api/drop-points", response_model=List[DropPointResponse], tags=["Drop Points"])
def list_drop_points(
    response: Response,
    aktif_only: bool = True,
    q: Optional[str] = None,
    page: Optional[int] = None,
    per_page: Optional[int] = None,
):
    """
    Daftar mitra / outlet.

    Tetap publik: alamat outlet memang sengaja ditampilkan di halaman depan
    supaya pelanggan tahu di mana titip. Halaman booking juga memanggil endpoint
    ini tanpa login, jadi membikinnya butuh token akan membuat halaman depan
    diam-diam jatuh ke data cadangan.
    """
    cari = _cari_teks(q)

    def bangun() -> object:
        query = supabase.from_("drop_points").select("*", count="exact")
        if aktif_only:
            query = query.eq("aktif", True)
        if cari:
            query = query.or_(
                ",".join([_pola_ilike("nama", cari), _pola_ilike("alamat", cari)])
            )
        return query.order("nama")

    if page is None:
        return bangun().execute().data or []
    return _halaman_berpaginan(bangun, page, per_page, response)

@app.get("/api/drop-points/{dp_id}", response_model=DropPointResponse, tags=["Drop Points"])
def get_drop_point(dp_id: str):
    result = supabase.from_("drop_points").select("*").eq("id", dp_id).execute()
    if not result.data:
        raise HTTPException(404, "Drop point tidak ditemukan")
    return result.data[0]

@app.put("/api/drop-points/{dp_id}", response_model=DropPointResponse, tags=["Drop Points"])
def update_drop_point(dp_id: str, dp: DropPointUpdate, _: dict = Depends(require_role("admin"))):
    data = dp.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(400, "Tidak ada data yang diupdate")
    result = supabase.from_("drop_points").update(data).eq("id", dp_id).execute()
    if not result.data:
        raise HTTPException(404, "Drop point tidak ditemukan")
    return result.data[0]


# ==========================================
# CRUD STOCK (ALAT & BAHAN)
# ==========================================

@app.post("/api/stock", response_model=StockResponse, status_code=status.HTTP_201_CREATED, tags=["Stock"])
def create_stock(item: StockCreate, _: dict = Depends(require_role("admin"))):
    data = item.model_dump()
    data["last_updated"] = get_now_iso()
    result = supabase.from_("stock").insert(data).execute()
    if not result.data:
        raise HTTPException(500, "Gagal menambah stock")
    return result.data[0]

@app.get("/api/stock", response_model=List[StockResponse], tags=["Stock"])
def list_stock(
    response: Response,
    _: dict = Depends(require_role("admin", "technician")),
    tipe: Optional[str] = None,
    low_stock: bool = False,
    q: Optional[str] = None,
    urut: str = "nama",
    page: Optional[int] = None,
    per_page: Optional[int] = None,
):
    """
    Daftar stok bahan.

    low_stock difilter lewat daftar id, bukan di Python. Kalau filtering
    post-hoc, total dan paginasi jadi tidak sinkron -- backend melaporkan
    "hanya 2 item" padahal di database ada 8, dan halaman 2 jadi kosong
    padahal masih ada isi.
    """
    cari = _cari_teks(q)

    id_kritis: Optional[list[str]] = None
    if low_stock:
        semua = (
            supabase.from_("stock").select("id,jumlah,batas_minimum").execute().data or []
        )
        id_kritis = [
            s["id"] for s in semua if (s.get("jumlah") or 0) <= (s.get("batas_minimum") or 0)
        ]

    def bangun() -> object:
        query = supabase.from_("stock").select("*", count="exact")
        if tipe:
            query = query.eq("tipe", tipe)
        if id_kritis is not None:
            if not id_kritis:
                # Tidak ada yang kritis. Tetap harus mengembalikan query yang
                # sah supaya count=0, bukan daftar kosong tanpa total.
                query = query.in_("id", ["00000000-0000-0000-0000-000000000000"])
            else:
                query = query.in_("id", id_kritis)
        if cari:
            query = query.ilike("nama_item", f"%{cari}%")

        if urut == "jumlah_terbanyak":
            return query.order("jumlah", desc=True)
        if urut == "jumlah_tersedikit":
            return query.order("jumlah")
        return query.order("nama_item")

    if page is None:
        return bangun().execute().data or []
    return _halaman_berpaginan(bangun, page, per_page, response)

@app.get("/api/stock/{stock_id}", response_model=StockResponse, tags=["Stock"])
def get_stock(stock_id: str, _: dict = Depends(require_role("admin", "technician"))):
    result = supabase.from_("stock").select("*").eq("id", stock_id).execute()
    if not result.data:
        raise HTTPException(404, "Item stock tidak ditemukan")
    return result.data[0]

@app.put("/api/stock/{stock_id}", response_model=StockResponse, tags=["Stock"])
def update_stock(stock_id: str, item: StockUpdate, _: dict = Depends(require_role("admin"))):
    data = item.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(400, "Tidak ada data yang diupdate")
    data["last_updated"] = get_now_iso()
    result = supabase.from_("stock").update(data).eq("id", stock_id).execute()
    if not result.data:
        raise HTTPException(404, "Item stock tidak ditemukan")
    return result.data[0]

@app.post("/api/stock/{stock_id}/kurangi", response_model=StockResponse, tags=["Stock"])
def kurangi_stock(stock_id: str, jumlah: int, _: dict = Depends(require_role("admin", "technician"))):
    """Kurangi stok (dipakai teknisi saat memakai bahan)."""
    if jumlah <= 0:
        raise HTTPException(400, "Jumlah harus > 0")
    
    # Ambil stok saat ini
    current = supabase.from_("stock").select("jumlah").eq("id", stock_id).execute()
    if not current.data:
        raise HTTPException(404, "Item stock tidak ditemukan")
    
    stok_sekarang = current.data[0]["jumlah"]
    if stok_sekarang < jumlah:
        raise HTTPException(400, f"Stok tidak cukup. Tersedia: {stok_sekarang}")
    
    baru = stok_sekarang - jumlah
    result = supabase.from_("stock").update({
        "jumlah": baru,
        "last_updated": get_now_iso()
    }).eq("id", stock_id).execute()
    
    return result.data[0]