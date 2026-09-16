import { del as idbDel, get as idbGet, keys as idbKeys, set as idbSet } from 'idb-keyval'
import { makeId } from './id'

const PREFIX = 'scatter-image-'

/** Stores a Blob directly (IndexedDB handles Blobs natively - no base64 encoding overhead). */
export async function saveImageBlob(blob: Blob): Promise<string> {
  const id = makeId()
  await idbSet(PREFIX + id, blob)
  return id
}

export async function loadImageBlob(id: string): Promise<Blob | undefined> {
  return idbGet<Blob>(PREFIX + id)
}

export async function deleteImageBlob(id: string): Promise<void> {
  return idbDel(PREFIX + id)
}

/** All image ids currently stored, for the settings storage-cleanup view. */
export async function listImageIds(): Promise<string[]> {
  const allKeys = await idbKeys()
  return allKeys
    .filter((k): k is string => typeof k === 'string' && k.startsWith(PREFIX))
    .map((k) => k.slice(PREFIX.length))
}
