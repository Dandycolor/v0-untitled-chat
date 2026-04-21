"use client"

import { useMemo } from "react"
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
 * Adds a subtle procedural surface pattern (grid contacts or stripes) that modulates
 * roughness and normal, producing the characteristic micro-reflection of a real chip.
 */
export function useChipMaterial(props: Props): THREE.MeshPhysicalMaterial {
  const { color, metalness, roughness, anisotropy, pattern, patternStrength } = props

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
    return mat
  }, [])

  // Keep scalars live
  useMemo(() => {
    material.color.set(color)
    material.metalness = metalness
    material.roughness = roughness
    material.anisotropy = anisotropy
  }, [material, color, metalness, roughness, anisotropy])

  // Swap in onBeforeCompile when pattern changes
  useMemo(() => {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uPattern = { value: pattern === "grid" ? 1 : pattern === "stripes" ? 2 : 0 }
      shader.uniforms.uPatternStrength = { value: patternStrength }

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
         float chipPattern(vec2 uv) {
           if (uPattern == 1) {
             vec2 g = abs(fract(uv * 6.0) - 0.5);
             float line = smoothstep(0.45, 0.5, max(g.x, g.y));
             return line;
           } else if (uPattern == 2) {
             float line = smoothstep(0.45, 0.5, abs(fract(uv.x * 12.0) - 0.5));
             return line;
           }
           return 0.0;
         }`,
      )

      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <roughnessmap_fragment>",
        `float roughnessFactor = roughness;
         float p = chipPattern(vChipUv);
         roughnessFactor = clamp(roughnessFactor + (p - 0.5) * uPatternStrength, 0.02, 1.0);
        `,
      )
    }
    material.needsUpdate = true
  }, [material, pattern, patternStrength])

  return material
}
