/**
 * Resolves a texture URL for consumption by Three.js TextureLoader.
 *
 * - Absolute URLs (http/https, data:, blob:) are returned as-is.
 * - Paths starting with `/` are treated as public assets.
 * - Anything else is treated as a private Blob pathname and routed through /api/file.
 */
export function resolveTextureUrl(input?: string): string | undefined {
  if (!input) return undefined
  if (/^(https?:|data:|blob:)/i.test(input)) return input
  if (input.startsWith("/")) return input
  return `/api/file?pathname=${encodeURIComponent(input)}`
}
