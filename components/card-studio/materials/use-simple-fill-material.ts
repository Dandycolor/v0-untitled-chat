"use client"

import { useMemo, useEffect, useRef } from "react"
import * as THREE from "three"
import type { FillConfig } from "@/lib/studio-store"
import { makeFillTexture } from "@/lib/fill-texture"

/**
 * A dead-simple two-sided material for "fill mode" — no PBR, no normal maps,
 * no roughness/metalness. Just flat color or gradient on each side.
 *
 * Uses a custom ShaderMaterial that samples front or back texture based on
 * gl_FrontFacing, giving us a clean, textureless card surface.
 */
export function useSimpleFillMaterial(
  frontFill: FillConfig,
  backFill: FillConfig,
  sideAxis: 0 | 1 | 2 = 2,
) {
  // Generate fill textures
  const frontTex = useMemo(
    () => makeFillTexture(frontFill) ?? createSolidTexture(frontFill.color1),
    [frontFill.type, frontFill.color1, frontFill.color2, frontFill.angle],
  )
  const backTex = useMemo(
    () => makeFillTexture(backFill) ?? createSolidTexture(backFill.color1),
    [backFill.type, backFill.color1, backFill.color2, backFill.angle],
  )

  // Cleanup textures on change
  useEffect(() => () => { frontTex?.dispose() }, [frontTex])
  useEffect(() => () => { backTex?.dispose() }, [backTex])

  // Create shader material
  const material = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uFrontTex: { value: frontTex },
        uBackTex: { value: backTex },
        uSideAxis: { value: sideAxis },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vNormal;
        
        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uFrontTex;
        uniform sampler2D uBackTex;
        uniform int uSideAxis;
        
        varying vec2 vUv;
        varying vec3 vNormal;
        
        void main() {
          // Determine which side we're on based on the normal direction
          float sideVal = 0.0;
          if (uSideAxis == 0) sideVal = vNormal.x;
          else if (uSideAxis == 1) sideVal = vNormal.y;
          else sideVal = vNormal.z;
          
          // Front = positive side, Back = negative side
          vec4 color;
          if (sideVal > 0.0) {
            color = texture2D(uFrontTex, vUv);
          } else {
            color = texture2D(uBackTex, vUv);
          }
          
          gl_FragColor = color;
        }
      `,
      side: THREE.DoubleSide,
    })
    return mat
  }, [])

  // Update uniforms when textures change (without recreating material)
  const uniformsRef = useRef(material.uniforms)
  useEffect(() => {
    uniformsRef.current.uFrontTex.value = frontTex
    uniformsRef.current.uBackTex.value = backTex
    uniformsRef.current.uSideAxis.value = sideAxis
  }, [frontTex, backTex, sideAxis])

  return material
}

/**
 * Creates a simple 1x1 solid color texture as fallback.
 */
function createSolidTexture(hex: string): THREE.Texture {
  const canvas = document.createElement("canvas")
  canvas.width = 4
  canvas.height = 4
  const ctx = canvas.getContext("2d")!
  ctx.fillStyle = hex
  ctx.fillRect(0, 0, 4, 4)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
