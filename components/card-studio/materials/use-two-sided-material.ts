"use client"

import { useEffect, useMemo, useRef } from "react"
import * as THREE from "three"
import { useLoader } from "@react-three/fiber"
import { resolveTextureUrl } from "@/lib/texture-url"
import type { PbrMapSet } from "@/lib/studio-store"

type Params = {
  front: PbrMapSet
  back: PbrMapSet
  roughness: number
  metalness: number
  normalScale: number
  clearcoat: number
  clearcoatRoughness: number
  /** 0=X, 1=Y, 2=Z — object-local axis that points from back side to front side. */
  sideAxis: 0 | 1 | 2
}

// Module-level 1x1 neutral textures. Created lazily once the client is running.
let NEUTRAL_WHITE: THREE.Texture | null = null
let NEUTRAL_NORMAL: THREE.Texture | null = null
function neutralWhite(): THREE.Texture {
  if (NEUTRAL_WHITE) return NEUTRAL_WHITE
  const data = new Uint8Array([255, 255, 255, 255])
  const t = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat)
  t.needsUpdate = true
  t.colorSpace = THREE.NoColorSpace
  NEUTRAL_WHITE = t
  return t
}
function neutralNormal(): THREE.Texture {
  if (NEUTRAL_NORMAL) return NEUTRAL_NORMAL
  // Tangent-space neutral normal: (0.5, 0.5, 1.0)
  const data = new Uint8Array([128, 128, 255, 255])
  const t = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat)
  t.needsUpdate = true
  t.colorSpace = THREE.NoColorSpace
  NEUTRAL_NORMAL = t
  return t
}

/**
 * Loads a texture for a URL. When the URL is absent, returns a neutral fallback
 * (white for color/ORM channels; tangent-space-neutral for normals). Always returns
 * a valid Texture so GL samplers never receive null.
 */
function useMaybeTexture(
  url: string | undefined,
  colorSpace: THREE.ColorSpace,
  isNormal = false,
): { tex: THREE.Texture; present: boolean } {
  const resolved = resolveTextureUrl(url)
  const PLACEHOLDER = "/textures/doodle/albedo.png"
  // Always call useLoader with a valid URL to keep hook order stable.
  const loaded = useLoader(THREE.TextureLoader, resolved ?? PLACEHOLDER) as THREE.Texture
  return useMemo(() => {
    if (resolved) {
      const t = loaded.clone()
      t.needsUpdate = true
      t.colorSpace = colorSpace
      t.wrapS = THREE.ClampToEdgeWrapping
      t.wrapT = THREE.ClampToEdgeWrapping
      t.anisotropy = 8
      return { tex: t, present: true }
    }
    return { tex: isNormal ? neutralNormal() : neutralWhite(), present: false }
  }, [loaded, resolved, colorSpace, isNormal])
}

/**
 * Builds a MeshPhysicalMaterial that samples two PBR map sets and blends between them
 * based on object-local normal direction (positive side → front set, negative → back set).
 */
