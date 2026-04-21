"use client"

import { useEffect, useRef } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import type * as THREE from "three"

/**
 * Shared mutable ref — the in-canvas binding writes frame updates directly
 * into this DOM node via textContent, avoiding React re-renders.
 */
const hudRef: { current: HTMLDivElement | null } = { current: null }

function fmt(n: number, frac = 2) {
  return n.toFixed(frac).padStart(frac + 3, " ")
}

/**
 * Lives inside the R3F Canvas. Each frame, reads the active camera state and
 * writes a compact telemetry line into the HUD DOM node.
 */
export function CameraTelemetryBinding() {
  const { camera } = useThree()
  const line = useRef("")

  useFrame(() => {
    const el = hudRef.current
    if (!el) return

    const p = camera.position
    const distance = p.length()
    // Azimuth in the XZ plane: 0 = looking along +Z toward target, rotates toward +X.
    const azimuth = (Math.atan2(p.x, p.z) * 180) / Math.PI
    const elevation = (Math.atan2(p.y, Math.hypot(p.x, p.z)) * 180) / Math.PI

    let lens = ""
    const persp = camera as THREE.PerspectiveCamera
    const ortho = camera as THREE.OrthographicCamera
    if ((persp as unknown as { isPerspectiveCamera?: boolean }).isPerspectiveCamera) {
      lens = `fov ${fmt(persp.fov, 1)}°  focal ${fmt(persp.getFocalLength(), 1)}mm`
    } else if ((ortho as unknown as { isOrthographicCamera?: boolean }).isOrthographicCamera) {
      lens = `zoom ${fmt(ortho.zoom, 0)}`
    }

    const next =
      `pos [${fmt(p.x)}, ${fmt(p.y)}, ${fmt(p.z)}]   ` +
      `az ${fmt(azimuth, 1)}°   el ${fmt(elevation, 1)}°   ` +
      `dist ${fmt(distance, 2)}   ${lens}`

    // Avoid DOM churn if nothing changed (e.g. camera idle).
    if (next !== line.current) {
      line.current = next
      el.textContent = next
    }
  })

  return null
}

/**
 * Absolutely-positioned HUD rendered outside the Canvas. Registers its DOM
 * node into `hudRef` so the frame binding can write into it.
 */
export function CameraTelemetryHUD() {
  const divRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    hudRef.current = divRef.current
    return () => {
      if (hudRef.current === divRef.current) hudRef.current = null
    }
  }, [])
  return (
    <div
      ref={divRef}
      className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md border bg-background/70 px-2.5 py-1 font-mono text-[10px] leading-4 tracking-tight text-muted-foreground backdrop-blur-sm"
      aria-hidden="true"
    >
      camera telemetry…
    </div>
  )
}
