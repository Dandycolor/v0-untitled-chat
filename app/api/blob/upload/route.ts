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
      onBeforeGenerateToken: async (pathname) => {
        // Validate the pathname is for presets
        if (!pathname.startsWith("presets/")) {
          throw new Error("Invalid upload path")
        }

        return {
          allowedContentTypes: [
            "image/png",
            "image/jpeg",
            "image/webp",
            "image/tiff",
          ],
          maximumSizeInBytes: 10 * 1024 * 1024, // 10 MB max
        }
      },
      onUploadCompleted: async ({ blob }) => {
        // Optional: log upload or update database
        console.log("[v0] Blob upload completed:", blob.pathname)
      },
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
