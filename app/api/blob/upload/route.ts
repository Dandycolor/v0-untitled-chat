import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { NextResponse } from "next/server"

/**
 * Handle client-side blob uploads.
 * This endpoint is used by @vercel/blob/client's upload() function.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // Validate the pathname is for presets
        if (!pathname.startsWith("presets/")) {
          throw new Error("Invalid upload path")
        }

        // Parse client options
        const options = clientPayload ? JSON.parse(clientPayload) : {}

        return {
          allowedContentTypes: [
            "image/png",
            "image/jpeg",
            "image/webp",
            "image/tiff",
          ],
          maximumSizeInBytes: 50 * 1024 * 1024, // 50 MB max — PBR textures can be large
          addRandomSuffix: options.addRandomSuffix ?? true, // Enable random suffix by default
        }
      },
      // Note: onUploadCompleted requires VERCEL_BLOB_CALLBACK_URL env var, omitting for now
    })

    return NextResponse.json(jsonResponse)
  } catch (error) {
    console.error("[v0] Blob upload error:", error)
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    )
  }
}
