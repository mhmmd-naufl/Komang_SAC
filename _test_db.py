import os
from dotenv import load_dotenv
load_dotenv()

url = os.getenv('SUPABASE_URL')
key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
print('URL:', url)
print('Key length:', len(key) if key else 0)
print('Key starts with:', key[:20] if key else 'NONE')

if not key or 'your-' in key or 'xxx' in key:
    print('ERROR: Service role key adalah placeholder!')
else:
    from supabase import create_client
    sb = create_client(url, key)
    try:
        result = sb.table('profiles').select('count').execute()
        print('Koneksi OK, count:', result)
    except Exception as e:
        print('ERROR koneksi:', e)