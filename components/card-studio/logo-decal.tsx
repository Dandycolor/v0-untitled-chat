"use client"

import { useEffect, useState } from "react"
import * as THREE from "three"
import { useStudio } from "@/lib/studio-store"

/**
 * Rasterizes the selected SVG logo into a canvas texture.
 * Keeps aspect ratio, transparent background.
 */
export function useLogoTexture(): THREE.Texture | null {
  const orientation = useStudio((s) => s.orientation)
  const verticalLogo = useStudio((s) => s.verticalLogo)
  const [tex, setTex] = useState<THREE.Texture | null>(null)

  useEffect(() => {
    // "verticalLogo" overrides auto-behavior, else follow card orientation
    const useVertical = verticalLogo || orientation === "vertical"
    const url = useVertical ? "/logos/logo_vertical.svg" : "/logos/logo_horizontal.svg"
    let cancelled = false
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      if (cancelled) return
      const maxDim = 1024
      const ratio = img.width / img.height
      const w = ratio >= 1 ? maxDim : Math.round(maxDim * ratio)
      const h = ratio >= 1 ? Math.round(maxDim / ratio) : maxDim
      const canvas = document.createElement("canvas")
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext("2d")!
      ctx.clearRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0, w, h)
      const t = new THREE.CanvasTexture(canvas)
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = 8
      t.needsUpdate = true
      setTex(t)
    }
    img.onerror = () => {
      console.error("[v0] logo load failed", url)
    }
    img.src = url
    return () => {
      cancelled = true
    }
  }, [orientation, verticalLogo])

  return tex
}
