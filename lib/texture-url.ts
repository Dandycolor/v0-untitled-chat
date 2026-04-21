/**
 * Resolves a texture URL for consumption by Three.js TextureLoader.
 *
 * With a public Blob store, preset textures come back as absolute CDN URLs,
 * so this is almost a pass-through. We still normalize undefined / empty inputs.
 */
export function resolveTextureUrl(input?: string): string | undefined {
  if (!input) return undefined
  return input
}
