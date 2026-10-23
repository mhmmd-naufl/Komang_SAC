"""
Uji endpoint backend tanpa menjalankan server (in-process via TestClient).

Jalankan dari folder project:
    .\\.venv\\Scripts\\python.exe test_api.py
"""

import os
import sys

# Harus diset SEBELUM import main: rate limit login 5/menit akan menolak
# percobaan keenam, dan test ini memanggil login belasan kali dari IP yang
# sama. Produksi tidak menyentuh variabel ini, jadi tetap terlindungi.
os.environ["RATE_LIMIT_ENABLED"] = "false"

sys.path.insert(0, ".")

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402

PASSWORD = "password123"

client = TestClient(main.app)

passed, failed = 0, 0


def check(label, condition, detail=""):
    global passed, failed
    if condition:
        passed += 1
        print(f"  LULUS  {label}")
    else:
        failed += 1
        print(f"  GAGAL  {label}  {detail}")


def section(title):
    print(f"\n{title}\n" + "-" * len(title))


# =============================================================
section("1. Login per role")

tokens = {}
for phone, role in [
    ("628980570911", "admin"),
    ("628991000001", "technician"),
    ("628981000001", "customer"),
    ("628991000004", "drop_point"),
]:
    r = client.post("/api/auth/login", json={"phone": phone, "password": PASSWORD})
    body = r.json() if r.status_code == 200 else {}
    # backend mengembalikan field "token" (bukan "access_token") -- frontend
    # juga membaca data.token, jadi keduanya harus sama
    ok = r.status_code == 200 and "token" in body
    detail = f"HTTP {r.status_code} {str(r.text)[:90]}"
    check(f"login {role:11} {phone}", ok, detail)
    if ok:
        check(f"  -> respons pakai field 'token'", "access_token" not in body)
        tokens[role] = body["token"]
        got_role = body.get("user", {}).get("role")
        check(f"  -> role terverifikasi = {role}", got_role == role, f"dapat {got_role}")

# id teknisi dummy pertama, dipakai di uji otorisasi
client_tech_id = main.supabase.from_("profiles").select("id").eq("phone", "628991000001").execute().data[0]["id"]

# password salah harus ditolak
r = client.post("/api/auth/login", json={"phone": "628980570911", "password": "salah"})
check("password salah ditolak", r.status_code in (401, 403), f"HTTP {r.status_code}")

# nomor tidak ada
r = client.post("/api/auth/login", json={"phone": "628999999999", "password": PASSWORD})
check("nomor tak dikenal ditolak", r.status_code in (401, 404), f"HTTP {r.status_code}")


# =============================================================
section("2. Tracking publik (tanpa login)")

# ambil kode dari DB langsung
rows = main.supabase.from_("transactions").select("kode,status").execute().data
check("ada transaksi di DB", len(rows) > 0, f"cuma {len(rows)}")

sample = next((r["kode"] for r in rows if r["status"] == "Diproses"), None)
if sample:
    r = client.get(f"/api/transaksi/tracking/{sample}")
    ok = r.status_code == 200 and r.json().get("kode") == sample
    check(f"tracking {sample}", ok, f"HTTP {r.status_code}")
    if ok:
        data = r.json()
        check("  -> info treatment ikut terbaca", bool(data.get("shoes", {}).get("jenis_treatment")),
              str(data.get("shoes"))[:80])
        check("  -> info drop point ikut terbaca", bool(data.get("drop_point", {}).get("nama")),
              str(data.get("drop_point"))[:80])

r = client.get("/api/transaksi/tracking/KS-TIDAKADA")
check("kode ngawur ditolak", r.status_code == 404, f"HTTP {r.status_code}")


# =============================================================
section("3. Otorisasi (RBAC)")

admin_h = {"Authorization": f"Bearer {tokens.get('admin')}"}
cust_h = {"Authorization": f"Bearer {tokens.get('customer')}"}
tech_h = {"Authorization": f"Bearer {tokens.get('technician')}"}

r = client.get("/api/stats/admin", headers=admin_h)
check("admin boleh baca stats", r.status_code == 200, f"HTTP {r.status_code}")

r = client.get("/api/stats/admin", headers=cust_h)
check("konsumen TIDAK boleh baca stats", r.status_code in (401, 403), f"HTTP {r.status_code}")

r = client.get("/api/stats/admin")
check("tanpa token TIDAK boleh baca stats", r.status_code in (401, 403), f"HTTP {r.status_code}")


# =============================================================
section("4. Master data")

r = client.get("/api/sepatu")
check("daftar layanan (public)", r.status_code == 200, f"HTTP {r.status_code}")
if r.status_code == 200:
    n = len(r.json())
    check(f"  -> {n} layanan ter-return", n >= 8, f"cuma {n}")

r = client.get("/api/stock", headers=admin_h)
check("stok (admin)", r.status_code == 200, f"HTTP {r.status_code}")

r = client.get("/api/stock", params={"low_stock": True}, headers=admin_h)
low_ok = r.status_code == 200
check("stok menipis (admin)", low_ok, f"HTTP {r.status_code}")
if low_ok:
    print(f"        item menipis: {[s['nama_item'] for s in r.json()]}")


# =============================================================
section("5. Transaksi (konsumen vs admin)")

