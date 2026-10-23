"""Lihat ringkas siapa saja akun & drop point di database (tanpa data sensitif)."""
import os
from collections import Counter

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
url = os.getenv("SUPABASE_URL", "https://cssajztordwhsqaonzgn.supabase.co")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")
c = create_client(url, key)

prof = c.from_("profiles").select("id, full_name, phone, role").execute().data or []
dp = c.from_("drop_points").select("nama, alamat, wa_contact, aktif").execute().data or []

print("PROFIL (%d):" % len(prof))
for p in prof:
    print("  %-9s | %-24r | %s" % (p["role"], p["full_name"], p["phone"]))
print("DROP POINTS (%d):" % len(dp))
for d in dp:
    print("  %-24r | alamat=%r | wa=%s | aktif=%s" % (
        d["nama"], d["alamat"], d["wa_contact"], d["aktif"]))
print("Peran:", dict(Counter(p["role"] for p in prof)))
