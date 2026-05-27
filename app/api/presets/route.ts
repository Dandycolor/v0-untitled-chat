import { put, list, del } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * Presets are stored in two places:
 *   Supabase DB: metadata (id, name, type, texture URLs, material settings)
 *   Vercel Blob: actual texture files (uploaded via client upload)
 *
 * This enables shared preset access across all users.
 */

export type DbPreset = {
  id: string
  name: string
  type: "simple" | "pbr"
  front_albedo: string | null
  front_normal: string | null
  front_roughness: string | null
  front_metallic: string | null
  front_ao: string | null
  front_height: string | null
  front_orm: string | null
  front_clearcoat_mask: string | null
  back_albedo: string | null
  back_normal: string | null
  back_roughness: string | null
  back_metallic: string | null
  back_ao: string | null
  back_height: string | null
  back_orm: string | null
  back_clearcoat_mask: string | null
  back_color: string | null
  back_template: string | null
  material: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

/**
 * GET /api/presets - Fetch all presets from Supabase
 */
export async function GET() {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("design_presets")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) {
      console.error("[v0] Supabase fetch error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Transform DB format to client format
    const presets = (data as DbPreset[]).map(dbToClientPreset)

    return NextResponse.json({ presets })
  } catch (err) {
    console.error("[v0] list presets error:", err)
    return NextResponse.json({ error: "Failed to list presets" }, { status: 500 })
  }
}

/**
 * POST /api/presets - Create a new preset in Supabase
 * Expects: { id, name, type, front: { channel: url }, back: { channel: url }, backColor?, material? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const supabase = await createClient()

    const id = body.id || cryptoRandomId()

    const insertData = {
      id,
      name: body.name || "Untitled",
      type: body.type || "pbr",
      front_albedo: body.front?.albedo || null,
      front_normal: body.front?.normal || null,
      front_roughness: body.front?.roughness || null,
      front_metallic: body.front?.metallic || null,
      front_ao: body.front?.ao || null,
      front_height: body.front?.height || null,
      front_orm: body.front?.orm || null,
      front_clearcoat_mask: body.front?.clearcoatMask || null,
      back_albedo: body.back?.albedo || null,
      back_normal: body.back?.normal || null,
      back_roughness: body.back?.roughness || null,
      back_metallic: body.back?.metallic || null,
      back_ao: body.back?.ao || null,
      back_height: body.back?.height || null,
      back_orm: body.back?.orm || null,
      back_clearcoat_mask: body.back?.clearcoatMask || null,
      back_color: body.backColor || null,
      back_template: body.backTemplate || null,
      material: body.material || null,
    }

    const { data, error } = await supabase
      .from("design_presets")
      .insert(insertData)
      .select()
      .single()

    if (error) {
      console.error("[v0] Supabase insert error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ preset: dbToClientPreset(data as DbPreset) })
  } catch (err) {
    console.error("[v0] create preset error:", err)
    return NextResponse.json({ error: "Failed to create preset" }, { status: 500 })
  }
}

/**
 * PATCH /api/presets - Update preset metadata (name, material) in Supabase
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 })

    const supabase = await createClient()

    const updateData: Record<string, unknown> = {}
    
    if (body.name !== undefined) updateData.name = body.name
    if (body.type !== undefined) updateData.type = body.type
    if (body.backColor !== undefined) updateData.back_color = body.backColor
    if (body.backTemplate !== undefined) updateData.back_template = body.backTemplate
    if (body.material !== undefined) updateData.material = body.material
    
    // Handle front texture updates
    if (body.front) {
      if (body.front.albedo !== undefined) updateData.front_albedo = body.front.albedo
      if (body.front.normal !== undefined) updateData.front_normal = body.front.normal
      if (body.front.roughness !== undefined) updateData.front_roughness = body.front.roughness
      if (body.front.metallic !== undefined) updateData.front_metallic = body.front.metallic
      if (body.front.ao !== undefined) updateData.front_ao = body.front.ao
      if (body.front.height !== undefined) updateData.front_height = body.front.height
      if (body.front.orm !== undefined) updateData.front_orm = body.front.orm
      if (body.front.clearcoatMask !== undefined) updateData.front_clearcoat_mask = body.front.clearcoatMask
    }
    
    // Handle back texture updates
    if (body.back) {
      if (body.back.albedo !== undefined) updateData.back_albedo = body.back.albedo
      if (body.back.normal !== undefined) updateData.back_normal = body.back.normal
      if (body.back.roughness !== undefined) updateData.back_roughness = body.back.roughness
      if (body.back.metallic !== undefined) updateData.back_metallic = body.back.metallic
      if (body.back.ao !== undefined) updateData.back_ao = body.back.ao
      if (body.back.height !== undefined) updateData.back_height = body.back.height
      if (body.back.orm !== undefined) updateData.back_orm = body.back.orm
      if (body.back.clearcoatMask !== undefined) updateData.back_clearcoat_mask = body.back.clearcoatMask
    }

    const { data, error } = await supabase
      .from("design_presets")
      .update(updateData)
      .eq("id", body.id)
      .select()
      .single()

    if (error) {
      console.error("[v0] Supabase update error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ preset: dbToClientPreset(data as DbPreset) })
  } catch (err) {
    console.error("[v0] update preset error:", err)
    return NextResponse.json({ error: "Failed to update preset" }, { status: 500 })
  }
}

/**
 * DELETE /api/presets - Delete preset from Supabase and its Blob textures
 */
export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id")
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

    const supabase = await createClient()

    // Delete from Supabase
    const { error } = await supabase
      .from("design_presets")
      .delete()
      .eq("id", id)

    if (error) {
      console.error("[v0] Supabase delete error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Also delete blob files for this preset
    try {
      const { blobs } = await list({ prefix: `presets/${id}/` })
      if (blobs.length > 0) {
        await Promise.all(blobs.map((b) => del(b.url)))
      }
    } catch (blobErr) {
      // Non-fatal: DB record deleted, but blobs may remain
      console.error("[v0] Blob cleanup error:", blobErr)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[v0] delete preset error:", err)
    return NextResponse.json({ error: "Failed to delete preset" }, { status: 500 })
  }
}

/**
 * Convert DB row format to client format
 */
function dbToClientPreset(db: DbPreset) {
  return {
    id: db.id,
    name: db.name,
    type: db.type,
    front: {
      albedo: db.front_albedo,
      normal: db.front_normal,
      roughness: db.front_roughness,
      metallic: db.front_metallic,
      ao: db.front_ao,
      height: db.front_height,
      orm: db.front_orm,
      clearcoatMask: db.front_clearcoat_mask,
    },
    back: {
      albedo: db.back_albedo,
      normal: db.back_normal,
      roughness: db.back_roughness,
      metallic: db.back_metallic,
      ao: db.back_ao,
      height: db.back_height,
      orm: db.back_orm,
      clearcoatMask: db.back_clearcoat_mask,
    },
    backColor: db.back_color,
    backTemplate: db.back_template,
    material: db.material,
    createdAt: new Date(db.created_at).getTime(),
  }
}

function cryptoRandomId() {
  return (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)).replace(/-/g, "").slice(0, 12)
}
