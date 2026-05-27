/**
 * Resolves a texture URL for consumption by Three.js TextureLoader.
 *
 * Vercel Blob URLs have proper CORS headers, so we load them directly
 * without proxying. This avoids issues with the proxy returning HTML errors.
 *
 * Anything that is already same-origin, a relative path, a data: URI, or a
 * blob: URL is returned as-is.
 */

export function resolveTextureUrl(input?: string): string | undefined {
  if (!input) return undefined
  // Pass through as-is - Vercel Blob has CORS enabled
  return input
}
