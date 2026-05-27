/**
 * Cloud storage for design presets.
 * Metadata: Supabase (shared across all users)
 * Textures: Vercel Blob (public CDN URLs)
 */

import { upload } from "@vercel/blob/client"
import type { DesignPreset, PbrMapSet, PresetMaterial } from "./studio-store"

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load all presets from Supabase. Returns DesignPreset[] where each
 * texture URL is a public Blob CDN URL.
 */
export async function loadPresets(): Promise<DesignPreset[]> {
  const res = await fetch("/api/presets")
  if (!res.ok) {
    console.error("[v0] Failed to load presets:", await res.text())
    return []
  }

  const { presets } = await res.json()
  
  // Transform API format to DesignPreset format
  return presets.map((p: ApiPreset) => ({
    id: p.id,
    name: p.name,
    type: p.type || "pbr",
    front: filterNulls(p.front),
    back: filterNulls(p.back),
    backColor: p.backColor,
    material: p.material as PresetMaterial | undefined,
    createdAt: p.createdAt,
  }))
}

/**
 * Save a new preset. Files are uploaded to Blob, metadata saved to Supabase.
 */
export async function savePreset(params: {
  id: string
  name: string
  type?: "simple" | "pbr"
  frontFiles: Record<string, File>
  backFiles: Record<string, File>
  backColor?: string
  material?: PresetMaterial
}): Promise<DesignPreset> {
  const { id, name, type, frontFiles, backFiles, backColor, material } = params

  const frontUrls: Record<string, string> = {}
  const backUrls: Record<string, string> = {}

  // Upload front textures to Blob
  for (const [mapType, file] of Object.entries(frontFiles)) {
    const url = await uploadTexture(id, "front", mapType, file)
    frontUrls[mapType] = url
  }

  // Upload back textures to Blob
  for (const [mapType, file] of Object.entries(backFiles)) {
    const url = await uploadTexture(id, "back", mapType, file)
    backUrls[mapType] = url
  }

  // Save metadata to Supabase
  const res = await fetch("/api/presets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id,
      name,
      type: type || "pbr",
      front: frontUrls,
      back: backUrls,
      backColor,
      material,
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    console.error("[v0] Failed to save preset:", errText)
    throw new Error("Failed to save preset")
  }

  const { preset } = await res.json()
  
  return {
    id: preset.id,
    name: preset.name,
    type: preset.type,
    front: filterNulls(preset.front) as PbrMapSet,
    back: filterNulls(preset.back) as PbrMapSet,
    backColor: preset.backColor,
    material: preset.material as PresetMaterial | undefined,
    createdAt: preset.createdAt,
  }
}

/**
 * Update a preset's material settings without changing textures.
 */
export async function updatePresetMaterial(id: string, material: PresetMaterial): Promise<void> {
  const res = await fetch("/api/presets", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, material }),
  })

  if (!res.ok) {
    console.error("[v0] Failed to update preset material:", await res.text())
    throw new Error("Failed to update preset material")
  }
}

/**
 * Delete a preset and its associated texture blobs.
 */
export async function deletePreset(id: string): Promise<void> {
  const res = await fetch(`/api/presets?id=${id}`, {
    method: "DELETE",
  })

  if (!res.ok) {
    console.error("[v0] Failed to delete preset:", await res.text())
    throw new Error("Failed to delete preset")
  }
}

/**
 * Generate a random ID for new presets.
 */
export function generatePresetId(): string {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ApiPreset = {
  id: string
  name: string
  type: "simple" | "pbr"
  front: Record<string, string | null>
  back: Record<string, string | null>
  backColor: string | null
  material: Record<string, unknown> | null
  createdAt: number
}

/**
 * Upload a texture file to Vercel Blob using client upload.
 */
async function uploadTexture(
  presetId: string,
  side: "front" | "back",
  channel: string,
  file: File
): Promise<string> {
  const ext = file.name.split(".").pop() || "png"
  const pathname = `presets/${presetId}/${side}_${channel}.${ext}`

  const blob = await upload(pathname, file, {
    access: "public",
    handleUploadUrl: "/api/blob/upload",
    clientPayload: JSON.stringify({ addRandomSuffix: true }),
  })

  return blob.url
}

/**
 * Filter out null values from a record.
 */
function filterNulls(obj: Record<string, string | null>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v) result[k] = v
  }
  return result
}
