import { put, list, del } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"

/**
 * Presets are stored as two Blob objects per preset:
 *   presets/<id>/meta.json   — { id, name, front, back, createdAt }
 *   presets/<id>/<channel>-<filename>  — uploaded texture files
 *
 * The client reads textures by `pathname` via /api/file.
 */

type PresetMeta = {
  id: string
  name: string
  front: Record<string, string | undefined>
  back: Record<string, string | undefined>
  createdAt: number
}

async function readMeta(pathname: string): Promise<PresetMeta | null> {
  try {
    // Private store: use /api/file route via absolute URL.
    // Here (server-side) we can fetch via the Blob SDK directly.
    const { get } = await import("@vercel/blob")
    const result = await get(pathname, { access: "private" })
    if (!result || result.statusCode === 304) return null
    const text = await new Response(result.stream).text()
    return JSON.parse(text) as PresetMeta
  } catch {
    return null
  }
}

export async function GET() {
  try {
    const { blobs } = await list({ prefix: "presets/" })
    const metaBlobs = blobs.filter((b) => b.pathname.endsWith("/meta.json"))
    const metas = await Promise.all(metaBlobs.map((b) => readMeta(b.pathname)))
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
        const blob = await put(pathname, file, { access: "private", allowOverwrite: true })
        if (side === "front") front[ch] = blob.pathname
        else back[ch] = blob.pathname
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
      access: "private",
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
