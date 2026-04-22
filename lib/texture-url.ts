/**
 * Resolves a texture URL for consumption by Three.js TextureLoader.
 *
 * Any Vercel Blob URL is rewritten to go through our same-origin
 * `/api/texture?src=…` proxy. This:
 *
 *  - Avoids CORS entirely (browser thinks it's loading from its own origin).
 *  - Dodges networks / VPNs that block `*.public.blob.vercel-storage.com`
 *    while allowing the main app domain.
 *  - Lets the edge CDN cache the bytes immutably for 1 year, so repeat
 *    downloads of the same design are instant from browser cache.
 *
 * Anything that is already same-origin, a relative path, a data: URI, or a
 * blob: URL is returned as-is (no need to proxy).
 */

const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com"

export function resolveTextureUrl(input?: string): string | undefined {
  if (!input) return undefined
  if (input.startsWith("data:") || input.startsWith("blob:")) return input
  if (input.startsWith("/")) return input

  try {
    const u = new URL(input)
    if (u.hostname.endsWith(BLOB_HOST_SUFFIX)) {
      // Use an absolute-relative path so this works on any current origin
      // (production, preview, custom domains) without hardcoding hostnames.
      return `/api/texture?src=${encodeURIComponent(input)}`
    }
    return input
  } catch {
    // Not a parseable URL — assume it's already a relative path the caller
    // wants us to pass through verbatim.
    return input
  }
}
