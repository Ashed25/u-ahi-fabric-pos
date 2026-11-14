import { useEffect, useState } from 'react'

/** Camera photos are several MB; store a ~640px JPEG so 500 products stay small in IndexedDB. */
export async function resizePhoto(file: Blob, max = 640): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * scale)
  canvas.height = Math.round(bmp.height * scale)
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('photo encode failed'))), 'image/jpeg', 0.8),
  )
}

export function usePhotoUrl(blob?: Blob) {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!blob) return setUrl(undefined)
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return url
}

export function Photo({ blob, className = '' }: { blob?: Blob; className?: string }) {
  const url = usePhotoUrl(blob)
  return url ? (
    <img src={url} alt="" className={`object-cover ${className}`} />
  ) : (
    <div className={`flex items-center justify-center bg-slate-200 text-3xl text-slate-400 ${className}`}>📷</div>
  )
}
