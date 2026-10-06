"""
Sekali jalan: set password untuk akun admin (atau buat admin baru).

Cara pakai:
    python bootstrap_admin.py                    # pakai default: 628980570911 / admin123
    python bootstrap_admin.py 628980570911 "PasswordKuat123"

Setelah selesai, hapus password ini dari catatan publik & ganti lagi dari UI.
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import main lebih dulu: main memuat .env dan memvalidasi konfigurasi.
# Client Supabase dipakai ulang dari main supaya tidak ada duplikasi.
from main import supabase, hash_password, normalize_phone, get_now_iso  # noqa: E402


def main() -> None:
    phone = normalize_phone(sys.argv[1] if len(sys.argv) > 1 else "628980570911")
    password = sys.argv[2] if len(sys.argv) > 2 else "admin123"

    if len(password) < 6:
        raise SystemExit("Password minimal 6 karakter.")

    existing = supabase.from_("profiles").select("*").eq("phone", phone).execute()
    if existing.data:
        supabase.from_("profiles").update(
            {"password_hash": hash_password(password), "is_verified": True}
        ).eq("phone", phone).execute()
        print(f"Password diperbarui untuk {existing.data[0]['full_name']} ({phone}).")
    else:
        supabase.from_("profiles").insert(
            {
                "full_name": "Admin Komang SAC",
                "phone": phone,
                "password_hash": hash_password(password),
                "role": "admin",
                "is_verified": True,
                "created_at": get_now_iso(),
            }
        ).execute()
        print(f"Admin dibuat: {phone} / {password}")

    print("Selesai. Silakan login di /login")


if __name__ == "__main__":
    main()
