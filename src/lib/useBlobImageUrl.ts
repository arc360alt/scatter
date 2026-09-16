import { useEffect, useState } from 'react'
import { loadImageBlob } from './imageStore'

/** Resolves an imageStore id to a live object URL, revoking it on change/unmount. */
export function useBlobImageUrl(imageId: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)

  // Clear the previous image's URL the moment imageId changes (render-time
  // reset, not an effect) so a switch never briefly shows a stale/revoked URL.
  const [resolvedFor, setResolvedFor] = useState(imageId)
  if (resolvedFor !== imageId) {
    setResolvedFor(imageId)
    setUrl(null)
  }

  useEffect(() => {
    if (!imageId) return
    let cancelled = false
    let objectUrl: string | null = null
    void loadImageBlob(imageId).then((blob) => {
      if (cancelled || !blob) return
      objectUrl = URL.createObjectURL(blob)
      setUrl(objectUrl)
    })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [imageId])

  return url
}
