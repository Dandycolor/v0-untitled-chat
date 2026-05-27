import { put, list, del } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"

/**
 * Presets are stored as two kinds of Blob objects:
 *   presets/<id>/meta.json                    — { id, name, front, back, createdAt }
 *   presets/<id>/<side>-<channel>-<filename>  — uploaded textures (uploaded directly from
 *                                                the browser via @vercel/blob/client)
 *
 * The Blob store is PUBLIC so `front`/`back` hold direct CDN URLs that Three.js can load
 * without a proxy. This POST only persists metadata — the large files never pass through
 * this route, avoiding the Vercel 4.5 MB serverless body limit.
 */

type PresetMeta = {
  id: string
  name: string
  front: Record<string, string | undefined>
  back: Record<string, string | undefined>
  /**
   * Optional per-design material settings (roughness, glare, holo, foil…).
   * Plain JSON object — schema validated client-side via the PresetMaterial type.
   */
  material?: Record<string, unknown>
  createdAt: number
}

async function readMeta(url: string): Promise<PresetMeta | null> {
  try {
    const res = await fetch(url, { cache: "no-store" })
    if (!res.ok) return null
    return (await res.json()) as PresetMeta
  } catch {
    return null
  }
}

export async function GET() {
  try {
    const { blobs } = await list({ prefix: "presets/" })
    const metaBlobs = blobs.filter((b) => b.pathname.endsWith("/meta.json"))
    const metas = await Promise.all(metaBlobs.map((b) => readMeta(b.url)))
    const presets = metas.filter(Boolean) as PresetMeta[]
    presets.sort((a, b) => b.createdAt - a.createdAt)
    return NextResponse.json({ presets })
  } catch (err) {
    console.error("[v0] list presets error:", err)
    return NextResponse.json({ error: "Failed to list presets" }, { status: 500 })
  }
}

/**
 * Expects a small JSON body:
 *   { id, name, front: { channel: url }, back: { channel: url } }
 * Writes meta.json and returns the saved preset metadata.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      id?: string
      name?: string
      front?: Record<string, string | undefined>
      back?: Record<string, string | undefined>
      material?: Record<string, unknown>
    }

    const id = body.id || cryptoRandomId()
    const meta: PresetMeta = {
      id,
      name: body.name || "Untitled",
      front: body.front || {},
      back: body.back || {},
      material: body.material,
      createdAt: Date.now(),
    }

    await put(`presets/${id}/meta.json`, JSON.stringify(meta), {
      access: "public",
      contentType: "application/json",
      allowOverwrite: true,
    })

    return NextResponse.json({ preset: meta })
  } catch (err) {
    console.error("[v0] create preset error:", err)
    return NextResponse.json({ error: "Failed to create preset" }, { status: 500 })
  }
}

/**
 * Updates a single preset's metadata (name and/or material settings) without
 * re-uploading any textures. The body is shallow-merged into the existing meta.
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      id?: string
      name?: string
      material?: Record<string, unknown>
    }
    if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 })

    const { blobs } = await list({ prefix: `presets/${body.id}/` })
    const metaBlob = blobs.find((b) => b.pathname.endsWith("/meta.json"))
    if (!metaBlob) return NextResponse.json({ error: "preset not found" }, { status: 404 })

    const current = await readMeta(metaBlob.url)
    if (!current) return NextResponse.json({ error: "meta unreadable" }, { status: 500 })

    const next: PresetMeta = {
      ...current,
      name: body.name ?? current.name,
      material: body.material ?? current.material,
    }

    await put(`presets/${body.id}/meta.json`, JSON.stringify(next), {
      access: "public",
      contentType: "application/json",
      allowOverwrite: true,
    })

    return NextResponse.json({ preset: next })
  } catch (err) {
    console.error("[v0] update preset error:", err)
    return NextResponse.json({ error: "Failed to update preset" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id")
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })
    const { blobs } = await list({ prefix: `presets/${id}/` })
    await Promise.all(blobs.map((b) => del(b.url)))
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[v0] delete preset error:", err)
    return NextResponse.json({ error: "Failed to delete preset" }, { status: 500 })
  }
}

function cryptoRandomId() {
  return (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)).replace(/-/g, "").slice(0, 12)
}
