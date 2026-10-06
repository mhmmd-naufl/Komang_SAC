import io

P = r'frontend/src/components/AdminDashboard.jsx'
s = io.open(P, encoding='utf-8').read()
lines = s.split('\n')

# Cari mulai
mulai = None
for i, line in enumerate(lines):
    if '<div className="card p-4">' in line and mulainya is None:
        mulainya = i

# Cari target
target_idx = None
for i in range(mulainya, len(lines)):
    if 'mt-2.5 text-[11px] text-slate-500' in lines[i]:
        target_idx = i
        break

if mulainya is None or target_idx is None:
    print('tidak ditemukan')
else:
    # Ambil lama berapa baris
    lama_awal = mulai
    lama_akhir = target_idx + 1  # inklusif
    berapa = lama_akhir - lama_awal
    print('berapa baris diganti:', berapa)
    
    # Tukar per baris dari index mulainya sampai target_idx
    # Barisan baru per index:
    baru = [
        '<div className="card p-4">',  # 0
        '<div className="flex flex-wrap items-center justify-between gap-3">',  # 1
        '<div className="flex items-center gap-2">',  # 2
        'Dari:',  # 3
        '<input',  # 4
        'type="date"',  # 5
        'value={dari || \'\'}',  # 6
        'onChange={(e) => setDari(e.target.value)}',  # 7
        'className="rounded-xl border border-primary-300 bg-primary-50 px-3 py-2 text-sm text-primary-700 cursor-pointer date-input"',  # 8
        'aria-label="Dari tanggal (YYYY-MM-DD)"',  # 9
        '/>',  # 10
        'Sampai:',  # 11
        '<input',  # 12
        'type="date"',  # 13
        'value={sampai || \'\'}',  # 14
        'onChange={(e) => setSampai(e.target.value)}',  # 15
        'className="rounded-xl border border-primary-300 bg-primary-50 px-3 py-2 text-sm text-primary-700 cursor-pointer date-input"',  # 16
        'aria-label="Sampai tanggal (YYYY-MM-DD)"',  # 17
        '/>',  # 18
        '</div>',  # 19
        '<div className="flex flex-wrap items-center gap-2">',  # 20
        '<button',  # 21
        'onClick={() => muat()}',  # 22
        'disabled={loading}',  # 23
        'className="btn-secondary px-3 py-2 text-xs"',  # 24
        'title="Muat ulang dashboard"',  # 25
        '>',  # 26
        '<RefreshCw',  # 27
        'className={cn(\'h-3.5 w-3.5\', loading && \'animate-spin\')} />',  # 28
        '<span',  # 29
        'className="hidden sm:inline">Perbarui</span>',  # 30
        '</span>',  # 31
        '</button>',  # 32
        '</div>',  # 33
        '</div>',  # 34
        '<p className="mt-2.5 text-[11px] text-slate-500">',  # 35
        'Pekerjaan yang masih dikerjakan saat ini (belum masuk hitungan periode mana pun):{' ',  # 36-37
        '<strong>{r.masih_jalan || 0}</strong>.',  # 38
        '</p>',  # 39
    ]
    
    # Cek panjang
    if len(baru) != berapa:
        print('Panjang barisan baru', len(baru), 'beda dengan berapa', berapa)
    else:
        # Ganti per baris
        for i in range(berapa):
            lines[lama_awal + i] = baru[i]
        s_baru = '\n'.join(lines)
        io.open(P, 'w', encoding='utf-8', newline='').write(s_baru)
        print('ganti ok, total baris', len(lines))