"use client"

import { useMemo } from "react"
import * as THREE from "three"
import { useStudio } from "@/lib/studio-store"

/**
 * Texture-based glare: a thin additive plane positioned slightly above the card
 * with a soft rotated gradient in its alpha channel. The gradient is clipped by
 * a rounded-rectangle mask that matches the card's silhouette, so the glare
 * never leaks past the card's rounded corners.
 *
 * Only rendered when glareMode === "texture".
 */
export function GlareLayer({
  width,
  height,
  position,
  rotation,
  /** Corner radius in world units; defaults to ISO ID-1 card-ish proportion. */
  cornerRadius,
}: {
  width: number
  height: number
  position: [number, number, number]
  rotation: [number, number, number]
  cornerRadius?: number
}) {
  const mode = useStudio((s) => s.glareMode)
  const intensity = useStudio((s) => s.glareIntensity)
  const rotDeg = useStudio((s) => s.glareRotation)
  const bandWidth = useStudio((s) => s.glareWidth)
  const softness = useStudio((s) => s.glareSoftness)

  const texture = useMemo(() => {
    // Match the canvas aspect to the plane's aspect so the rounded-rect clip
    // maps 1:1 to the card silhouette without stretching.
    const BASE = 1024
    const W = BASE
    const H = Math.max(1, Math.round(BASE * (height / width)))

    const canvas = document.createElement("canvas")
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext("2d")!
    ctx.clearRect(0, 0, W, H)

    // --- Step 1. Paint the rotated gradient band over the full canvas ---------
    const rotRad = (rotDeg * Math.PI) / 180
    // Span the gradient along the rotated diagonal so no gaps appear at the edges.
    const diag = Math.hypot(W, H)
    ctx.save()
    ctx.translate(W / 2, H / 2)
    ctx.rotate(rotRad)

    const grad = ctx.createLinearGradient(-diag / 2, 0, diag / 2, 0)
    const inner = Math.max(0, 0.5 - bandWidth / 2)
    const outer = Math.min(1, 0.5 + bandWidth / 2)
    const softInner = Math.max(0, inner - softness * 0.5)
    const softOuter = Math.min(1, outer + softness * 0.5)
    grad.addColorStop(softInner, "rgba(255,255,255,0)")
    grad.addColorStop(inner, `rgba(255,255,255,${intensity * 0.6})`)
    grad.addColorStop(0.5, `rgba(255,255,255,${intensity})`)
    grad.addColorStop(outer, `rgba(255,255,255,${intensity * 0.6})`)
    grad.addColorStop(softOuter, "rgba(255,255,255,0)")

    ctx.fillStyle = grad
    // Fill a square that, after rotation, covers the whole canvas.
    ctx.fillRect(-diag / 2, -diag / 2, diag, diag)
    ctx.restore()

    // --- Step 2. Clip to a rounded-rect matching the card silhouette ----------
    // ISO/IEC 7810 ID-1 corner radius ≈ 3.18mm on an 85.6×53.98 card ≈ ~6% of
    // the short side. Convert the world-space radius into pixels on the canvas.
    const radiusWorld = cornerRadius ?? Math.min(width, height) * 0.06
    const radiusPx = (radiusWorld / width) * W

    ctx.globalCompositeOperation = "destination-in"
    ctx.beginPath()
    // roundRect ships in all modern browsers; guard just in case.
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(0, 0, W, H, radiusPx)
    } else {
      // Fallback: manual rounded rect path.
      const r = radiusPx
      ctx.moveTo(r, 0)
      ctx.lineTo(W - r, 0)
      ctx.quadraticCurveTo(W, 0, W, r)
      ctx.lineTo(W, H - r)
      ctx.quadraticCurveTo(W, H, W - r, H)
      ctx.lineTo(r, H)
      ctx.quadraticCurveTo(0, H, 0, H - r)
      ctx.lineTo(0, r)
      ctx.quadraticCurveTo(0, 0, r, 0)
    }
    ctx.fillStyle = "#fff"
    ctx.fill()
    ctx.globalCompositeOperation = "source-over"

    const t = new THREE.CanvasTexture(canvas)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 4
    t.needsUpdate = true
    return t
  }, [intensity, rotDeg, bandWidth, softness, width, height, cornerRadius])

  if (mode !== "texture") return null

  return (
    <mesh position={position} rotation={rotation} renderOrder={10}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial
        map={texture}
        transparent
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  )
}
