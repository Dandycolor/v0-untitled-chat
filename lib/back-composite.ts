"use client"

import * as THREE from "three"
import { resolveTextureUrl } from "@/lib/texture-url"
import { fetchTextureBlob } from "@/lib/fetch-texture-blob"

/**
 * Builds a CanvasTexture for the back side by:
 *  1. Filling with `backColor`
 *  2. Drawing the optional `backTemplate` PNG on top (uses its alpha)
 *
 * Returns a CanvasTexture that can be plugged into a material's albedo slot
 * for the back face. If neither color nor template is needed it still returns
 * a solid color texture so the back side never appears unshaded.
 *
 * Loads the template URL asynchronously; while loading the texture is just
 * the solid color, then updates once the image arrives.
 */
export function makeBackCompositeTexture(
  backColor: string,
  backTemplateUrl: string | undefined,
  flipH: boolean,
  flipV: boolean,
): { texture: THREE.CanvasTexture; dispose: () => void } {
  console.log("[v0] makeBackCompositeTexture:", { backColor, backTemplateUrl, flipH, flipV })
  const W = 1024
  const H = 640
  const canvas = document.createElement("canvas")
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext("2d")!

  // Step 1: paint background color
  ctx.fillStyle = backColor
  ctx.fillRect(0, 0, W, H)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.anisotropy = 8
  tex.center.set(0.5, 0.5)
  tex.repeat.x = flipH ? -1 : 1
  tex.repeat.y = flipV ? -1 : 1
  tex.needsUpdate = true

  let cancelled = false
  let objectUrl: string | null = null

  if (backTemplateUrl) {
    const resolved = resolveTextureUrl(backTemplateUrl)
    if (resolved) {
      const ac = new AbortController()
      ;(async () => {
        try {
          const blob = await fetchTextureBlob(resolved, ac.signal)
          if (cancelled) return
          objectUrl = URL.createObjectURL(blob)
          const img = new Image()
          img.decoding = "async"
          img.onload = () => {
            if (cancelled) {
              if (objectUrl) URL.revokeObjectURL(objectUrl)
              return
            }
            // Draw template scaled to canvas, preserving its aspect by stretching
            // (template is designed for the same card aspect as our 1024x640).
            ctx.drawImage(img, 0, 0, W, H)
            tex.needsUpdate = true
            if (objectUrl) {
              const ou = objectUrl
              setTimeout(() => URL.revokeObjectURL(ou), 0)
              objectUrl = null
            }
          }
          img.onerror = () => {
            if (objectUrl) URL.revokeObjectURL(objectUrl)
          }
          img.src = objectUrl
        } catch {
          /* keep solid color background */
        }
      })()

      return {
        texture: tex,
        dispose: () => {
          cancelled = true
          ac.abort()
          if (objectUrl) URL.revokeObjectURL(objectUrl)
          tex.dispose()
        },
      }
    }
  }

  return {
    texture: tex,
    dispose: () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      tex.dispose()
    },
  }
}
