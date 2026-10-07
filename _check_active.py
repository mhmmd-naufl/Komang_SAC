import os
from dotenv import load_dotenv
load_dotenv()

from supabase import create_client
import os

url = os.getenv('SUPABASE_URL')
key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
from supabase import create_client
sb = create_client(os.getenv('SUPABASE_URL'), os.getenv('SUPABASE_SERVICE_ROLE_KEY'))

result = sb.from_('shoes').select('id, merk, model, status, harga_cuci, harga_min').eq('status', True).execute()

for s in result.data:
    print(f'{s["id"]} | {s["merk"]} / {s["model"]} - status: {s["status"]}, harga: {s["harga_cuci"]}, min: {s.get("harga_min")}')