"use client"

import { useEffect } from "react"
import { fetchTextureBlob } from "@/lib/fetch-texture-blob"
import { resolveTextureUrl } from "@/lib/texture-url"
import { loadPresets } from "@/lib/preset-storage"
import type { PbrMapSet } from "@/lib/studio-store"

/**
 * Background preloader for all saved design presets.
 *
 * Flow:
 *  1. Wait ~1.5s after mount so the initial render / first preset finish
 *     painting first. We don't want to hog the network during the critical
 *     "first paint" path.
 *  2. Wait for `requestIdleCallback` (or a fallback timeout) so we only start
 *     when the main thread is idle — on tablets this prevents scroll jank.
 *  3. Load presets from localStorage/IndexedDB, then for every preset iterate
 *     over all PBR map channels and `fetchTextureBlob` each one. That populates
 *     the browser HTTP cache AND our persistent Cache Storage entry, so switching
 *     to any other preset later reads from cache instantly.
 *
 * This component renders nothing.
 */
export function PresetPreloader() {
  useEffect(() => {
    let cancelled = false
    const ac = new AbortController()

    const start = () => {
      if (cancelled) return
      // Schedule the actual work for when the browser is idle. Avoids
      // competing with first-paint and user interactions on slow devices.
      const ric =
        (window as unknown as { requestIdleCallback?: (cb: () => void) => number })
          .requestIdleCallback
      if (ric) {
        ric(() => run())
      } else {
        setTimeout(run, 0)
      }
    }

    const run = async () => {
      if (cancelled) return
      try {
        const presets = await loadPresets()

        // Flatten every texture URL across every preset and every side, filter
        // duplicates (albedo/normal can repeat if a preset reuses a map).
        const urls = new Set<string>()
        for (const p of presets) {
          collect(p.front, urls)
          collect(p.back, urls)
        }

        // Preload serially — a parallel Promise.all would trigger up to
        // presets * channels simultaneous fetches on weak networks and
        // swamp both the device CPU and the mobile radio. Serial + idle
        // yields a smooth, nearly-invisible warmup.
        for (const url of urls) {
          if (cancelled) return
          try {
            await fetchTextureBlob(url, ac.signal)
          } catch {
            /* individual failures are non-fatal — we just won't have that
               one warmed up, and the on-demand loader will try again. */
          }
        }
      } catch {
        /* swallow — preloading is best-effort */
      }
    }

    const timer = setTimeout(start, 1500)

    return () => {
      cancelled = true
      ac.abort()
      clearTimeout(timer)
    }
  }, [])

  return null
}

function collect(set: PbrMapSet, out: Set<string>) {
  const channels: (keyof PbrMapSet)[] = [
    "albedo",
    "normal",
    "roughness",
    "metallic",
    "ao",
    "height",
    "orm",
  ]
  for (const k of channels) {
    const raw = set[k]
    if (!raw) continue
    const resolved = resolveTextureUrl(raw)
    if (resolved) out.add(resolved)
  }
}
