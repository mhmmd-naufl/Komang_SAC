"""
Uji endpoint backend tanpa menjalankan server (in-process via TestClient).

Jalankan dari folder project:
    .\\.venv\\Scripts\\python.exe test_api.py
"""

import sys

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
print("\n" + "=" * 52)
print(f"HASIL: {passed} lulus, {failed} gagal")
print("=" * 52)
sys.exit(1 if failed else 0)