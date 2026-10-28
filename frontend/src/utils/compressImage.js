import imageCompression from 'browser-image-compression'

const OPTIONS = {
  maxSizeMB: 0.8,
  maxWidthOrHeight: 1600,
  useWebWorker: true,
  initialQuality: 0.8,
  fileType: 'image/jpeg',
}

export async function compressImage(file) {
  if (!file || !file.type.startsWith('image/')) return file
  try {
    const result = await imageCompression(file, OPTIONS)
    // jangan pakai hasil kompresi kalau malah lebih besar
    return result.size < file.size ? result : file
  } catch (err) {
    console.error('Kompresi gagal, pakai file asli', err)
    return file
  }
}