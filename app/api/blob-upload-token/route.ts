import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { type NextRequest, NextResponse } from "next/server"

/**
 * Issues signed Vercel Blob client-upload tokens, so the browser can PUT large
 * texture files directly to Blob storage without passing through our API route
 * (which has a ~4.5 MB body limit on Vercel serverless).
 */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as HandleUploadBody
  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // Only allow uploads under presets/ and limit to common image types.
        if (!pathname.startsWith("presets/")) {
          throw new Error("Uploads are only allowed under presets/")
        }
        return {
          allowedContentTypes: ["image/png", "image/jpeg", "image/webp"],
          maximumSizeInBytes: 50 * 1024 * 1024, // 50 MB per channel
        }
      },
      onUploadCompleted: async () => {
        // No-op: meta.json is written separately by /api/presets.
      },
    })
    return NextResponse.json(json)
  } catch (err) {
    console.error("[v0] client upload token error:", err)
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
