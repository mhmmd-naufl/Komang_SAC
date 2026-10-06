import io

P = "main.py"
s = io.open(P, encoding="utf-8").read()

# More detailed error - return the actual exception
old = '''    try:
        trx = query.execute().data or []
        return _siapkan_transaksi(trx, user)
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        print(f"ERROR in get_tersedia_transaksi: {e}")
        print(tb)
        # Return the actual error for debugging
        raise HTTPException(500, f"Database error: {type(e).__name__}: {str(e)}")'''

new = '''    try:
        trx = query.execute().data or []
        return _siapkan_transaksi(trx, user)
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        print(f"ERROR in get_tersedia_transaksi: {e}")
        print(tb)
        # Return the actual error for debugging
        raise HTTPException(500, f"ERROR: {type(e).__name__}: {str(e)} | TB: {tb}")'''

if old not in s:
    raise SystemExit("Pattern not found")
s = s.replace(old, new)

io.open(P, "w", encoding="utf-8", newline="").write(s)
print("ok")