/**
 * Local storage for design presets. Uses localStorage for metadata and
 * IndexedDB for texture blobs. No server-side tokens required.
 */

import type { DesignPreset, PbrMapSet, PresetMaterial } from "./studio-store"

const LS_KEY = "card-studio-presets"
const IDB_NAME = "card-studio-textures"
const IDB_STORE = "textures"
const IDB_VERSION = 1

// ---------------------------------------------------------------------------
// IndexedDB helpers for texture blob storage
// ---------------------------------------------------------------------------

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION)
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE)
      }
    }
  })
  return dbPromise
}

async function idbGet(key: string): Promise<Blob | undefined> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly")
    const store = tx.objectStore(IDB_STORE)
    const req = store.get(key)
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve(req.result as Blob | undefined)
  })
}

async function idbPut(key: string, blob: Blob): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite")
    const store = tx.objectStore(IDB_STORE)
    const req = store.put(blob, key)
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve()
  })
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite")
    const store = tx.objectStore(IDB_STORE)
    const req = store.delete(key)
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve()
  })
}

// ---------------------------------------------------------------------------
// localStorage metadata
// ---------------------------------------------------------------------------

type StoredPreset = {
  id: string
  name: string
  /** Keys into IndexedDB for front-side textures */
  front: Record<string, string>
  /** Keys into IndexedDB for back-side textures */
  back: Record<string, string>
  material?: PresetMaterial
  createdAt: number
}

function readMeta(): StoredPreset[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function writeMeta(presets: StoredPreset[]): void {
  if (typeof window === "undefined") return
  localStorage.setItem(LS_KEY, JSON.stringify(presets))
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load all presets from local storage. Returns DesignPreset[] where each
 * texture URL is a blob: URL pointing to IndexedDB data.
 */
export async function loadPresets(): Promise<DesignPreset[]> {
  const stored = readMeta()
  const results: DesignPreset[] = []

  for (const p of stored) {
    // Resolve IndexedDB keys to blob URLs
    const front: PbrMapSet = {}
    const back: PbrMapSet = {}

    for (const [mapType, idbKey] of Object.entries(p.front)) {
      const blob = await idbGet(idbKey)
      if (blob) {
        front[mapType as keyof PbrMapSet] = URL.createObjectURL(blob)
      }
    }

    for (const [mapType, idbKey] of Object.entries(p.back)) {
      const blob = await idbGet(idbKey)
      if (blob) {
        back[mapType as keyof PbrMapSet] = URL.createObjectURL(blob)
      }
    }

    results.push({
      id: p.id,
      name: p.name,
      front,
      back,
      material: p.material,
      createdAt: p.createdAt,
    })
  }

  return results
}

/**
 * Save a new preset. Files are stored in IndexedDB, metadata in localStorage.
 */
export async function savePreset(params: {
  id: string
  name: string
  frontFiles: Record<string, File>
  backFiles: Record<string, File>
  material?: PresetMaterial
}): Promise<DesignPreset> {
  const { id, name, frontFiles, backFiles, material } = params

  const front: Record<string, string> = {}
  const back: Record<string, string> = {}
  const frontUrls: PbrMapSet = {}
  const backUrls: PbrMapSet = {}

  // Store front textures
  for (const [mapType, file] of Object.entries(frontFiles)) {
    const idbKey = `${id}/front/${mapType}`
    await idbPut(idbKey, file)
    front[mapType] = idbKey
    frontUrls[mapType as keyof PbrMapSet] = URL.createObjectURL(file)
  }

  // Store back textures
  for (const [mapType, file] of Object.entries(backFiles)) {
    const idbKey = `${id}/back/${mapType}`
    await idbPut(idbKey, file)
    back[mapType] = idbKey
    backUrls[mapType as keyof PbrMapSet] = URL.createObjectURL(file)
  }

  // Save metadata
  const stored = readMeta()
  const newEntry: StoredPreset = {
    id,
    name,
    front,
    back,
    material,
    createdAt: Date.now(),
  }
  stored.push(newEntry)
  writeMeta(stored)

  return {
    id,
    name,
    front: frontUrls,
    back: backUrls,
    material,
    createdAt: newEntry.createdAt,
  }
}

/**
 * Update a preset's material settings without changing textures.
 */
export function updatePresetMaterial(id: string, material: PresetMaterial): void {
  const stored = readMeta()
  const idx = stored.findIndex((p) => p.id === id)
  if (idx !== -1) {
    stored[idx].material = material
    writeMeta(stored)
  }
}

/**
 * Delete a preset and its associated texture blobs.
 */
export async function deletePreset(id: string): Promise<void> {
  const stored = readMeta()
  const preset = stored.find((p) => p.id === id)
  if (!preset) return

  // Delete texture blobs from IndexedDB
  for (const idbKey of Object.values(preset.front)) {
    await idbDelete(idbKey).catch(() => {})
  }
  for (const idbKey of Object.values(preset.back)) {
    await idbDelete(idbKey).catch(() => {})
  }

  // Remove from metadata
  writeMeta(stored.filter((p) => p.id !== id))
}

/**
 * Generate a random ID for new presets.
 */
export function generatePresetId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}
