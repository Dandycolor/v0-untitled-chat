"use client"

import { useMemo, useRef } from "react"
import * as THREE from "three"
import { useFrame } from "@react-three/fiber"

/**
 * Holographic shine overlay — a view-dependent iridescent band that mimics the
 * react-native-shine effect. Implemented as a plane that sits just above the
 * card's front face and runs a GLSL shader which:
 *
 *   1. Computes a rounded-rectangle mask in object space (so the shine never
 *      escapes the card silhouette, same trick used in GlareLayer's canvas
 *      mask but done analytically in the shader).
 *   2. Derives a view angle from `dot(surface normal, view direction)`. This
 *      is what makes the rainbow shift when the camera orbits the card — the
 *      holographic "tilt" effect.
 *   3. Paints wrapping HSV rainbow stripes using that angle + UV, so there are
 *      visible color bands that travel across the card as it rotates.
 *   4. Multiplies everything by a fresnel-like falloff so the shine is brightest
 *      where the surface grazes the camera, like a real prismatic film.
 *
 * Uses additive blending to sit on top of the PBR result without darkening it.
 */
export function HoloLayer({
  width,
  height,
  position = [0, 0, 0.015],
  rotation = [0, 0, 0],
  intensity,
  scale,
  hueShift,
  cornerRadius,
}: {
  width: number
  height: number
  position?: [number, number, number]
  rotation?: [number, number, number]
  /** Overall multiplier of the rainbow band brightness. */
  intensity: number
  /** Stripe frequency: how many rainbow bands fit across the card. */
  scale: number
  /** Static rotation of the color wheel (0..1 maps to 0..360°). */
  hueShift: number
  /** Rounded corner radius as fraction of the shorter side (0..0.5). ISO ID-1 ≈ 0.06. */
  cornerRadius?: number
}) {
  const matRef = useRef<THREE.ShaderMaterial>(null)

  // Radius in object space. The plane goes from (-width/2 .. +width/2) so we
  // pass the corner radius in the same units the shader expects.
  const radius = useMemo(() => {
    const r = cornerRadius ?? 0.06
    return r * Math.min(width, height)
  }, [cornerRadius, width, height])

  // Live-update uniform refs — avoids shader recompile when sliders move.
  useFrame(({ clock }) => {
    const mat = matRef.current
    if (!mat) return
    mat.uniforms.uIntensity.value = intensity
    mat.uniforms.uScale.value = scale
    mat.uniforms.uHueShift.value = hueShift
    mat.uniforms.uTime.value = clock.elapsedTime
  })

  const uniforms = useMemo(
    () => ({
      uIntensity: { value: intensity },
      uScale: { value: scale },
      uHueShift: { value: hueShift },
      uSize: { value: new THREE.Vector2(width, height) },
      uRadius: { value: radius },
      uTime: { value: 0 },
    }),
    // The uniforms object is created once; live values are updated in useFrame.
    // Width/height/radius change rarely (orientation switch) and are picked up below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  // If orientation changes the plane's width/height, keep uniforms in sync.
  useMemo(() => {
    uniforms.uSize.value.set(width, height)
    uniforms.uRadius.value = radius
  }, [uniforms, width, height, radius])

  return (
    <mesh position={position} rotation={rotation} renderOrder={2}>
      <planeGeometry args={[width, height, 1, 1]} />
      <shaderMaterial
        ref={matRef}
        transparent
        depthWrite={false}
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
    // Local XY in object space ([-w/2..w/2], [-h/2..h/2]).
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

  uniform float uIntensity;
  uniform float uScale;
  uniform float uHueShift;
  uniform vec2  uSize;
  uniform float uRadius;
  uniform float uTime;

  // Rounded-rectangle SDF. Negative inside the card silhouette.
  float sdRoundedBox(vec2 p, vec2 halfSize, float r) {
    vec2 q = abs(p) - halfSize + vec2(r);
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }

  // Standard HSV -> RGB conversion.
  vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }

  void main() {
    // 1. Card-silhouette mask. Anti-aliased via fwidth so edges stay smooth.
    float d = sdRoundedBox(vLocal, uSize * 0.5, uRadius);
    float aa = fwidth(d) * 1.5;
    float mask = 1.0 - smoothstep(-aa, aa, d);
    if (mask <= 0.001) discard;

    // 2. View direction at this fragment. A holographic film shifts its color
    //    based on how steep the viewing angle is relative to the surface.
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float ndv = clamp(dot(normalize(vWorldNormal), viewDir), 0.0, 1.0);
    float viewAngle = acos(ndv); // 0 head-on, ~π/2 grazing

    // 3. Stripe coordinate: diagonal UV + a contribution from the view angle.
    //    When camera moves, viewAngle changes and the bands slide across the card.
    float stripe = (vUv.x * 0.6 + vUv.y * 0.4) * uScale + viewAngle * 1.8;

    // Wrap into hue space and add user-controlled static offset.
    float hue = fract(stripe + uHueShift);
    vec3 rainbow = hsv2rgb(vec3(hue, 0.85, 1.0));

    // 4. Edge-grazing boost: a mild fresnel factor so the effect is strongest
    //    where the card catches light, just like a real prismatic sticker.
    float fresnel = pow(1.0 - ndv, 1.4);
    float shimmer = mix(0.35, 1.0, fresnel);

    // Subtle temporal flicker — very small, keeps holo alive even when camera is static.
    float flicker = 0.95 + 0.05 * sin(uTime * 0.6 + stripe);

    vec3 col = rainbow * shimmer * flicker * uIntensity;
    gl_FragColor = vec4(col * mask, mask * uIntensity * 0.9);
  }
`