r = client.get("/api/transaksi", headers=cust_h)
check("konsumen baca transaksinya", r.status_code == 200, f"HTTP {r.status_code}")
cust_count = len(r.json()) if r.status_code == 200 else 0

r = client.get("/api/transaksi", headers=admin_h)
check("admin baca semua transaksi", r.status_code == 200, f"HTTP {r.status_code}")
admin_count = len(r.json()) if r.status_code == 200 else 0

check("  -> konsumen lihat lebih sedikit dari admin", cust_count < admin_count,
      f"konsumen={cust_count} admin={admin_count}")
print(f"        konsumen={cust_count} transaksi, admin={admin_count} transaksi")


# =============================================================
section("6. Endpoint tertutup harus menolak tanpa login")

# Semua ini dulu TERBUKA. Sekarang harus 401/403.
for method, path in [
    ("GET", "/api/transaksi"),
    ("GET", "/api/users"),
    ("GET", "/api/stock"),
    ("POST", "/api/stock"),
    ("PUT", "/api/stock/00000000-0000-0000-0000-000000000000"),
    ("POST", "/api/sepatu"),
    ("PUT", "/api/sepatu/00000000-0000-0000-0000-000000000000"),
    ("DELETE", "/api/sepatu/00000000-0000-0000-0000-000000000000"),
    ("POST", "/api/drop-points"),
    ("PUT", "/api/drop-points/00000000-0000-0000-0000-000000000000"),
    ("GET", "/api/transaksi/00000000-0000-0000-0000-000000000000"),
    ("PUT", "/api/transaksi/00000000-0000-0000-0000-000000000000/status"),
    ("GET", "/api/expenses"),
    ("POST", "/api/expenses"),
    ("GET", "/api/expenses/rekap-mingguan"),
    ("PUT", "/api/expenses/00000000-0000-0000-0000-000000000000"),
    ("DELETE", "/api/expenses/00000000-0000-0000-0000-000000000000"),
]:
    r = client.request(method, path, json={})
    check(f"{method:6} {path:52}", r.status_code in (401, 403),
          f"HTTP {r.status_code} -- TERBUKA!")


# =============================================================
section("7. Konsumen tidak bisa aksesMilik orang lain")

trx_semua = main.supabase.from_("transactions").select("id,user_id").execute().data
customer_id = main.supabase.from_("profiles").select("id").eq("phone", "628981000001").execute().data[0]["id"]
orang_lain = [t["id"] for t in trx_semua if t["user_id"] != customer_id]

if orang_lain:
    r = client.get(f"/api/transaksi/{orang_lain[0]}", headers=cust_h)
    check("konsumen tidak bisa buka detail milik orang lain",
          r.status_code in (401, 403), f"HTTP {r.status_code}")
else:
    print("        (tidak ada transaksi milik konsumen lain untuk diuji)")

# Filter user_id harus diabaikan untuk non-admin
r = client.get("/api/transaksi", params={"user_id": "00000000-0000-0000-0000-000000000000"}, headers=cust_h)
if r.status_code == 200:
    leaked = any(t["user_id"] == "00000000-0000-0000-0000-000000000000" for t in r.json())
    check("filter user_id diabaikan untuk konsumen", not leaked)
    semua_punya_cust = all(t["user_id"] == customer_id for t in r.json())
    check("  -> semua baris milik konsumen itu sendiri", semua_punya_cust)
else:
    check("filter user_id diabaikan untuk konsumen", False, f"HTTP {r.status_code}")


# =============================================================
section("8. Konsumen tidak bisa ubah status")

diproses = main.supabase.from_("transactions").select("id,status").eq("status", "Diproses").execute().data
if diproses and tokens.get("customer"):
    trx_id = diproses[0]["id"]
    r = client.put(f"/api/transaksi/{trx_id}/status",
                   json={"status": "Selesai", "photo_after": "https://x/p.jpg"}, headers=cust_h)
    check("konsumen DITOLAK saat ubah status", r.status_code in (401, 403),
          f"HTTP {r.status_code} -- BOCOR!")
else:
    print("        (tidak ada transaksi Diproses untuk diuji)")

# Teknisi yang tidak ditugaskan juga harus ditolak
trx_lain = main.supabase.from_("transactions").select("id,tech_id").execute().data
if tokens.get("technician"):
    bukan_saya = [t for t in trx_lain if t.get("tech_id") and t["tech_id"] != client_tech_id]
    if bukan_saya:
        r = client.put(f"/api/transaksi/{bukan_saya[0]['id']}/status",
                       json={"status": "Diperiksa"}, headers=tech_h)
        check("teknisi tidak bisa ubah transaksi teammate", r.status_code in (401, 403),
              f"HTTP {r.status_code} -- BOCOR!")
    else:
        print("        (semua transaksi memang milik teknisi ini)")


# =============================================================
section("9. Endpoint analytics (ringkasan AI)")

# Admin boleh. Fallback pun tetap harus mengembalikan ringkasan yang bisa
# dibaca, karena itu yang membuat halaman dashboard tidak pernah kosong.
if tokens.get("admin"):
    r = client.get("/api/analytics/summary", headers=admin_h)
    check("admin bisa ambil ringkasan analytics", r.status_code == 200,
          f"HTTP {r.status_code}")
    if r.status_code == 200:
        body = r.json()
        check("sumber ringkasan valid", body.get("sumber") in ("ai", "fallback", "error"),
              f"sumber={body.get('sumber')}")
        check("ringkasan tidak kosong", bool((body.get("ringkasan") or "").strip()),
              "ringkasan kosong")
        check("fakta terisi", isinstance(body.get("fakta"), dict) and len(body["fakta"]) > 0,
              "fakta kosong")

