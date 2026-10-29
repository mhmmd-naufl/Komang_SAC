import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '../utils/helpers'

/**
 * Lightbox: preview foto sebagai overlay DI halaman ini, bukan tab baru.
 *
 * Dulu semua foto (admin, teknisi, akun pelanggan) pakai <a target="_blank">
 * -- seandainya satu klik membuka tab Chrome baru dan tab pengguna jadi
 * kebanjiran. Sekarang: klik gambar -> zoom besar di tengah layar, tutup
 * pakai tombol X, klik area gelap, atau tombol Esc.
 *
 * Pemakaian: <LihatFoto src={url} alt="Foto sebelum">
 *              <img ... /> (atau teks/tombol apa pun)
 *            </LihatFoto>
 */
export default function LihatFoto({ src, alt, className, children }) {
  const [terbuka, setTerbuka] = useState(false)

  // Esc untuk tutup + kunci scroll halaman saat overlay aktif, supaya latar
  // belakangnya tidak ikut menggelinding bersama roda mouse.
  useEffect(() => {
    if (!terbuka) return undefined
    const ditutupEscape = (e) => {
      if (e.key === 'Escape') setTerbuka(false)
    }
    document.addEventListener('keydown', ditutupEscape)
    const lama = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', ditutupEscape)
      document.body.style.overflow = lama
    }
  }, [terbuka])

  // Tanpa foto, tag pelindung tidak ada yang bisa ditampilkan.
  if (!src) return children ?? null

  return (
    <>
      <button
        type="button"
        onClick={() => setTerbuka(true)}
        className={cn('block cursor-zoom-in', className)}
        aria-label={`Perbesar ${alt || 'foto'}`}
      >
        {children}
      </button>
      {terbuka && (
        <div
          className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setTerbuka(false)}
          role="dialog"
          aria-modal="true"
          aria-label={alt || 'Preview foto'}
        >
          <button
            type="button"
            onClick={() => setTerbuka(false)}
            className="absolute top-4 right-4 p-2 rounded-xl bg-white/10 text-white hover:bg-white/20"
            aria-label="Tutup preview"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={src}
            alt={alt || ''}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] max-w-full object-contain rounded-xl shadow-2xl animate-slide-up"
          />
        </div>
      )}
    </>
  )
}
