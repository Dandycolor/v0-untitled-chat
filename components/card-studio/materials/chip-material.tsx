"use client"

import { useEffect, useMemo, useRef } from "react"
import * as THREE from "three"

type Props = {
  color: string
  metalness: number
  roughness: number
  anisotropy: number
  /** 0..1 — how strongly the micro-noise modulates roughness. */
  noiseAmount: number
  /** Frequency multiplier (typical range 4..64). Higher = finer grain. */
  noiseScale: number
}

/**
 * Procedural metallic chip shader built on MeshPhysicalMaterial with onBeforeCompile.
 *
 * Surface micro-detail is produced by value-noise that modulates both roughness and the
 * normal, which makes the metal look physically etched rather than perfectly polished.
 * Noise is sampled at two octaves and AA'd via fwidth() against the per-fragment UV
 * derivative, so there are no pixel-sized moiré artifacts at oblique angles or at distance.
 */
export function useChipMaterial(props: Props): THREE.MeshPhysicalMaterial {
  const { color, metalness, roughness, anisotropy, noiseAmount, noiseScale } = props

  const uniformsRef = useRef({
    uNoiseAmount: { value: noiseAmount },
    uNoiseScale: { value: noiseScale },
  })

  const material = useMemo(() => {
    const mat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(color),
      metalness,
      roughness,
      anisotropy,
      anisotropyRotation: 0, // 0 = horizontal brushed texture
      envMapIntensity: 1.4,
      clearcoat: 0.2,
      clearcoatRoughness: 0.3,
    })

    // Unique cache key so Three never reuses a stale compiled program.
    mat.customProgramCacheKey = () => "chip-material-noise-v1"

    mat.onBeforeCompile = (shader) => {
      // Share the same uniform objects across frames so updating .value hot-swaps live.
      shader.uniforms.uNoiseAmount = uniformsRef.current.uNoiseAmount
      shader.uniforms.uNoiseScale = uniformsRef.current.uNoiseScale

      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        `#include <common>
         varying vec2 vChipUv;`,
      )
      shader.vertexShader = shader.vertexShader.replace(
        "#include <uv_vertex>",
        `#include <uv_vertex>
         // For the vertical EMV element (where uv.y varies more than uv.x after scaling),
         // transpose UV to make the pattern horizontal instead of vertical.
         vChipUv = (uv.y > uv.x * 2.0) ? uv.yx : uv;`,
      )

      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <common>",
        `#include <common>
         varying vec2 vChipUv;
         uniform float uNoiseAmount;
         uniform float uNoiseScale;

         // Cheap deterministic hash.
         float chipHash(vec2 p) {
           p = fract(p * vec2(123.34, 456.21));
           p += dot(p, p + 45.32);
           return fract(p.x * p.y);
         }

         // Value noise with bilinear interpolation and fwidth-based AA. When the uv
         // derivative becomes larger than one noise cell, we blend back to the mean 0.5
         // so the surface returns to a calm tone instead of crawling pixel fireflies.
         float chipValueNoise(vec2 uv) {
           vec2 i = floor(uv);
           vec2 f = fract(uv);
           vec2 u = f * f * (3.0 - 2.0 * f);
           float a = chipHash(i);
           float b = chipHash(i + vec2(1.0, 0.0));
           float c = chipHash(i + vec2(0.0, 1.0));
           float d = chipHash(i + vec2(1.0, 1.0));
           float n = mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
           float fw = fwidth(uv.x) + fwidth(uv.y);
           float aa = 1.0 - smoothstep(0.6, 1.5, fw);
           return mix(0.5, n, aa);
         }

         // Two-octave FBM — still lightweight, gives the chip a "brushed / etched" feel.
         float chipNoise(vec2 uv) {
           float n = chipValueNoise(uv);
           n += 0.5 * chipValueNoise(uv * 2.17 + 7.3);
           return n / 1.5;
         }`,
      )

      // Modulate roughness around the base value using centered noise.
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <roughnessmap_fragment>",
        `float roughnessFactor = roughness;
         float chipN = chipNoise(vChipUv * uNoiseScale);
         roughnessFactor = clamp(roughnessFactor + (chipN - 0.5) * uNoiseAmount, 0.02, 1.0);`,
      )

      // Perturb the normal with the gradient of the same noise so the micro-detail is
      // visible in specular highlights, not just in the matte response.
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
         {
           float eps = 1.0 / max(uNoiseScale, 1.0);
           vec2 nuv = vChipUv * uNoiseScale;
           float nx1 = chipNoise(nuv + vec2(eps, 0.0));
           float nx0 = chipNoise(nuv - vec2(eps, 0.0));
           float ny1 = chipNoise(nuv + vec2(0.0, eps));
           float ny0 = chipNoise(nuv - vec2(0.0, eps));
           vec3 bump = normalize(vec3((nx0 - nx1), (ny0 - ny1), 1.0));
           normal = normalize(mix(normal, normalize(normal + bump * 0.25 * uNoiseAmount), 0.75));
         }`,
      )
    }
    return mat
  }, [])

  // Live scalar updates (no recompile).
  useEffect(() => {
    material.color.set(color)
    material.metalness = metalness
    material.roughness = roughness
    material.anisotropy = anisotropy
  }, [material, color, metalness, roughness, anisotropy])

  // Live uniform updates (no recompile).
  useEffect(() => {
    uniformsRef.current.uNoiseAmount.value = noiseAmount
    uniformsRef.current.uNoiseScale.value = noiseScale
  }, [noiseAmount, noiseScale])

  return material
}
