"use client"

import { useEffect, useMemo, useState } from "react"
import * as THREE from "three"
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
 * Loads a texture without Suspense. If the URL is absent or the image fails to load
 * (e.g. CORS, 404), returns a neutral fallback so the rest of the scene keeps rendering
 * and user interactions (sliders, camera) remain responsive.
 */
function useMaybeTexture(
  url: string | undefined,
  colorSpace: THREE.ColorSpace,
  isNormal = false,
): { tex: THREE.Texture; present: boolean } {
  const resolved = resolveTextureUrl(url)
  const fallback = isNormal ? neutralNormal() : neutralWhite()
  const [tex, setTex] = useState<THREE.Texture>(fallback)

  useEffect(() => {
    if (!resolved) {
      setTex(fallback)
      return
    }
    let cancelled = false
    const loader = new THREE.TextureLoader()
    loader.setCrossOrigin("anonymous")
    loader.load(
      resolved,
      (t) => {
        if (cancelled) {
          t.dispose()
          return
        }
        t.colorSpace = colorSpace
        t.wrapS = THREE.ClampToEdgeWrapping
        t.wrapT = THREE.ClampToEdgeWrapping
        t.anisotropy = 8
        t.needsUpdate = true
        setTex(t)
      },
      undefined,
      (err) => {
        console.log("[v0] texture load failed:", resolved, err)
        if (!cancelled) setTex(fallback)
      },
    )
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved, colorSpace, isNormal])

  return { tex, present: !!resolved }
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

  const material = useMemo(() => {
    const mat = new THREE.MeshPhysicalMaterial({})

    // Base maps — use front set as the "primary" so Three enables all chunks.
    mat.map = frontAlbedo.tex
    mat.normalMap = frontNormal.tex
    mat.roughnessMap = frontRough.tex
    mat.metalnessMap = frontMetal.tex
    mat.aoMap = frontAo.tex
    mat.normalScale = new THREE.Vector2(1, 1)

    // Ensure Three's shader program cache never returns a stale blended program.
    const cacheKey = `card-two-sided-${sideAxis}`
    mat.customProgramCacheKey = () => cacheKey

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

  // Apply live scalar params every render — Three's WebGLMaterials reads these
  // plain properties on each frame, so updates are picked up without shader recompile.
  material.roughness = roughness
  material.metalness = metalness
  material.clearcoat = clearcoat
  material.clearcoatRoughness = clearcoatRoughness
  material.normalScale.set(normalScale, normalScale)

  // Cleanup on unmount
  useEffect(() => {
    const m = material
    return () => {
      m.dispose()
    }
  }, [material])

  return material
}