# Hanya admin. Ringkasan memuat beban kerja per teknisi, jadi tidak boleh
# bocor ke teknisi, drop point, maupun konsumen.
for role in ("technician", "customer"):
    if tokens.get(role):
        h = {"Authorization": f"Bearer {tokens[role]}"}
        r = client.get("/api/analytics/summary", headers=h)
        check(f"{role} DITOLAK akses analytics", r.status_code in (401, 403),
              f"HTTP {r.status_code} -- BOCOR!")

# Tanpa token sama sekali.
r = client.get("/api/analytics/summary")
check("anon DITOLAK akses analytics", r.status_code in (401, 403),
      f"HTTP {r.status_code} -- BOCOR!")

# Fallback harus tetap jalan walau OpenRouter dimatikan Total.
import analytics as _analytics  # noqa: E402

fakta_uji = _analytics.gather_facts(main.supabase)
teks_fallback = _analytics.rule_based_summary(fakta_uji)
check("rule-based fallback menghasilkan teks", bool(teks_fallback.strip()), "kosong")
check("fallback tidak memuat 'None' atau '{'", "None" not in teks_fallback and "{" not in teks_fallback,
      "ada placeholder yang bocor ke teks")
check("key OpenRouter tidak ikut ke fakta",
      not any("sk-or-v1" in str(v) for v in fakta_uji.values()), "key bocor ke fakta")


# =============================================================
section("10. Teknisi tidak menerima harga & komisi")

# Ini aturan bisnis yang ditegakkan di BACKEND, bukan sekadar disembunyikan
# di UI. Kalau suatu saat ada yang mengubah halaman teknisi, angkanya tetap
# tidak akan sampai ke sana.
if tokens.get("technician"):
    r = client.get("/api/transaksi", headers=tech_h)
    if r.status_code == 200 and r.json():
        baris = r.json()
        ada_harga = [b for b in baris if b.get("harga") is not None]
        ada_komisi = [b for b in baris if b.get("tech_commission") is not None]
        check("harga tidak terkirim ke teknisi", not ada_harga,
              f"{len(ada_harga)} baris masih punya harga -- BOCOR!")
        check("komisi tidak terkirim ke teknisi", not ada_komisi,
              f"{len(ada_komisi)} baris masih punya komisi -- BOCOR!")
        check("data pekerjaan tetap lengkap", all(b.get("kode") for b in baris),
              "kode tracking hilang")
    else:
        check("teknisi bisa ambil daftar tugasnya", False, f"HTTP {r.status_code}")

    # Detail satu transaksi juga harus bebas harga.
    if client_tech_id:
        punya = main.supabase.from_("transactions").select("id").eq("tech_id", client_tech_id).execute().data
        if punya:
            r = client.get(f"/api/transaksi/{punya[0]['id']}", headers=tech_h)
            if r.status_code == 200:
                d = r.json()
                check("detail transaksi teknisi bebas harga",
                      d.get("harga") is None and d.get("tech_commission") is None,
                      "harga/komisi bocor di detail")

# Bandingkan: admin dan konsumen tetap harus menerima harga.
if tokens.get("admin"):
    r = client.get("/api/transaksi", headers=admin_h)
    if r.status_code == 200 and r.json():
        check("admin tetap menerima harga",
              any(b.get("harga") is not None for b in r.json()),
              "harga hilang untuk admin -- regresi!")


# =============================================================
section("11. Privasi pada endpoint update status")

# PUT /status sebelumnya mengembalikan baris mentah dari database, jadi
# teknisi bisa membaca harga & komisi setiap kali ia mengubah status.
# Endpoint itu harus ikut melewati penyaringan peran seperti endpoint lain.
trx_semua = main.supabase.from_("transactions").select("id,tech_id").execute().data or []
# .not_ di postgrest-py adalah properti, bukan method, jadi filter di Python.
trx_dipakai = [t for t in trx_semua if t.get("tech_id")]
teknisi_dasar = next((t for t in trx_dipakai if t["tech_id"] == client_tech_id), None)

if teknisi_dasar and tokens.get("technician"):
    r = client.put(
        f"/api/transaksi/{teknisi_dasar['id']}/status",
        headers=tech_h,
        json={"status": "Diproses"},
    )
    if r.status_code == 200:
        body = r.json()
        check("update status tidak mengirim harga ke teknisi", body.get("harga") is None, f"harga={body.get('harga')}")
        check("update status tidak mengirim komisi ke teknisi",
              body.get("tech_commission") is None, f"komisi={body.get('tech_commission')}")
    else:
        # 400/403 juga sah (mis. aturan foto-after atau transaksi bukan tugasnya),
        # yang penting bukan 200 dengan harga di dalamnya.
        check("update status oleh teknisi ditolak atau tersaring",
              r.status_code in (400, 403), f"HTTP {r.status_code}")

if teknisi_dasar and tokens.get("admin"):
    r = client.put(
        f"/api/transaksi/{teknisi_dasar['id']}/status",
        headers=admin_h,
        json={"status": "Diproses"},
    )
    check("admin tetap menerima harga di respons update status",
          r.status_code == 200 and r.json().get("harga") is not None,
          f"HTTP {r.status_code} harga={r.json().get('harga') if r.status_code == 200 else '-'}")


