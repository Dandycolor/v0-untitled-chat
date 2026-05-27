"use client"

import * as THREE from "three"

/**
 * Creates a canvas texture with backColor as background and optional
 * backTemplate PNG overlaid on top. The template is loaded asynchronously
 * using a simple Image element (no fetch/blob complexity).
 */
export function makeBackCompositeTexture(
  backColor: string,
  backTemplateUrl: string | undefined,
  flipH: boolean,
  flipV: boolean,
  onTemplateLoaded?: () => void,
): { texture: THREE.CanvasTexture; dispose: () => void } {
  console.log("[v0] makeBackCompositeTexture:", { backColor, backTemplateUrl, flipH, flipV })
  
  const W = 1024
  const H = 640 // Card aspect ratio ~1.6
  const canvas = document.createElement("canvas")
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext("2d")!

  // Fill background with solid color
  ctx.fillStyle = backColor
  ctx.fillRect(0, 0, W, H)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.flipY = true
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.anisotropy = 8
  tex.center.set(0.5, 0.5)
  tex.repeat.x = flipH ? -1 : 1
  tex.repeat.y = flipV ? -1 : 1
  tex.needsUpdate = true

  let cancelled = false

  // Load template overlay if provided - use simple Image, not fetch
  if (backTemplateUrl) {
    console.log("[v0] backComposite loading template via Image:", backTemplateUrl)
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      if (cancelled) return
      console.log("[v0] backComposite template loaded:", img.width, "x", img.height)
      // Draw template scaled to canvas
      ctx.drawImage(img, 0, 0, W, H)
      tex.needsUpdate = true
      console.log("[v0] backComposite texture updated with template")
      onTemplateLoaded?.()
    }
    img.onerror = (e) => {
      console.log("[v0] backComposite template Image.onerror:", backTemplateUrl, e)
    }
    // Start loading
    img.src = backTemplateUrl
  }

  return {
    texture: tex,
    dispose: () => {
      cancelled = true
      tex.dispose()
    },
  }
}
