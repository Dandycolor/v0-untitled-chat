import { put, list, del } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"

/**
 * Presets are stored as two Blob objects per preset:
 *   presets/<id>/meta.json   — { id, name, front, back, createdAt }
 *   presets/<id>/<channel>-<filename>  — uploaded texture files
 *
 * The Blob store is PUBLIC, so `front`/`back` hold direct CDN URLs that
 * Three.js's TextureLoader can fetch without any proxy.
 */

type PresetMeta = {
  id: string
  name: string
  front: Record<string, string | undefined>
  back: Record<string, string | undefined>
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

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const name = (formData.get("name") as string) || "Untitled"
    const id = (formData.get("id") as string) || cryptoRandomId()

    const front: Record<string, string> = {}
    const back: Record<string, string> = {}

    const channels = ["albedo", "normal", "roughness", "metallic", "ao", "height", "orm"] as const
    for (const side of ["front", "back"] as const) {
      for (const ch of channels) {
        const file = formData.get(`${side}_${ch}`) as File | null
        if (!file || !(file instanceof File) || file.size === 0) continue
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
        const pathname = `presets/${id}/${side}-${ch}-${safeName}`
        const blob = await put(pathname, file, { access: "public", allowOverwrite: true })
        if (side === "front") front[ch] = blob.url
        else back[ch] = blob.url
      }
    }

    const meta: PresetMeta = {
      id,
      name,
      front,
      back,
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