# =============================================================
section("12. Paginasi: header dan clamping")

if tokens.get("admin"):
    r = client.get("/api/transaksi", headers=admin_h, params={"page": 1, "per_page": 5})
    total = int(r.headers.get("x-total-count", 0))
    check("X-Total-Count terbaca", total > 0, f"total={total}")
    check("jumlah baris sesuai per_page", len(r.json()) == 5, f"baris={len(r.json())}")
    check("X-Total-Pages = ceil(total / per_page)",
          r.headers.get("x-total-pages") == str(max(1, -(-total // 5))),
          f"header={r.headers.get('x-total-pages')}")

    # Halaman 1 dan halaman terakhir tidak boleh saling tumpang tindih.
    per_page = 5
    jml_halaman = max(1, -(-total // per_page))
    if jml_halaman > 1:
        p1 = client.get("/api/transaksi", headers=admin_h, params={"page": 1, "per_page": per_page})
        p2 = client.get("/api/transaksi", headers=admin_h,
                        params={"page": jml_halaman, "per_page": per_page})
        kode1 = {b["id"] for b in p1.json()}
        kode2 = {b["id"] for b in p2.json()}
        check("halaman 1 dan halaman terakhir tidak overlap", not (kode1 & kode2),
              f"irisan={len(kode1 & kode2)}")

    # Halaman jauh: PostgREST melempar PGRST103 kalau offset melewati total.
    # Backend harus clamp, bukan 500.
    r = client.get("/api/transaksi", headers=admin_h, params={"page": 999, "per_page": 5})
    check("halaman di luar jangkauan tidak error", r.status_code == 200, f"HTTP {r.status_code}")
    check("halaman di-clamp ke nilai valid", r.headers.get("x-page") == str(jml_halaman),
          f"x-page={r.headers.get('x-page')}")

    # Tanpa parameter page, perilaku lama harus utuh (seluruh baris).
    r = client.get("/api/transaksi", headers=admin_h)
    check("tanpa 'page' mengembalikan semua baris (perilaku lama)",
          len(r.json()) == total, f"baris={len(r.json())} total={total}")


# =============================================================
section("13. Paginasi: pencarian & filter")

if tokens.get("admin"):
    kode_semua = main.supabase.from_("transactions").select("kode").execute().data or []
    kode_ada = [k for k in kode_semua if k.get("kode")]
    if kode_ada:
        kode = kode_ada[0]["kode"]
        r = client.get("/api/transaksi", headers=admin_h, params={"q": kode, "page": 1, "per_page": 10})
        check("cari kode tracking menemukan 1 baris",
              r.headers.get("x-total-count") == "1", f"count={r.headers.get('x-total-count')}")

    # Karakter yang merusak logic tree PostgREST harus tetap aman.
    for jahat in ["a, b", "60 (besar)", 'kutip"di', "100%", "a\\b"]:
        r = client.get("/api/transaksi", headers=admin_h, params={"q": jahat, "page": 1})
        check(f"pencarian withstand input berbahaya {jahat!r}", r.status_code == 200, f"HTTP {r.status_code}")

    for status in ["Diterima", "Diproses", "Diperiksa", "Selesai", "Siap diambil"]:
        r = client.get("/api/transaksi", headers=admin_h, params={"status": status, "page": 1, "per_page": 50})
        benar = r.status_code == 200 and all(b["status"] == status for b in r.json())
        check(f"filter status {status!r}", benar, f"HTTP {r.status_code}")

    for urut in ["terbaru", "terlama", "nilai_tinggi", "nilai_rendah"]:
        r = client.get("/api/transaksi", headers=admin_h, params={"urut": urut, "page": 1})
        check(f"urut {urut!r} jalan", r.status_code == 200 and len(r.json()) > 0, f"HTTP {r.status_code}")

    # Filter low_stock harus sinkron dengan total, kalau tidak paginasinya bohong.
    semua = client.get("/api/stock", headers=admin_h, params={"page": 1, "per_page": 100})
    kritis = client.get("/api/stock", headers=admin_h, params={"low_stock": True, "page": 1, "per_page": 100})
    if kritis.status_code == 200 and semua.status_code == 200:
        check("low_stock: total = jumlah item kritis",
              kritis.headers.get("x-total-count") == str(len(kritis.json())),
              f"count={kritis.headers.get('x-total-count')} baris={len(kritis.json())}")
        check("low_stock: semua memang menyentuh batas minimum",
              all(b["jumlah"] <= b["batas_minimum"] for b in kritis.json()))

    r = client.get("/api/users", headers=admin_h, params={"role": "technician", "page": 1, "per_page": 5})
    check("filter peran pengguna", r.status_code == 200 and all(b["role"] == "technician" for b in r.json()),
          f"HTTP {r.status_code}")

    # Katalog publik tidak boleh ikut terpaginasikan secara diam-diam.
    r = client.get("/api/sepatu")
    check("katalog publik tetap terbuka tanpa token", r.status_code == 200, f"HTTP {r.status_code}")
    check("katalog publik hanya menampilkan yang aktif",
          all(b["status"] for b in r.json()), "ada master nonaktif bocor ke publik")
    r = client.get("/api/sepatu", params={"aktif_only": False, "page": 1, "per_page": 5})
    check("katalog bisa melihat master nonaktif untuk admin",
          r.status_code == 200 and r.headers.get("x-total-count") is not None, f"HTTP {r.status_code}")

    # Tiga jalur filter status master sepatu. Panel admin punya tab
    # Semua / Aktif / Nonaktif, masing-masing harus benar.
    semua = client.get("/api/sepatu", params={"aktif_only": False, "page": 1, "per_page": 100})
    hanya_aktif = client.get("/api/sepatu", params={"page": 1, "per_page": 100})
    hanya_nonaktif = client.get("/api/sepatu", params={"cari_status": False, "page": 1, "per_page": 100})

    if semua.status_code == 200 and hanya_aktif.status_code == 200 and hanya_nonaktif.status_code == 200:
        n_nonaktif = len(hanya_nonaktif.json())
        check("tab 'Semua' mencakup master nonaktif",
              len(semua.json()) >= len(hanya_aktif.json()),
              f"semua={len(semua.json())} aktif={len(hanya_aktif.json())}")
        check("tab 'Nonaktif' hanya berisi yang statusnya false",
              all(b["status"] is False for b in hanya_nonaktif.json()), f"n={n_nonaktif}")
        check("total tab Aktif + Nonaktif = tab Semua",
              len(hanya_aktif.json()) + n_nonaktif == len(semua.json()),
              f"{len(hanya_aktif.json())} + {n_nonaktif} != {len(semua.json())}")


# =============================================================
section("14. Relasi nama di respons transaksi")

if tokens.get("admin"):
    r = client.get("/api/transaksi", headers=admin_h, params={"page": 1, "per_page": 50})
    berteknisi = [b for b in r.json() if b.get("tech_id")]
    if berteknisi:
        check("nama teknisi ikut di respons", bool(berteknisi[0].get("tech", {}).get("full_name")),
              str(berteknisi[0].get("tech")))
    check("nama sepatu ikut di respons", bool(r.json()[0].get("shoe", {}).get("merk")),
          str(r.json()[0].get("shoe")))


# =============================================================
section("15. Master sepatu tidak bisa dihapus saat terpakai")

if tokens.get("admin"):
    terpakai = main.supabase.from_("transactions").select("shoe_id").limit(1).execute().data or []
    if terpakai:
        # Foreign key PostgreSQL menolak penghapusan; backend harus
        # menerjemahkannya jadi 409 yang bisa dibaca, bukan 500.
        r = client.delete(f"/api/sepatu/{terpakai[0]['shoe_id']}", headers=admin_h)
        check("hapus master yang terpakai transaksi ditolak dengan 409",
              r.status_code == 409, f"HTTP {r.status_code}")
        if r.status_code == 409:
            check("pesan 409 berbahasa Indonesia yang jelas",
                  "transaksi" in r.json().get("detail", "").lower(), str(r.json())[:120])


# =============================================================
section("16. Pengeluaran (expenses): CRUD, RBAC, validasi")

if tokens.get("admin"):
    # Kategori dinormalisasi lowercase: "Listrik" dan "listrik" harus jadi satu.
    r = client.post("/api/expenses", headers=admin_h,
                    json={"kategori": "Listrik", "jumlah": 100000, "keterangan": "Token mingguan"})
    check("admin bisa mencatat pengeluaran", r.status_code == 201, f"HTTP {r.status_code}")
    exp_id = None
    if r.status_code == 201:
        body = r.json()
        exp_id = body.get("id")
        check("kategori dinormalisasi lowercase", body.get("kategori") == "listrik",
              f"kategori={body.get('kategori')}")
        check("tanggal default = hari ini", bool(body.get("tanggal")), "tanggal kosong")

    # Validasi: jumlah nol/negatif dan tanggal masa depan harus ditolak.
    r = client.post("/api/expenses", headers=admin_h, json={"kategori": "pdam", "jumlah": 0})
    check("jumlah 0 ditolak", r.status_code == 422, f"HTTP {r.status_code}")
    r = client.post("/api/expenses", headers=admin_h,
                    json={"kategori": "pdam", "jumlah": 50000, "tanggal": "2999-01-01"})
    check("tanggal masa depan ditolak", r.status_code == 400, f"HTTP {r.status_code}")

    # Daftar + filter kategori.
    r = client.get("/api/expenses", headers=admin_h, params={"kategori": "listrik", "page": 1})
    if r.status_code == 200:
        check("filter kategori hanya mengembalikan kategori itu",
              all(b["kategori"] == "listrik" for b in r.json()), str(r.json())[:100])
    else:
        check("daftar pengeluaran terbaca", False, f"HTTP {r.status_code}")

    # Rekap mingguan: minggu ini harus memuat pengeluaran yang baru dicatat.
    r = client.get("/api/expenses/rekap-mingguan", headers=admin_h)
    check("rekap mingguan terbaca", r.status_code == 200, f"HTTP {r.status_code}")
    if r.status_code == 200:
        body = r.json()
        check("riwayat berisi 8 slot minggu", len(body.get("riwayat", [])) == 8,
              f"n={len(body.get('riwayat', []))}")
        check("pengeluaran baru masuk minggu ini",
              body.get("minggu_ini", {}).get("total", 0) >= 100000,
              f"total={body.get('minggu_ini', {}).get('total')}")

    # Koreksi lalu hapus catatan uji supaya tidak mengotori rekap asli.
    if exp_id:
        r = client.put(f"/api/expenses/{exp_id}", headers=admin_h, json={"jumlah": 125000})
        check("admin bisa mengoreksi pengeluaran",
              r.status_code == 200 and r.json().get("jumlah") == 125000, f"HTTP {r.status_code}")
        r = client.delete(f"/api/expenses/{exp_id}", headers=admin_h)
        check("admin bisa menghapus pengeluaran", r.status_code == 204, f"HTTP {r.status_code}")

# Data finansial: teknisi dan konsumen tidak boleh membaca sama sekali.
for role in ("technician", "customer"):
    if tokens.get(role):
        h = {"Authorization": f"Bearer {tokens[role]}"}
        r = client.get("/api/expenses", headers=h)
        check(f"{role} DITOLAK baca pengeluaran", r.status_code in (401, 403),
              f"HTTP {r.status_code} -- BOCOR!")


# =============================================================
section("17. Config publik & metode pembayaran")

r = client.get("/api/config")
check("config publik terbaca tanpa login", r.status_code == 200, f"HTTP {r.status_code}")
if r.status_code == 200:
    body = r.json()
    check("accepted_payments berisi daftar", isinstance(body.get("accepted_payments"), list),
          str(body.get("accepted_payments")))

    # BUSINESS_PHONE wajib diisi di deployment sungguhan, tapi CI memakai .env
    # minimal (cuma service_role + JWT), jadi di sana memang tidak ada nomor
    # bisnis. Yang selalu diuji di sini adalah KONTRAKNYA: endpoint harus
    # memantulkan nilai BUSINESS_PHONE apa adanya -- tidak mengarang, dan
    # tidak membocorkan nomor lain. Kalau env-nya memang diisi, emptiness
    # ikut diperiksa.
    phone_env = os.getenv("BUSINESS_PHONE", "").strip()
    check("config memantulkan BUSINESS_PHONE dari env",
          body.get("business_phone") == phone_env,
          f"config={body.get('business_phone')!r} env={phone_env!r}")
    if phone_env:
        check("nomor WA bisnis ikut", bool(body.get("business_phone")), "business_phone kosong")

# Metode bayar ngawur harus ditolak SEBELUM ada baris yang tertulis.
# Uji ini sengaja hanya memakai metode yang pasti ditolak supaya tidak
# menulis transaksi baru ke database.
if tokens.get("customer"):
    sepatu = client.get("/api/sepatu").json()
    if sepatu:
        r = client.post("/api/transaksi", headers=cust_h, json={
            "shoe_id": sepatu[0]["id"],
            "payment_method": "bitcoin",
        })
        check("metode bayar tak dikenal ditolak 400", r.status_code == 400, f"HTTP {r.status_code}")


# =============================================================
section("18. Estimasi layanan & booking grup (multi-pasang)")

r = client.get("/api/sepatu")
if r.status_code == 200 and r.json():
    check("katalog publik membawa estimasi_hari", "estimasi_hari" in r.json()[0],
          f"kunci={sorted(r.json()[0].keys())[:8]}...")

# Endpoint grup: format salah -> 400, UUID valid tapi tidak ada -> 404.
r = client.get("/api/transaksi/grup/bukan-uuid")
check("grup_id ngawur ditolak 400", r.status_code == 400, f"HTTP {r.status_code}")
r = client.get("/api/transaksi/grup/00000000-0000-0000-0000-000000000000")
check("grup kosong -> 404 (bukan 500)", r.status_code == 404, f"HTTP {r.status_code}")

# Konsumen boleh memfilter transaksinya berdasarkan grup; grup milik orang
# lain tetap tidak bocor karena scope role diterapkan lebih dulu.
if tokens.get("customer"):
    r = client.get("/api/transaksi", headers=cust_h,
                   params={"grup_id": "00000000-0000-0000-0000-000000000000"})
    check("filter grup milik sendiri -> 200 dan kosong",
          r.status_code == 200 and r.json() == [], f"HTTP {r.status_code}")


# =============================================================
section("19. Ganti pengerja & komisi per role (admin mengerjakan sendiri = 0)")

# Id-butuh: admin login, teknisi dummy, dan satu layanan master.
admin_id = (
    main.supabase.from_("profiles").select("id").eq("phone", "628980570911").execute().data[0]["id"]
)
if "admin" in tokens and admin_id and client_tech_id:
    layanan = client.get("/api/sepatu").json()
    r = client.post(
        "/api/transaksi",
        headers=admin_h,
        json={
            "user_id": main.supabase.from_("profiles").select("id").eq("phone", "628981000001").execute().data[0]["id"],
            "shoe_id": layanan[0]["id"],
        },
    )
    ok = r.status_code == 201
    check("admin buat transaksi uji", ok, f"HTTP {r.status_code} {str(r.text)[:90]}")
    if ok:
        trx = r.json()
        trx_id = trx["id"]

        # Tanpa pengerja saat lahir -> komisi 0, bukan komisi menggantung.
        check("transaksi baru tanpa teknisi -> komisi 0", trx.get("tech_commission") == 0,
              f"komisi={trx.get('tech_commission')}")

        # Titip id konsumen sebagai pengerja harus ditolak (400), bukan disimpan.
        cust_id = main.supabase.from_("profiles").select("id").eq("phone", "628981000001").execute().data[0]["id"]
        r = client.put(f"/api/transaksi/{trx_id}", headers=admin_h, json={"tech_id": cust_id})
        check("pengerja ber-role konsumen ditolak 400", r.status_code == 400, f"HTTP {r.status_code}")

        # Admin menandai dirinya sendiri -> komisi 0 walau harga sudah ada.
        r = client.put(f"/api/transaksi/{trx_id}", headers=admin_h, json={"tech_id": admin_id})
        ok = r.status_code == 200
        check("admin assign diri sendiri", ok, f"HTTP {r.status_code} {str(r.text)[:90]}")
        if ok:
            check("  -> komisi admin sendiri = 0", r.json().get("tech_commission") == 0,
                  f"komisi={r.json().get('tech_commission')}")
            check("  -> tech_id terpasang ke admin", r.json().get("tech_id") == admin_id)

        # Final harga saat pengerja = admin: komisi tetap 0.
        harga_final = int(trx.get("harga") or 0)
        if harga_final:
            r = client.put(f"/api/transaksi/{trx_id}/harga", headers=admin_h, json={"harga": harga_final})
            ok = r.status_code == 200
            check("final harga saat pengerja admin", ok, f"HTTP {r.status_code} {str(r.text)[:90]}")
            if ok:
                check("  -> komisi tetap 0 setelah final harga", r.json().get("tech_commission") == 0,
                      f"komisi={r.json().get('tech_commission')}")

        # Ganti ke teknisi biasa -> komisi hidup lagi, sesuai persen aktif.
        r = client.put(f"/api/transaksi/{trx_id}", headers=admin_h, json={"tech_id": client_tech_id})
        ok = r.status_code == 200
        check("reassign ke teknisi", ok, f"HTTP {r.status_code} {str(r.text)[:90]}")
        if ok and harga_final:
            harapan = main.calculate_commission(harga_final)
            check("  -> komisi teknisi = potongan standard", r.json().get("tech_commission") == harapan,
                  f"komisi={r.json().get('tech_commission')}, harapan={harapan}")

        # Kosongkan pengerja -> komisi nol lagi.
        r = client.put(f"/api/transaksi/{trx_id}", headers=admin_h, json={"tech_id": ""})
        ok = r.status_code == 200
        check("kosongkan pengerja via tech_id=''", ok, f"HTTP {r.status_code} {str(r.text)[:90]}")
        if ok:
            check("  -> komisi kembali 0", r.json().get("tech_commission") == 0,
                  f"komisi={r.json().get('tech_commission')}")
            check("  -> tech_id jadi null", r.json().get("tech_id") is None,
                  f"tech_id={r.json().get('tech_id')}")

        # Rapikan: transaksi uji dihapus supaya staging tidak berantakan.
        main.supabase.from_("transactions").delete().eq("id", trx_id).execute()
        sisa = main.supabase.from_("transactions").select("id").eq("id", trx_id).execute().data
        check("transaksi uji dibersihkan", not sisa, f"masih ada {len(sisa)}")
else:
    check("prasyarat seksi 19 tersedia", False, "login admin / id teknisi / id admin kurang")


# =============================================================
section("20. Hapus akun (admin)")

if tokens.get("admin"):
    # Hapus akun sendiri: ditolak. Outlet tidak boleh bisa di-kunci-diri
    # lewat satu klik.
    r = client.delete(f"/api/users/{admin_id}", headers=admin_h)
    check("hapus akun sendiri ditolak 400", r.status_code == 400, f"HTTP {r.status_code} {str(r.text)[:90]}")

    # Role lain tidak boleh memanggil penghapusan akun.
    if tokens.get("technician"):
        r = client.delete(f"/api/users/{admin_id}", headers=tech_h)
        check("teknisi tidak boleh hapus akun", r.status_code in (401, 403), f"HTTP {r.status_code}")

    # Profil bersih (tanpa riwayat) boleh dihapus, dan hilang dari GET.
    r = client.post(
        "/api/users",
        headers=admin_h,
        json={"full_name": "Uji Hapus Akun", "phone": "628991900021", "role": "technician"},
    )
    if r.status_code == 201:
        uid = r.json()["id"]
        r = client.delete(f"/api/users/{uid}", headers=admin_h)
        check("profil tanpa transaksi bisa dihapus", r.status_code == 204, f"HTTP {r.status_code}")
        r = client.get(f"/api/users/{uid}", headers=admin_h)
        check("profil uji hilang setelah dihapus", r.status_code == 404, f"HTTP {r.status_code}")
    else:
        check("buat profil uji (bersih)", False, f"HTTP {r.status_code} {str(r.text)[:90]}")

    # Profil yang sudah punya transaksi DITOLAK -- riwayat jangan kehilangan
    # pemiliknya. Setelah transaksinya dibersihkan, penghapusan malah jalan.
    r = client.post(
        "/api/users",
        headers=admin_h,
        json={"full_name": "Uji Hapus Dua", "phone": "628991900022", "role": "customer"},
    )
    if r.status_code == 201:
        uid2 = r.json()["id"]
        layanan = client.get("/api/sepatu").json()
        trx = client.post(
            "/api/transaksi", headers=admin_h,
            json={"user_id": uid2, "shoe_id": layanan[0]["id"]},
        )
        if trx.status_code == 201:
            r = client.delete(f"/api/users/{uid2}", headers=admin_h)
            check("akun yang punya transaksi ditolak 400", r.status_code == 400,
                  f"HTTP {r.status_code} {str(r.text)[:100]}")
            main.supabase.from_("transactions").delete().eq("id", trx.json()["id"]).execute()
        else:
            check("buat transaksi uji", False, f"HTTP {trx.status_code}")
        r = client.delete(f"/api/users/{uid2}", headers=admin_h)
        check("hapus jalan setelah transaksinya dibersihkan", r.status_code == 204,
              f"HTTP {r.status_code}")
    else:
        check("buat profil uji (punya transaksi)", False, f"HTTP {r.status_code} {str(r.text)[:90]}")
else:
    check("login admin tersedia untuk seksi 20", False, "token admin tidak ada")


# =============================================================
section("21. Ganti layanan transaksi (salah treatment di web)")

if tokens.get("admin") and admin_id:
    layanan = client.get("/api/sepatu").json()
    if len(layanan) >= 2:
        awal, ganti = layanan[0], layanan[-1]
        if awal["id"] == ganti["id"]:
            # Pricelist hanya satu baris? Pakai dua-duanya saja untuk uji.
            ganti = awal
        dasar_baru = ganti.get("harga_min") or ganti["harga_cuci"]

        r = client.post(
            "/api/transaksi",
            headers=admin_h,
            json={
                "user_id": main.supabase.from_("profiles").select("id").eq("phone", "628981000001").execute().data[0]["id"],
                "shoe_id": awal["id"],
            },
        )
        if r.status_code == 201:
            trx_id = r.json()["id"]
            check("transaksi uji dibuat", True)

            # Teknisi tidak boleh mengganti layanan -- urusan harga/layanan
            # adalah domain admin.
            r = client.put(f"/api/transaksi/{trx_id}", headers=tech_h, json={"shoe_id": ganti["id"]})
            check("teknisi tidak boleh ganti layanan", r.status_code in (401, 403), f"HTTP {r.status_code}")

            # Admin ganti layanan -> harga reset ke master baru, komisi tetap
            # cocok (tanpa pengerja -> 0).
            r = client.put(f"/api/transaksi/{trx_id}", headers=admin_h, json={"shoe_id": ganti["id"]})
            ok = r.status_code == 200
            check("admin ganti layanan", ok, f"HTTP {r.status_code} {str(r.text)[:90]}")
            if ok:
                check("  -> harga ikut master layanan baru", r.json().get("harga") == dasar_baru,
                      f"harga={r.json().get('harga')}, dasar={dasar_baru}")
                check("  -> shoe_id berubah", r.json().get("shoe_id") == ganti["id"])

            # Ganti layanan + pengerja sekaligus: dasar harga dari layanan
            # baru, siapa yang berhak dari pengerja baru.
            if ok:
                r = client.put(
                    f"/api/transaksi/{trx_id}",
                    headers=admin_h,
                    json={"shoe_id": awal["id"], "tech_id": client_tech_id},
                )
                if r.status_code == 200:
                    dasar_awal = awal.get("harga_min") or awal["harga_cuci"]
                    check("ganti layanan + pengerja sekaligus", True)
                    harapan = main.calculate_commission(dasar_awal)
                    check("  -> harga dasar layanan baru", r.json().get("harga") == dasar_awal,
                          f"harga={r.json().get('harga')} vs {dasar_awal}")
                    check("  -> komisi dari harga layanan baru x pengerja baru",
                          r.json().get("tech_commission") == harapan,
                          f"komisi={r.json().get('tech_commission')}, harapan={harapan}")
                else:
                    check("ganti layanan + pengerja sekaligus", False, f"HTTP {r.status_code}")

            # Master ngawur ditolak, string kosong ditolak.
            r = client.put(f"/api/transaksi/{trx_id}", headers=admin_h,
                           json={"shoe_id": "00000000-0000-0000-0000-000000000000"})
            check("layanan tak dikenal ditolak", r.status_code in (400, 404), f"HTTP {r.status_code}")
            r = client.put(f"/api/transaksi/{trx_id}", headers=admin_h, json={"shoe_id": ""})
            check("layanan kosong ditolak", r.status_code == 400, f"HTTP {r.status_code}")

            # Status "Siap diambil" = uang sudah masuk: layanan terkunci.
            main.supabase.from_("transactions").update(
                {"status": "Siap diambil"}
            ).eq("id", trx_id).execute()
            r = client.put(f"/api/transaksi/{trx_id}", headers=admin_h, json={"shoe_id": ganti["id"]})
            check("ganti layanan saat Siap diambil ditolak 400", r.status_code == 400,
                  f"HTTP {r.status_code} {str(r.text)[:90]}")

            main.supabase.from_("transactions").delete().eq("id", trx_id).execute()
        else:
            check("buat transaksi uji (seksi 21)", False, f"HTTP {r.status_code} {str(r.text)[:90]}")
    else:
        check("pricelist punya >= 2 layanan", False, f"cuma {len(client.get('/api/sepatu').json())}")
else:
    check("prasyarat seksi 21", False, "token admin / id teknisi tidak ada")


# =============================================================
print("\n" + "=" * 52)
print(f"HASIL: {passed} lulus, {failed} gagal")
print("=" * 52)
sys.exit(1 if failed else 0)