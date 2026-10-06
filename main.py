import os
import secrets
import hmac
import hashlib
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI, HTTPException, status, Depends, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
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

# --- Shoes (Master Sepatu & Treatment) ---
class ShoeBase(BaseModel):
    merk: str
    model: Optional[str] = None
    harga_cuci: int
    jenis_treatment: Optional[str] = Field(None, pattern="^(Standar|Premium|Steri|Waterproof)$")
    keterangan_treatment: Optional[str] = None
    status: bool = True

class ShoeCreate(ShoeBase):
    pass

class ShoeUpdate(BaseModel):
    merk: Optional[str] = None
    model: Optional[str] = None
    harga_cuci: Optional[int] = None
    jenis_treatment: Optional[str] = Field(None, pattern="^(Standar|Premium|Steri|Waterproof)$")
    keterangan_treatment: Optional[str] = None
    status: Optional[bool] = None

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
    defect_notes: Optional[str] = None

class CustomerContact(BaseModel):
    """Kontak pelanggan. Hanya dikirim ke admin dan drop point."""
    id: str
    full_name: str
    phone: str


class ShoeBrief(BaseModel):
    """Ringkasan master sepatu yang menempel di transaksi."""
    id: str
    merk: str
    model: Optional[str] = None
    jenis_treatment: Optional[str] = None


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
    defect_notes: Optional[str] = None
    catatan_konsumen: Optional[str] = None
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

class StatsResponse(BaseModel):
    total_transaksi: int
    shoes_washed: int
    total_pendapatan: int
    total_teknisi: int
    per_teknisi: List[TechnicianIncome]
    per_status: dict


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

@app.get("/api/stats/admin", response_model=StatsResponse, tags=["Stats"])
def admin_stats(_: dict = Depends(require_role("admin"))):
    trx = supabase.from_("transactions").select("harga, tech_commission, tech_id, status").execute().data or []
    techs = supabase.from_("profiles").select("id, full_name").eq("role", "technician").execute().data or []

    per_status: dict = {}
    by_tech: dict = {}

    for row in trx:
        per_status[row["status"]] = per_status.get(row["status"], 0) + 1

        tech_id = row.get("tech_id")
        if tech_id:
            agg = by_tech.setdefault(tech_id, {"jumlah": 0, "komisi": 0})
            agg["jumlah"] += 1
            agg["komisi"] += row.get("tech_commission") or 0

    return {
        "total_transaksi": len(trx),
        "shoes_washed": sum(per_status.values()),
        "total_pendapatan": sum(r.get("harga") or 0 for r in trx),
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
    }


class AnalyticsResponse(BaseModel):
    ringkasan: str
    sumber: str = Field(..., description="'ai' atau 'fallback'")
    model: Optional[str] = None
    catatan: Optional[str] = None
    fakta: dict


@app.get("/api/analytics/summary", response_model=AnalyticsResponse, tags=["Analytics"])
def analytics_summary(_: dict = Depends(require_role("admin"))):
    """
    Ringkasan bisnis + angka agregat untuk dashboard admin.

    Admin-only dengan sengaja: fakta di sini termasuk beban kerja per teknisi,
    jadi tidak boleh bocor ke teknisi, drop point, atau konsumen.

    Kalau OpenRouter sedang tidak tersedia, endpoint ini tetap mengembalikan
    ringkasan yang dihitung dari data langsung (sumber='fallback'). Frontend
    menampilkan catatan penyebabnya, jadi tidak pernah menampilkan string kosong.
    """
    try:
        return analytics.build_summary(supabase)
    except Exception as exc:  # noqa: BLE001
        # Analytics tidak boleh menjatuhkan dashboard. Kembalikan fakta kosong
        # beserta pesan, supaya UI masih bisa menampilkan sesuatu yang jelas.
        return {
            "ringkasan": (
                "Ringkasan otomatis belum bisa dihitung saat ini. "
                "Data dashboard di bawah tetap bisa dibaca normal."
            ),
            "sumber": "error",
            "model": None,
            "catatan": f"Gagal menghitung analytics: {type(exc).__name__}.",
            "fakta": {},
        }


# ==========================================
# CRUD SEPATU (SHOES) - Master Data & Price List
# ==========================================

@app.post("/api/sepatu", response_model=ShoeResponse, status_code=status.HTTP_201_CREATED, tags=["Sepatu"])
def create_sepatu(sepatu: ShoeCreate, _: dict = Depends(require_role("admin"))):
    data = sepatu.model_dump()
    data["created_at"] = get_now_iso()
    try:
        result = supabase.from_("shoes").insert(data).execute()
        if not result.data:
            raise HTTPException(500, "Gagal menambah sepatu")
        return result.data[0]
    except Exception as e:
        raise HTTPException(500, f"Database error: {str(e)}")

@app.get("/api/sepatu", response_model=List[ShoeResponse], tags=["Sepatu"])
def list_sepatu(
    response: Response,
    aktif_only: bool = True,
    q: Optional[str] = None,
    page: Optional[int] = None,
    per_page: Optional[int] = None,
):
    """
    Master sepatu. Tetap publik: daftar harga memang meant dibaca siapa saja,
    dan endpoint ini sudah terbuka sejak awal.

    `aktif_only` default True supaya katalog publik tidak menampilkan layanan
    yang dinonaktifkan. Panel admin mengirim `aktif_only=false` supaya bisa
    melihat dan menghidupkan kembali layanan nonaktif.

    Tanpa `page`, seluruh baris dikembalikan (perilaku lama).
    """
    cari = _cari_teks(q)

    def bangun() -> object:
        query = supabase.from_("shoes").select("*", count="exact")
        if aktif_only:
            query = query.eq("status", True)
        if cari:
            query = query.or_(
                ",".join([_pola_ilike("merk", cari), _pola_ilike("model", cari)])
            )
        return query.order("merk")

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
    data = sepatu.model_dump(exclude_unset=True)
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
    shoe = supabase.from_("shoes").select("id, harga_cuci, status").eq("id", data["shoe_id"]).execute()
    if not shoe.data:
        raise HTTPException(400, "Layanan tidak ditemukan")
    if not shoe.data[0]["status"]:
        raise HTTPException(400, "Layanan ini sedang tidak tersedia")
    data["harga"] = shoe.data[0]["harga_cuci"]

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
    kolom = (
        "*,"
        "shoe:shoes(id, merk, model, jenis_treatment),"
        "tech:profiles!transactions_tech_id_fkey(id, full_name)"
    )

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
        .select("*, shoes(merk, model, jenis_treatment), drop_points(nama, alamat, wa_contact)")
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
        "catatan_konsumen": trx.get("catatan_konsumen"),
        "photo_before": trx.get("photo_before"),
        "photo_after": trx.get("photo_after"),
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


# ==========================================
# CRUD PROFILES (USERS)
# ==========================================

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