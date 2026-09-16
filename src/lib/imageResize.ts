async function getResizedCanvas(file: File, maxDim: number): Promise<{ canvas: HTMLCanvasElement; keepPng: boolean }> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  return { canvas, keepPng: file.type === 'image/png' && scale === 1 }
}

/** Downscales an image file client-side and returns it as a Blob, so uploaded
 * backgrounds/note images don't bloat storage with full-resolution originals. */
export async function resizeImageToBlob(file: File, maxDim = 1920, quality = 0.85): Promise<Blob> {
  const { canvas, keepPng } = await getResizedCanvas(file, maxDim)
  const type = keepPng ? 'image/png' : 'image/jpeg'
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))
  if (!blob) throw new Error('Failed to encode resized image')
  return blob
}
