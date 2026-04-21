"use client"

import { useMemo, useRef } from "react"
import * as THREE from "three"
import { useFrame } from "@react-three/fiber"

/**
 * Trading-card "foil" overlay — a soft pearlescent sheen blob combined with
 * tiny sparkles that twinkle based on the camera angle. Distinct from HoloLayer
 * (rainbow bands): this one is the MTG-style glitter look.
 *
 * The shader layers two things inside the rounded-rect silhouette:
 *
 *   1. A smooth moving sheen blob whose center is driven by the view direction
 *      so it appears to glide across the card as the user tilts the camera.
 *   2. Hash-based sparkle points. Each pixel hashes to a random "facet" axis;
 *      when the view direction is close to that axis the sparkle lights up.
 *      This gives the characteristic "stars pop in and out" behavior of foil.
 */
export function FoilLayer({
  width,
  height,
  position = [0, 0, 0.018],
  rotation = [0, 0, 0],
  sheen,
  sparkle,
  density,
  tintColor,
  cornerRadius,
}: {
  width: number
  height: number
  position?: [number, number, number]
  rotation?: [number, number, number]
  /** Brightness of the large pearlescent blob (0..2). */
  sheen: number
  /** Brightness of individual sparkle stars (0..3). */
  sparkle: number
  /** Sparkle grid density — higher = more, smaller stars. */
  density: number
  /** Hex color the sheen blob is tinted with. Sparkles stay white. */
  tintColor: string
  /** Rounded corner radius as fraction of the shorter side. ISO ID-1 ≈ 0.06. */
  cornerRadius?: number
}) {
  const matRef = useRef<THREE.ShaderMaterial>(null)

  const radius = useMemo(() => {
    const r = cornerRadius ?? 0.06
    return r * Math.min(width, height)
  }, [cornerRadius, width, height])

  const uniforms = useMemo(
    () => ({
      uSheen: { value: sheen },
      uSparkle: { value: sparkle },
      uDensity: { value: density },
      uTint: { value: new THREE.Color(tintColor) },
      uSize: { value: new THREE.Vector2(width, height) },
      uRadius: { value: radius },
      uTime: { value: 0 },
    }),
    // Uniforms are created once; their values are updated each frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  useMemo(() => {
    uniforms.uSize.value.set(width, height)
    uniforms.uRadius.value = radius
  }, [uniforms, width, height, radius])

  useFrame(({ clock }) => {
    const mat = matRef.current
    if (!mat) return
    mat.uniforms.uSheen.value = sheen
    mat.uniforms.uSparkle.value = sparkle
    mat.uniforms.uDensity.value = density
    mat.uniforms.uTint.value.set(tintColor)
    mat.uniforms.uTime.value = clock.elapsedTime
  })

  return (
    <mesh position={position} rotation={rotation} renderOrder={3}>
      <planeGeometry args={[width, height, 1, 1]} />
      <shaderMaterial
        ref={matRef}
        transparent
        depthWrite={false}
        // Additive blending so foil reads as added light, not a darkening overlay.
        blending={THREE.AdditiveBlending}
        toneMapped={false}
        uniforms={uniforms}
        vertexShader={VERT}
        fragmentShader={FRAG}
      />
    </mesh>
  )
}

const VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  varying vec2 vLocal;

  void main() {
    vUv = uv;
    vLocal = position.xy;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`

const FRAG = /* glsl */ `
  precision highp float;

  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  varying vec2 vLocal;

  uniform float uSheen;
  uniform float uSparkle;
  uniform float uDensity;
  uniform vec3  uTint;
  uniform vec2  uSize;
  uniform float uRadius;
  uniform float uTime;

  // Rounded-rectangle SDF, negative inside.
  float sdRoundedBox(vec2 p, vec2 halfSize, float r) {
    vec2 q = abs(p) - halfSize + vec2(r);
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }

  // Cheap 2D hash for procedural sparkle placement.
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  vec2 hash22(vec2 p) {
    return vec2(hash12(p), hash12(p + 17.17));
  }

  void main() {
    // ---- 1. Silhouette mask ----
    float d = sdRoundedBox(vLocal, uSize * 0.5, uRadius);
    float aa = fwidth(d) * 1.5;
    float mask = 1.0 - smoothstep(-aa, aa, d);
    if (mask <= 0.001) discard;

    // ---- 2. View direction and "tilt vector" ----
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);
    // Project V onto the card's tangent plane — this is how much and which way
    // the user is looking from. Used for both sheen position and sparkle match.
    vec3 tangentV = V - N * dot(V, N);
    // Rotate into the plane's local XY via its basis vectors. For a Z-up plane
    // tangent X/Y are just X and Y in world-space after modelMatrix; since this
    // plane is authored flat, the world tangent projects cleanly to 2D.
    vec2 tilt = tangentV.xy;

    // ---- 3. Large moving sheen blob ----
    // Center of the blob glides with the tilt vector; size is a function of
    // the card's short side, so it looks consistent at any aspect ratio.
    vec2 blobCenter = uSize * 0.5 + vLocal - tilt * min(uSize.x, uSize.y) * 1.8;
    float blobDist = length(vLocal - (-tilt * min(uSize.x, uSize.y) * 0.9));
    float blobR = min(uSize.x, uSize.y) * 0.45;
    float sheenFalloff = 1.0 - smoothstep(blobR * 0.2, blobR, blobDist);
    // Soft power curve gives a painterly glow instead of a hard disk.
    sheenFalloff = pow(sheenFalloff, 1.6);

    // Micro-variation on top of the blob so it doesn't look like a flat disk.
    float micro = 0.7 + 0.3 * sin(vUv.x * 24.0 + vUv.y * 18.0 + uTime * 0.6);
    vec3 sheen = uTint * sheenFalloff * micro * uSheen;

    // ---- 4. Sparkle stars ----
    // Tile the card into a grid; within each cell pick a random star position
    // and a random "facet direction". The star lights up only when the view's
    // tangent tilt roughly matches the facet direction, giving the sparkle
    // its classic angle-dependent pop.
    float density = max(1.0, uDensity);
    vec2 gridUv = vUv * density;
    vec2 cell = floor(gridUv);
    vec2 f = fract(gridUv);

    vec2 starPos = hash22(cell);                  // 0..1 position in cell
    vec2 facetDir = normalize(hash22(cell + 7.0) * 2.0 - 1.0);

    // Distance from this fragment to the star within the cell.
    float starDist = length(f - starPos);
    // Star has a tiny circular core; use an inverse-square-ish falloff so it
    // reads as a bright pinprick rather than a fuzzy dot.
    float starCore = smoothstep(0.06, 0.0, starDist);

    // Facet alignment: 1 when the camera's in-plane direction matches the
    // facet's direction, 0 otherwise. Pow sharpens the response so sparkles
    // only pop near the matching angle.
    float align = clamp(dot(normalize(tilt + 1e-5), facetDir), 0.0, 1.0);
    float facet = pow(align, 28.0);

    // Per-star temporal breathing + per-star brightness variety.
    float phase = hash12(cell + 3.7) * 6.28;
    float breathe = 0.6 + 0.4 * sin(uTime * 1.4 + phase);
    float brightness = mix(0.4, 1.0, hash12(cell + 11.2));

    float starIntensity = starCore * facet * breathe * brightness;
    // Sparkles stay roughly white so they read as specular glints on any tint.
    vec3 stars = vec3(1.0, 0.98, 0.92) * starIntensity * uSparkle;

    vec3 col = sheen + stars;

    // Slight overall fresnel boost — foil is brighter when light is grazing.
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    float fresnel = mix(0.85, 1.25, pow(1.0 - ndv, 1.2));
    col *= fresnel;

    // Output with additive alpha so it blends cleanly over the PBR result.
    float a = clamp(max(max(col.r, col.g), col.b), 0.0, 1.0) * mask;
    gl_FragColor = vec4(col * mask, a);
  }
`
