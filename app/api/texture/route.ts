import type { NextRequest } from "next/server"

/**
 * Same-origin proxy for textures hosted in Vercel Blob.
 *
 * Why this exists:
 *  - Some corporate / mobile networks and VPNs (ours included) block or throttle
 *    `*.public.blob.vercel-storage.com` while letting the main app domain pass,
 *    which made texture downloads fail on macOS Chrome and some tablets.
 *  - macOS Chrome also occasionally pins a failed CORS preflight in disk cache,
 *    after which every subsequent direct blob fetch short-circuits to an error.
 *  - Proxying through our own origin removes the CORS round-trip entirely and
 *    lets the edge CDN cache the bytes close to the user. We also stream the
 *    response so large (~20–50 MB) PBR maps don't have to fully buffer.
 *
 * Security: we only allow URLs that live on the official Vercel Blob domain,
 * so this route cannot be abused as an open redirect / SSRF gadget.
 */

export const runtime = "edge"
// Edge runtime is used because (a) it streams the body through unchanged and
// (b) it pins the response to Vercel's edge network, giving the client a
// geographically-close cache hit on repeated texture downloads.

const ALLOWED_HOST_SUFFIX = ".public.blob.vercel-storage.com"

function isAllowedBlobUrl(u: URL): boolean {
  return u.protocol === "https:" && u.hostname.endsWith(ALLOWED_HOST_SUFFIX)
}

export async function GET(req: NextRequest) {
  const src = req.nextUrl.searchParams.get("src")
  if (!src) {
    return new Response("missing src", { status: 400 })
  }

  let target: URL
  try {
    target = new URL(src)
  } catch {
    return new Response("invalid src", { status: 400 })
  }

  if (!isAllowedBlobUrl(target)) {
    return new Response("blocked src", { status: 400 })
  }

  // Forward Range headers so the browser can resume / seek; most texture
  // fetches are plain GETs but streaming libraries occasionally range-probe.
  const range = req.headers.get("range") ?? undefined

  let upstream: Response
  try {
    upstream = await fetch(target.toString(), {
      headers: range ? { range } : undefined,
      // Edge runtime `cache: "force-cache"` lets the platform dedupe identical
      // upstream requests across users at the edge. Blob URLs are immutable
      // (the hash is in the pathname), so this is safe.
      cache: "force-cache",
    })
  } catch (err) {
    console.log("[v0] texture proxy upstream fetch failed:", target.toString(), err)
    return new Response("upstream error", { status: 502 })
  }

  if (!upstream.ok && upstream.status !== 206) {
    return new Response(`upstream ${upstream.status}`, { status: upstream.status })
  }

  // Copy only the content-type / content-length and rewrite cache headers to
  // something the browser + Vercel edge will aggressively cache. The Blob URL
  // itself contains a random hash, so we can treat responses as immutable.
  const headers = new Headers()
  const ct = upstream.headers.get("content-type")
  if (ct) headers.set("content-type", ct)
  const cl = upstream.headers.get("content-length")
  if (cl) headers.set("content-length", cl)
  const cr = upstream.headers.get("content-range")
  if (cr) headers.set("content-range", cr)
  const ar = upstream.headers.get("accept-ranges")
  if (ar) headers.set("accept-ranges", ar)

  headers.set(
    "cache-control",
    // Client-side + CDN: 1 year, immutable. See file-level comment for the
    // reasoning (Blob URLs are content-addressed so they never change).
    "public, max-age=31536000, s-maxage=31536000, immutable",
  )
  // Keep CORS wide open in case the image is ever read through a cross-origin
  // <img crossorigin> from a different deployment; same-origin fetches ignore
  // this header so it's harmless.
  headers.set("access-control-allow-origin", "*")
  headers.set("timing-allow-origin", "*")

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  })
}
