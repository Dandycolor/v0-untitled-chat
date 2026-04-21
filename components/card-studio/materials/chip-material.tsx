"use client"

import { useEffect, useMemo, useRef } from "react"
import * as THREE from "three"

type Props = {
  color: string
  metalness: number
  roughness: number
  anisotropy: number
  pattern: "grid" | "stripes" | "none"
  patternStrength: number
}

/**
 * Procedural metallic chip shader built on MeshPhysicalMaterial with onBeforeCompile.
 * The procedural contact pattern modulates roughness to simulate the etched surface of
 * a real chip. All edges use fwidth-based analytical anti-aliasing so we never get
 * pixel-sized moiré even at oblique angles or when the chip is far from the camera.
 */
export function useChipMaterial(props: Props): THREE.MeshPhysicalMaterial {
  const { color, metalness, roughness, anisotropy, pattern, patternStrength } = props

  const uniformsRef = useRef<{
    uPattern: { value: number }
    uPatternStrength: { value: number }
  }>({
    uPattern: { value: pattern === "grid" ? 1 : pattern === "stripes" ? 2 : 0 },
    uPatternStrength: { value: patternStrength },
  })

  const material = useMemo(() => {
    const mat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(color),
      metalness,
      roughness,
      anisotropy,
      anisotropyRotation: Math.PI * 0.25,
      envMapIntensity: 1.4,
      clearcoat: 0.2,
      clearcoatRoughness: 0.3,
    })

    mat.customProgramCacheKey = () => "chip-material-v2"

    mat.onBeforeCompile = (shader) => {
      // Share the same uniform objects across frames so updating .value hot-swaps live.
      shader.uniforms.uPattern = uniformsRef.current.uPattern
      shader.uniforms.uPatternStrength = uniformsRef.current.uPatternStrength

      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        `#include <common>
         varying vec2 vChipUv;`,
      )
      shader.vertexShader = shader.vertexShader.replace(
        "#include <uv_vertex>",
        `#include <uv_vertex>
         vChipUv = uv;`,
      )

      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <common>",
        `#include <common>
         varying vec2 vChipUv;
         uniform int uPattern;
         uniform float uPatternStrength;

         // Analytical AA line: returns how close we are to a line at frac==0.5 in the given cell.
         // Fades with screen-space derivative so the line never becomes thinner than one pixel.
         float aaLine(float v, float freq) {
           float x = fract(v * freq);
           float d = abs(x - 0.5);
           // Pixel width of one cell along this axis (in texture units, via fwidth).
           float fw = fwidth(v * freq) * 0.5 + 1e-4;
           // Target a visual line width of ~1.5 px regardless of distance.
           float edge = clamp(fw * 1.5, 0.005, 0.5);
           return 1.0 - smoothstep(edge * 0.8, edge * 1.6, d);
         }

         float chipPattern(vec2 uv) {
           if (uPattern == 1) {
             // Grid: take max of two AA lines, one per axis.
             float lx = aaLine(uv.x, 6.0);
             float ly = aaLine(uv.y, 6.0);
             return max(lx, ly);
           } else if (uPattern == 2) {
             return aaLine(uv.x, 12.0);
           }
           return 0.0;
         }`,
      )

      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <roughnessmap_fragment>",
        `float roughnessFactor = roughness;
         float p = chipPattern(vChipUv);
         // Map line presence [0..1] to a symmetric roughness delta centered on 0.
         roughnessFactor = clamp(roughnessFactor + (p - 0.5) * uPatternStrength, 0.02, 1.0);
        `,
      )
    }
    return mat
  }, [])

  // Live scalar updates (no recompile)
  useEffect(() => {
    material.color.set(color)
    material.metalness = metalness
    material.roughness = roughness
    material.anisotropy = anisotropy
  }, [material, color, metalness, roughness, anisotropy])

  // Live uniform updates (no recompile)
  useEffect(() => {
    uniformsRef.current.uPattern.value = pattern === "grid" ? 1 : pattern === "stripes" ? 2 : 0
    uniformsRef.current.uPatternStrength.value = patternStrength
  }, [pattern, patternStrength])

  return material
}
