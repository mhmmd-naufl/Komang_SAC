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
print("\n" + "=" * 52)
print(f"HASIL: {passed} lulus, {failed} gagal")
print("=" * 52)
sys.exit(1 if failed else 0)