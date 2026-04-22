import * as THREE from "three"
import type { FillConfig } from "@/lib/studio-store"

/**
 * Render a FillConfig into a small CanvasTexture that can plug into the card's
 * albedo slot. 1024×640 roughly matches ISO ID-1 aspect (1.585), which keeps
 * linear gradients straight when the card material samples with standard UVs.
 *
 * Returns `null` when the fill is disabled (`type === "none"`) so callers can
 * treat that as "fall back to the preset PBR albedo".
 */
export function makeFillTexture(cfg: FillConfig): THREE.CanvasTexture | null {
  if (cfg.type === "none") return null

  // Guard against SSR / non-DOM execution paths. `card-model.tsx` only runs on
  // the client, but being defensive here keeps this helper reusable.
  if (typeof document === "undefined") return null

  const canvas = document.createElement("canvas")
  canvas.width = 1024
  canvas.height = 640
  const ctx = canvas.getContext("2d")
  if (!ctx) return null

  if (cfg.type === "solid") {
    ctx.fillStyle = cfg.color1
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  } else {
    // Convert the user-facing angle (0° = left→right, 90° = bottom→top) into
    // canvas-space start/end coordinates. Canvas Y axis points down, so we
    // invert sin to keep 90° visually pointing "up" the card as the user sees it.
    const rad = (cfg.angle * Math.PI) / 180
    const cx = canvas.width / 2
    const cy = canvas.height / 2
    // Span the longest possible line through the rectangle in that direction
    // so the two stops always land on opposite edges regardless of angle.
    const len =
      Math.abs(canvas.width * Math.cos(rad)) + Math.abs(canvas.height * Math.sin(rad))
    const dx = (Math.cos(rad) * len) / 2
    const dy = (-Math.sin(rad) * len) / 2
    const grad = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy)
    grad.addColorStop(0, cfg.color1)
    grad.addColorStop(1, cfg.color2)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.anisotropy = 8
  tex.needsUpdate = true
  return tex
}
