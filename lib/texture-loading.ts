"use client"

import { create } from "zustand"

/**
 * Tracks how many textures are currently being fetched.
 *
 * Used to drive the loading overlay inside the canvas. Each in-flight fetch
 * increments `pending` on start and decrements on settle (success or error),
 * and also reports `total` so the overlay can show "3 / 8 loaded".
 *
 * Kept as a separate store (not on studio-store) because:
 *  - it changes at high frequency (once per texture channel) and we don't
 *    want every studio-store selector re-evaluating on each increment,
 *  - it has zero persistence semantics.
 */
export type LoadingState = {
  pending: number
  total: number
  note: (ok: boolean) => void
  start: () => void
  reset: () => void
}

export const useTextureLoading = create<LoadingState>((set) => ({
  pending: 0,
  total: 0,
  start: () => set((s) => ({ pending: s.pending + 1, total: s.total + 1 })),
  note: () => set((s) => ({ pending: Math.max(0, s.pending - 1) })),
  reset: () => set({ pending: 0, total: 0 }),
}))
