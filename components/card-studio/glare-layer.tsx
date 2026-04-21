"use client"

import { useMemo } from "react"
import * as THREE from "three"
import { useStudio } from "@/lib/studio-store"

/**
 * Texture-based glare: a thin additive plane positioned slightly above the card
 * with a soft rotated gradient in its alpha channel. Only rendered when
 * glareMode === "texture".
 */
export function GlareLayer({
  width,
  height,
  position,
  rotation,
}: {
  width: number
  height: number
  position: [number, number, number]
  rotation: [number, number, number]
}) {
  const mode = useStudio((s) => s.glareMode)
  const intensity = useStudio((s) => s.glareIntensity)
  const rotDeg = useStudio((s) => s.glareRotation)
  const bandWidth = useStudio((s) => s.glareWidth)
  const softness = useStudio((s) => s.glareSoftness)

  const texture = useMemo(() => {
    const size = 512
    const canvas = document.createElement("canvas")
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext("2d")!
    ctx.clearRect(0, 0, size, size)
    ctx.translate(size / 2, size / 2)
    ctx.rotate((rotDeg * Math.PI) / 180)
    ctx.translate(-size / 2, -size / 2)
    const grad = ctx.createLinearGradient(0, 0, size, 0)
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
    ctx.fillRect(0, 0, size, size)
    const t = new THREE.CanvasTexture(canvas)
    t.colorSpace = THREE.SRGBColorSpace
    t.needsUpdate = true
    return t
  }, [intensity, rotDeg, bandWidth, softness])

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
