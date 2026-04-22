"use client"

import { useEffect, useState } from "react"
import { useTextureLoading } from "@/lib/texture-loading"
import { Spinner } from "@/components/ui/spinner"

/**
 * Small non-blocking overlay shown in the corner of the canvas while textures
 * are being downloaded.
 *
 * Why corner-pinned and not a full-screen modal:
 *  - The default card renders immediately with neutral (white / flat-normal)
 *    fallback textures, so the user can already interact with the scene while
 *    the real maps stream in behind the scenes.
 *  - A blocking modal would make small/fast transitions feel janky.
 *
 * The overlay auto-hides after a short debounce when `pending` drops to zero,
 * so very fast cache hits (< 150ms) never flash on screen.
 */
export function TextureLoadingOverlay() {
  const pending = useTextureLoading((s) => s.pending)
  const total = useTextureLoading((s) => s.total)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (pending > 0) {
      setVisible(true)
      return
    }
    // Keep the overlay on screen for a moment after completion so rapid
    // increment/decrement cycles (e.g. the 8 channels of a single preset
    // completing in a staggered order) read as one smooth progress bar
    // rather than a series of flashes.
    const t = setTimeout(() => setVisible(false), 350)
    return () => clearTimeout(t)
  }, [pending])

  if (!visible) return null

  const done = total - pending
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute right-4 top-4 z-20 flex items-center gap-3 rounded-full border bg-background/85 px-3 py-1.5 text-xs font-medium text-foreground shadow-lg backdrop-blur"
    >
      <Spinner className="size-3.5 text-foreground" />
      <span className="tabular-nums">
        {pending > 0 ? `Loading textures ${done}/${total}` : "Ready"}
      </span>
      <span
        className="h-1 w-20 overflow-hidden rounded-full bg-muted"
        aria-hidden="true"
      >
        <span
          className="block h-full bg-foreground transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </span>
    </div>
  )
}
