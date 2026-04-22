"use client"

/**
 * Fetches a texture URL into a Blob with:
 *
 *  1. Cache Storage API ("texture-cache-v1") — persistent across page reloads,
 *     survives hard refresh; eliminates re-downloads when the user flips back
 *     to a design they already looked at.
 *  2. Retry with exponential backoff (0.3s / 1.2s / 3s). Single transient
 *     errors (mobile network blips, initial VPN handshake) stop bricking the
 *     loader until the next preset switch.
 *  3. Abort signal propagation so React effect cleanup really cancels the
 *     in-flight request chain instead of leaving it hanging.
 *
 * `url` is expected to already be the proxied /api/texture URL when the
 * source is a Vercel Blob, per `resolveTextureUrl`.
 */

const CACHE_NAME = "texture-cache-v1"
const MAX_ATTEMPTS = 3
const BACKOFF_MS = [300, 1200, 3000]

async function openCache(): Promise<Cache | null> {
  try {
    if (typeof caches === "undefined") return null
    return await caches.open(CACHE_NAME)
  } catch {
    // Safari Private Mode and some locked-down corporate browsers reject
    // `caches.open`. That's fine, we just skip persistent caching there.
    return null
  }
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t)
        reject(new DOMException("aborted", "AbortError"))
      },
      { once: true },
    )
  })
}

/**
 * Fetches `url` and returns a Blob. Uses Cache Storage as a persistent L1.
 *
 * @throws AbortError if `signal` is aborted.
 * @throws Error with a descriptive message after all retries are exhausted.
 */
export async function fetchTextureBlob(
  url: string,
  signal?: AbortSignal,
): Promise<Blob> {
  // Fast path: check persistent cache first. A hit here means we never even
  // touch the network — critical for the "tablet flips back to a design"
  // scenario and for users on throttled / hostile networks.
  const cache = await openCache()
  if (cache) {
    try {
      const hit = await cache.match(url)
      if (hit) {
        return await hit.blob()
      }
    } catch {
      /* ignore cache read errors, fall through to network */
    }
  }

  let lastError: unknown = null
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (signal?.aborted) {
      throw new DOMException("aborted", "AbortError")
    }
    try {
      const res = await fetch(url, {
        signal,
        // `default` lets the HTTP cache layer take over (our proxy route sets
        // immutable cache-control for Blob-hosted images), so on a warm
        // browser cache we don't even hit the network, let alone the proxy.
        cache: "default",
        credentials: "omit",
      })
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`)
      }
      // Clone into Cache Storage BEFORE reading the body, otherwise the body
      // stream is consumed and `cache.put` gets an empty response.
      if (cache) {
        try {
          await cache.put(url, res.clone())
        } catch {
          /* cache writes are best-effort */
        }
      }
      return await res.blob()
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") throw err
      lastError = err
      const backoff = BACKOFF_MS[attempt]
      if (attempt < MAX_ATTEMPTS - 1) {
        console.log(
          `[v0] texture fetch attempt ${attempt + 1} failed, retrying in ${backoff}ms:`,
          url,
          err,
        )
        await sleep(backoff, signal)
      }
    }
  }

  throw new Error(
    `Failed to fetch ${url} after ${MAX_ATTEMPTS} attempts: ${(lastError as Error)?.message ?? lastError}`,
  )
}