export function useTwoSidedPhysicalMaterial(params: Params): THREE.MeshPhysicalMaterial {
  const { front, back, roughness, metalness, normalScale, clearcoat, clearcoatRoughness, sideAxis } =
    params

  const frontAlbedo = useMaybeTexture(front.albedo, THREE.SRGBColorSpace)
  const backAlbedo = useMaybeTexture(back.albedo, THREE.SRGBColorSpace)
  const frontNormal = useMaybeTexture(front.normal, THREE.NoColorSpace, true)
  const backNormal = useMaybeTexture(back.normal, THREE.NoColorSpace, true)
  const frontRough = useMaybeTexture(front.roughness ?? front.orm, THREE.NoColorSpace)
  const backRough = useMaybeTexture(back.roughness ?? back.orm, THREE.NoColorSpace)
  const frontMetal = useMaybeTexture(front.metallic ?? front.orm, THREE.NoColorSpace)
  const backMetal = useMaybeTexture(back.metallic ?? back.orm, THREE.NoColorSpace)
  const frontAo = useMaybeTexture(front.ao ?? front.orm, THREE.NoColorSpace)
  const backAo = useMaybeTexture(back.ao ?? back.orm, THREE.NoColorSpace)

  const materialRef = useRef<THREE.MeshPhysicalMaterial | null>(null)

  const material = useMemo(() => {
    const mat = new THREE.MeshPhysicalMaterial({
      roughness,
      metalness,
      clearcoat,
      clearcoatRoughness,
    })

    // Base maps — use front set as the "primary" so Three enables all chunks.
    mat.map = frontAlbedo.tex
    mat.normalMap = frontNormal.tex
    mat.roughnessMap = frontRough.tex
    mat.metalnessMap = frontMetal.tex
    mat.aoMap = frontAo.tex
    mat.normalScale = new THREE.Vector2(normalScale, normalScale)

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uFrontAlbedo = { value: frontAlbedo.tex }
      shader.uniforms.uBackAlbedo = { value: backAlbedo.tex }
      shader.uniforms.uFrontRough = { value: frontRough.tex }
      shader.uniforms.uBackRough = { value: backRough.tex }
      shader.uniforms.uFrontMetal = { value: frontMetal.tex }
      shader.uniforms.uBackMetal = { value: backMetal.tex }
      shader.uniforms.uFrontAo = { value: frontAo.tex }
      shader.uniforms.uBackAo = { value: backAo.tex }
      shader.uniforms.uSideAxis = { value: sideAxis }

      // --- Vertex: export object-local normal
      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        `#include <common>
        varying vec3 vObjectNormal;`,
      )
      shader.vertexShader = shader.vertexShader.replace(
        "#include <beginnormal_vertex>",
        `#include <beginnormal_vertex>
        vObjectNormal = objectNormal;`,
      )

      // --- Fragment shared code
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <common>",
        `#include <common>
        varying vec3 vObjectNormal;
        uniform sampler2D uFrontAlbedo;
        uniform sampler2D uBackAlbedo;
        uniform sampler2D uFrontRough;
        uniform sampler2D uBackRough;
        uniform sampler2D uFrontMetal;
        uniform sampler2D uBackMetal;
        uniform sampler2D uFrontAo;
        uniform sampler2D uBackAo;
        uniform int uSideAxis;
        float cs_sideBlend() {
          float c = (uSideAxis == 0) ? vObjectNormal.x : ((uSideAxis == 1) ? vObjectNormal.y : vObjectNormal.z);
          return smoothstep(-0.2, 0.2, c);
        }`,
      )

      // --- Albedo blend
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <map_fragment>",
        `#ifdef USE_MAP
          float csBmap = cs_sideBlend();
          vec4 sampledFront = texture2D(uFrontAlbedo, vMapUv);
          vec4 sampledBack = texture2D(uBackAlbedo, vMapUv);
          vec4 sampledDiffuseColor = mix(sampledBack, sampledFront, csBmap);
          diffuseColor *= sampledDiffuseColor;
        #endif`,
      )

      // --- Roughness blend (G channel)
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <roughnessmap_fragment>",
        `float roughnessFactor = roughness;
        #ifdef USE_ROUGHNESSMAP
          float csBrough = cs_sideBlend();
          vec4 rFront = texture2D(uFrontRough, vRoughnessMapUv);
          vec4 rBack = texture2D(uBackRough, vRoughnessMapUv);
          vec4 texelRoughness = mix(rBack, rFront, csBrough);
          roughnessFactor *= texelRoughness.g;
        #endif`,
      )

      // --- Metalness blend (B channel)
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <metalnessmap_fragment>",
        `float metalnessFactor = metalness;
        #ifdef USE_METALNESSMAP
          float csBmetal = cs_sideBlend();
          vec4 mFront = texture2D(uFrontMetal, vMetalnessMapUv);
          vec4 mBack = texture2D(uBackMetal, vMetalnessMapUv);
          vec4 texelMetalness = mix(mBack, mFront, csBmetal);
          metalnessFactor *= texelMetalness.b;
        #endif`,
      )

      // --- AO blend (R channel). We leave Three's aomap_fragment logic in place and
      // only override the raw texture sample call so specular occlusion still runs.
      shader.fragmentShader = shader.fragmentShader.replace(
        "#ifdef USE_AOMAP",
        `#ifdef USE_AOMAP
          float csBao = cs_sideBlend();
          vec4 aFront = texture2D(uFrontAo, vAoMapUv);
          vec4 aBack = texture2D(uBackAo, vAoMapUv);
          #define CARD_AO_SAMPLE mix(aBack, aFront, csBao).r`,
      )
      shader.fragmentShader = shader.fragmentShader.replaceAll(
        "texture2D( aoMap, vAoMapUv ).r",
        "CARD_AO_SAMPLE",
      )
    }

    materialRef.current = mat
    return mat
  }, [
    frontAlbedo.tex,
    backAlbedo.tex,
    frontNormal.tex,
    backNormal.tex,
    frontRough.tex,
    backRough.tex,
    frontMetal.tex,
    backMetal.tex,
    frontAo.tex,
    backAo.tex,
    sideAxis,
  ])

  // Keep live params in sync without rebuilding shaders
  useEffect(() => {
    if (!materialRef.current) return
    materialRef.current.roughness = roughness
    materialRef.current.metalness = metalness
    materialRef.current.clearcoat = clearcoat
    materialRef.current.clearcoatRoughness = clearcoatRoughness
    materialRef.current.normalScale.set(normalScale, normalScale)
  }, [roughness, metalness, clearcoat, clearcoatRoughness, normalScale])

  useEffect(() => {
    return () => {
      materialRef.current?.dispose()
    }
  }, [])

  return material
}
