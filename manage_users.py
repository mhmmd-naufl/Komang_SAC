"""
Kelola akun: lihat daftar user dan reset password.

Password di database tersimpan sebagai hash PBKDF2-SHA256, jadi TIDAK bisa
dibaca balik. Kalau lupa password, satu-satunya cara recover adalah reset
lewat script ini.

Cara pakai:
    python manage_users.py                    # daftar semua akun
    python manage_users.py list               # sama seperti di atas
    python manage_users.py list technician    # filter per role
    python manage_users.py reset 628980570911 "PasswordBaru123"

Role yang tersedia: admin, customer, technician, drop_point
"""

import sys

sys.path.insert(0, ".")

from main import supabase, hash_password, normalize_phone, verify_password  # noqa: E402

# Dikenal lebih dulu supaya bisa ditampilkan di tabel
COBA_PASSWORD = ["password123", "admin123"]

ROLE_LABEL = {
    "admin": "Admin",
    "technician": "Teknisi",
    "customer": "Konsumen",
    "drop_point": "Drop Point",
}


def daftar(role: str | None = None) -> None:
    query = supabase.from_("profiles").select("full_name, phone, role, password_hash, created_at")
    if role:
        if role not in ROLE_LABEL:
            print(f"Role tidak dikenal: {role}")
            print("Pilihan: " + ", ".join(ROLE_LABEL))
            sys.exit(1)
        query = query.eq("role", role)

    rows = query.execute().data or []
    if not rows:
        print("Belum ada akun.")
        return

    rows.sort(key=lambda r: (list(ROLE_LABEL).index(r["role"]) if r["role"] in ROLE_LABEL else 9,
                             r["full_name"]))

    print()
    print(f"{'NAMA':<24}{'NO HP':<15}{'ROLE':<12}{'PASSWORD'}")
    print("-" * 74)

    tanpa_password = 0
    for r in rows:
        stored = r.get("password_hash")
        if not stored:
            ket = "BELUM DI-SET"
            tanpa_password += 1
        else:
            ket = next((p for p in COBA_PASSWORD if verify_password(p, stored)), "(tidak diketahui)")
        print(f"{r['full_name'][:23]:<24}{r['phone']:<15}"
              f"{ROLE_LABEL.get(r['role'], r['role']):<12}{ket}")

    print("-" * 74)
    print(f"{len(rows)} akun")

    if tanpa_password:
        print(f"\n{tanpa_password} akun belum punya password. Set dengan:")
        print("    python manage_users.py reset <no-hp> <password>")

    print("\nCatatan: kolom PASSWORD hanya menampilkan tebakan dari daftar di atas.")
    print("Kalau '(tidak diketahui)', pakai manage_users.py reset.")


def reset(phone: str, password: str) -> None:
    if len(password) < 6:
        print("Password minimal 6 karakter.")
        sys.exit(1)

    norm = normalize_phone(phone)
    found = supabase.from_("profiles").select("id, full_name, role").eq("phone", norm).execute().data

    if not found:
        # Coba format apa adanya (mis. 0812...)
        found = supabase.from_("profiles").select("id, full_name, role").eq("phone", phone).execute().data

    if not found:
        print(f"Tidak ada akun dengan nomor {phone}")
        sys.exit(1)

    user = found[0]
    supabase.from_("profiles").update(
        {"password_hash": hash_password(password), "is_verified": True}
    ).eq("id", user["id"]).execute()

    print(f"Password diperbarui untuk {user['full_name']} ({norm}) — role {user['role']}.")
    print(f"Nomor bisa dipakai login, password: {password}")


if __name__ == "__main__":
    args = sys.argv[1:]

    if not args or args[0] == "list":
        daftar(args[1] if len(args) > 1 else None)
    elif args[0] == "reset":
        if len(args) < 3:
            print("Cara pakai: python manage_users.py reset <no-hp> <password>")
            sys.exit(1)
        reset(args[1], args[2])
    else:
        print("Perintah tidak dikenal.")
        print(__doc__)
        sys.exit(1)