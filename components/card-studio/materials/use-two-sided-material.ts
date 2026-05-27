"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import { resolveTextureUrl } from "@/lib/texture-url"
import { fetchTextureBlob } from "@/lib/fetch-texture-blob"
import { useTextureLoading } from "@/lib/texture-loading"
import { makeBackCompositeTexture } from "@/lib/back-composite"
import type { PbrMapSet } from "@/lib/studio-store"

type Params = {
  /** "simple" = albedo + optional clearcoatMask (no normal/rough/metal/ao); "pbr" = full set */
  presetType: "simple" | "pbr"
  front: PbrMapSet
  back: PbrMapSet
  /** Solid background color for the back side (composited under backTemplate). */
  backColor: string
  /** Optional PNG overlay on the back side. */
  backTemplate?: string
  roughness: number
  metalness: number
  normalScale: number
  clearcoat: number
  clearcoatRoughness: number
  /** 0=X, 1=Y, 2=Z — object-local axis from back to front face. */
  sideAxis: 0 | 1 | 2
  /** Center position of the card along sideAxis, used to determine front/back. */
  cardCenter: number
  flipH: boolean
  flipV: boolean
  edgeColor: string
  edgeTint: number
}

// 1x1 fallback textures
let NEUTRAL_WHITE: THREE.Texture | null = null
let NEUTRAL_NORMAL: THREE.Texture | null = null
let NEUTRAL_BLACK: THREE.Texture | null = null
function neutralWhite(): THREE.Texture {
  if (NEUTRAL_WHITE) return NEUTRAL_WHITE
  const data = new Uint8Array([255, 255, 255, 255])
  const t = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat)
  t.needsUpdate = true
  t.colorSpace = THREE.NoColorSpace
  NEUTRAL_WHITE = t
  return t
}
function neutralBlack(): THREE.Texture {
  if (NEUTRAL_BLACK) return NEUTRAL_BLACK
  const data = new Uint8Array([0, 0, 0, 255])
  const t = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat)
  t.needsUpdate = true
  t.colorSpace = THREE.NoColorSpace
  NEUTRAL_BLACK = t
  return t
}
function neutralNormal(): THREE.Texture {
  if (NEUTRAL_NORMAL) return NEUTRAL_NORMAL
  const data = new Uint8Array([128, 128, 255, 255])
  const t = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat)
  t.needsUpdate = true
  t.colorSpace = THREE.NoColorSpace
  NEUTRAL_NORMAL = t
  return t
}

/**
 * Loads a texture by URL through our cached/proxied fetch path. Returns a
 * neutral fallback while loading or on error.
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
    console.log("[v0] useMaybeTexture loading:", resolved)
    let cancelled = false
    const ac = new AbortController()
    useTextureLoading.getState().start()
    let settled = false
    const settle = () => {
      if (settled) return
      settled = true
      useTextureLoading.getState().note(true)
    }

    ;(async () => {
      try {
        const blob = await fetchTextureBlob(resolved, ac.signal)
        if (cancelled) return
        console.log("[v0] useMaybeTexture got blob:", resolved, "type:", blob.type, "size:", blob.size)
        const objectUrl = URL.createObjectURL(blob)
        const img = new Image()
        img.decoding = "async"
        img.onload = () => {
          if (cancelled) {
            URL.revokeObjectURL(objectUrl)
            settle()
            return
          }
          const t = new THREE.Texture(img)
          t.colorSpace = colorSpace
          t.wrapS = THREE.ClampToEdgeWrapping
          t.wrapT = THREE.ClampToEdgeWrapping
          t.anisotropy = 8
          t.needsUpdate = true
          setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
          console.log("[v0] useMaybeTexture loaded:", resolved, "size", img.width, "x", img.height)
          setTex(t)
          settle()
        }
        img.onerror = (e) => {
          URL.revokeObjectURL(objectUrl)
          console.log("[v0] useMaybeTexture image decode error:", resolved, e)
          if (!cancelled) setTex(fallback)
          settle()
        }
        img.src = objectUrl
      } catch (err) {
        if ((err as Error)?.name === "AbortError") {
          settle()
          return
        }
        console.log("[v0] useMaybeTexture fetch error:", resolved, err)
        if (!cancelled) setTex(fallback)
        settle()
      }
    })()

    return () => {
      cancelled = true
      ac.abort()
      settle()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved, colorSpace, isNormal])

  return { tex, present: !!resolved }
}

/**
 * Builds a MeshPhysicalMaterial that samples two PBR map sets and blends
 * between them based on object-local normal direction.
 *
 * - For "pbr" presets: front uses the full PBR set; back uses its own PBR set
 *   (or falls back to the back composite texture if no back albedo provided).
 * - For "simple" presets: front uses albedo + optional clearcoatMask only;
 *   back uses the composite (backColor + optional backTemplate).
 */
export function useTwoSidedPhysicalMaterial(params: Params): THREE.MeshPhysicalMaterial {
  const {
    presetType,
    front,
    back,
    backColor,
    backTemplate,
    roughness,
    metalness,
    normalScale,
    clearcoat,
    clearcoatRoughness,
    sideAxis,
    cardCenter,
    flipH,
    flipV,
    edgeColor,
    edgeTint,
  } = params

  const isSimple = presetType === "simple"

  console.log("[v0] useTwoSidedPhysicalMaterial render", {
    presetType,
    frontKeys: Object.keys(front),
    frontAlbedo: front.albedo,
    backColor,
    backTemplate,
  })

  // Front textures
  const frontAlbedo = useMaybeTexture(front.albedo, THREE.SRGBColorSpace)
  const frontNormal = useMaybeTexture(isSimple ? undefined : front.normal, THREE.NoColorSpace, true)
  const frontRough = useMaybeTexture(isSimple ? undefined : (front.roughness ?? front.orm), THREE.NoColorSpace)
  const frontMetal = useMaybeTexture(isSimple ? undefined : (front.metallic ?? front.orm), THREE.NoColorSpace)
  const frontAo = useMaybeTexture(isSimple ? undefined : (front.ao ?? front.orm), THREE.NoColorSpace)
  // Simple-only: clearcoat mask
  const frontClearMask = useMaybeTexture(isSimple ? front.clearcoatMask : undefined, THREE.NoColorSpace)

  // Back textures - if PBR mode and back has its own albedo, use PBR. Otherwise use composite.
  const useBackPbr = !isSimple && !!back.albedo
  const backPbrAlbedo = useMaybeTexture(useBackPbr ? back.albedo : undefined, THREE.SRGBColorSpace)
  const backNormal = useMaybeTexture(useBackPbr ? back.normal : undefined, THREE.NoColorSpace, true)
  const backRough = useMaybeTexture(useBackPbr ? (back.roughness ?? back.orm) : undefined, THREE.NoColorSpace)
  const backMetal = useMaybeTexture(useBackPbr ? (back.metallic ?? back.orm) : undefined, THREE.NoColorSpace)
  const backAo = useMaybeTexture(useBackPbr ? (back.ao ?? back.orm) : undefined, THREE.NoColorSpace)

  // Counter to force re-render when template loads asynchronously
  const [templateVersion, setTemplateVersion] = useState(0)

  // Back composite (color + template) — used when not in PBR back mode.
  const backComposite = useMemo(() => {
    if (useBackPbr) return null
    return makeBackCompositeTexture(backColor, backTemplate, flipH, flipV, () => {
      // Force re-render when template finishes loading
      setTemplateVersion((v) => v + 1)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useBackPbr, backColor, backTemplate, flipH, flipV])

  useEffect(() => {
    return () => {
      backComposite?.dispose()
    }
  }, [backComposite])

  // Effective back albedo: PBR back albedo if present, else the composite.
  const effectiveBackAlbedo = useBackPbr ? backPbrAlbedo.tex : (backComposite?.texture ?? neutralBlack())

  // Refs to live-updatable shader uniforms.
  const edgeUniformsRef = useRef<{
    color: { value: THREE.Color }
    tint: { value: number }
  } | null>(null)

  const albedoUniformsRef = useRef<{
    front: { value: THREE.Texture }
    back: { value: THREE.Texture }
  } | null>(null)

  const material = useMemo(() => {
    const mat = new THREE.MeshPhysicalMaterial({
    side: THREE.DoubleSide, // Render both front and back faces
  })

    // Base maps — needed so Three enables the corresponding shader chunks.
    mat.map = frontAlbedo.tex
    if (!isSimple) {
      mat.normalMap = frontNormal.tex
      mat.roughnessMap = frontRough.tex
      mat.metalnessMap = frontMetal.tex
      mat.aoMap = frontAo.tex
      mat.normalScale = new THREE.Vector2(1, 1)
      mat.clearcoatNormalMap = frontNormal.tex
      mat.clearcoatRoughnessMap = frontRough.tex
      mat.clearcoatNormalScale = new THREE.Vector2(1, 1)
    } else {
      // Simple mode: clearcoat mask determines per-pixel gloss strength.
      // White areas of the mask → full clearcoat; black → matte.
      mat.clearcoatMap = frontClearMask.tex
    }

    mat.onBeforeCompile = (shader) => {
      const frontAlbedoUniform = { value: frontAlbedo.tex }
      const backAlbedoUniform = { value: effectiveBackAlbedo }
      shader.uniforms.uFrontAlbedo = frontAlbedoUniform
      shader.uniforms.uBackAlbedo = backAlbedoUniform
      albedoUniformsRef.current = { front: frontAlbedoUniform, back: backAlbedoUniform }

      shader.uniforms.uSideAxis = { value: sideAxis }
      shader.uniforms.uIsSimple = { value: isSimple ? 1 : 0 }
      shader.uniforms.uUseBackPbr = { value: useBackPbr ? 1 : 0 }
      shader.uniforms.uCardCenter = { value: cardCenter }

      // Optional PBR maps for back side
      shader.uniforms.uBackNormal = { value: backNormal.tex }
      shader.uniforms.uBackRough = { value: backRough.tex }
      shader.uniforms.uBackMetal = { value: backMetal.tex }
      shader.uniforms.uBackAo = { value: backAo.tex }
      shader.uniforms.uFrontRough = { value: frontRough.tex }
      shader.uniforms.uFrontMetal = { value: frontMetal.tex }
      shader.uniforms.uFrontAo = { value: frontAo.tex }

      const edgeColorUniform = { value: new THREE.Color(edgeColor) }
      const edgeTintUniform = { value: edgeTint }
      shader.uniforms.uEdgeColor = edgeColorUniform
      shader.uniforms.uEdgeTint = edgeTintUniform
      edgeUniformsRef.current = { color: edgeColorUniform, tint: edgeTintUniform }

      // --- Vertex: export object-local normal and position
      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        `#include <common>
        varying vec3 vObjectNormal;
        varying vec3 vObjectPosition;`,
      )
      shader.vertexShader = shader.vertexShader.replace(
        "#include <beginnormal_vertex>",
        `#include <beginnormal_vertex>
        vObjectNormal = objectNormal;
        vObjectPosition = position;`,
      )

      // --- Fragment shared code
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <common>",
        `#include <common>
        varying vec3 vObjectNormal;
        varying vec3 vObjectPosition;
        uniform sampler2D uFrontAlbedo;
        uniform sampler2D uBackAlbedo;
        uniform sampler2D uFrontRough;
        uniform sampler2D uBackRough;
        uniform sampler2D uFrontMetal;
        uniform sampler2D uBackMetal;
        uniform sampler2D uFrontAo;
        uniform sampler2D uBackAo;
        uniform int uSideAxis;
        uniform int uIsSimple;
        uniform int uUseBackPbr;
        uniform vec3 uEdgeColor;
        uniform float uEdgeTint;
        uniform float uCardCenter;
        float cs_sideBlend() {
          // Determine front vs back based on object-space position along sideAxis.
          // Vertices on the positive side of center are front, negative are back.
          // This works correctly regardless of vertex normals.
          float pos = (uSideAxis == 0) ? vObjectPosition.x : ((uSideAxis == 1) ? vObjectPosition.y : vObjectPosition.z);
          return smoothstep(uCardCenter - 0.001, uCardCenter + 0.001, pos);
        }
        float cs_edgeMask() {
          // Edge detection: side faces have normal perpendicular to sideAxis (c near 0)
          float c = (uSideAxis == 0) ? vObjectNormal.x : ((uSideAxis == 1) ? vObjectNormal.y : vObjectNormal.z);
          return 1.0 - smoothstep(0.05, 0.35, abs(c));
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
          float edgeMask = cs_edgeMask() * uEdgeTint;
          diffuseColor.rgb = mix(diffuseColor.rgb, uEdgeColor, edgeMask);
        #endif`,
      )

      // --- Roughness: in simple mode use base scalar; in PBR blend per-side maps.
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <roughnessmap_fragment>",
        `float roughnessFactor = roughness;
        #ifdef USE_ROUGHNESSMAP
          if (uIsSimple == 0) {
            float csBrough = cs_sideBlend();
            vec4 rFront = texture2D(uFrontRough, vRoughnessMapUv);
            vec4 rBack = (uUseBackPbr == 1) ? texture2D(uBackRough, vRoughnessMapUv) : vec4(1.0);
            vec4 texelRoughness = mix(rBack, rFront, csBrough);
            roughnessFactor *= texelRoughness.g;
          }
        #endif`,
      )

      // --- Metalness
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <metalnessmap_fragment>",
        `float metalnessFactor = metalness;
        #ifdef USE_METALNESSMAP
          if (uIsSimple == 0) {
            float csBmetal = cs_sideBlend();
            vec4 mFront = texture2D(uFrontMetal, vMetalnessMapUv);
            vec4 mBack = (uUseBackPbr == 1) ? texture2D(uBackMetal, vMetalnessMapUv) : vec4(0.0);
            vec4 texelMetalness = mix(mBack, mFront, csBmetal);
            metalnessFactor *= texelMetalness.b;
          }
        #endif`,
      )

      // --- AO blend
      shader.fragmentShader = shader.fragmentShader.replace(
        "#ifdef USE_AOMAP",
        `#ifdef USE_AOMAP
          float aoSample = 1.0;
          if (uIsSimple == 0) {
            float csBao = cs_sideBlend();
            vec4 aFront = texture2D(uFrontAo, vAoMapUv);
            vec4 aBack = (uUseBackPbr == 1) ? texture2D(uBackAo, vAoMapUv) : vec4(1.0);
            aoSample = mix(aBack, aFront, csBao).r;
          }
          #define CARD_AO_SAMPLE aoSample`,
      )

      // --- Normal map: only apply on the front side. Back-mesh restores geometry normal
      // so the front's bump (e.g. window frames) does not bleed through the back albedo.
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        normal = normalize(mix(nonPerturbedNormal, normal, cs_sideBlend()));`,
      )

      // --- Clearcoat normal map: front only.
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <clearcoat_normal_fragment_maps>",
        `#include <clearcoat_normal_fragment_maps>
        clearcoatNormal = normalize(mix(nonPerturbedNormal, clearcoatNormal, cs_sideBlend()));`,
      )
      shader.fragmentShader = shader.fragmentShader.replaceAll(
        "texture2D( aoMap, vAoMapUv ).r",
        "CARD_AO_SAMPLE",
      )
    }

    return mat
  }, [
    frontAlbedo.tex,
    effectiveBackAlbedo,
    frontNormal.tex,
    backNormal.tex,
    frontRough.tex,
    backRough.tex,
    frontMetal.tex,
    backMetal.tex,
    frontAo.tex,
    backAo.tex,
    frontClearMask.tex,
    sideAxis,
    cardCenter,
    isSimple,
    useBackPbr,
  ])

  // Apply flip-H/V to all sampled textures
  useEffect(() => {
    const textures: THREE.Texture[] = [
      frontAlbedo.tex,
      backPbrAlbedo.tex,
      frontNormal.tex,
      backNormal.tex,
      frontRough.tex,
      backRough.tex,
      frontMetal.tex,
      backMetal.tex,
      frontAo.tex,
      backAo.tex,
      frontClearMask.tex,
    ]
    for (const t of textures) {
      t.center.set(0.5, 0.5)
      t.repeat.x = flipH ? -1 : 1
      t.repeat.y = flipV ? -1 : 1
      t.needsUpdate = true
    }
  }, [
    flipH,
    flipV,
    frontAlbedo.tex,
    backPbrAlbedo.tex,
    frontNormal.tex,
    backNormal.tex,
    frontRough.tex,
    backRough.tex,
    frontMetal.tex,
    backMetal.tex,
    frontAo.tex,
    backAo.tex,
    frontClearMask.tex,
  ])

  // Edge tint live update
  useEffect(() => {
    const u = edgeUniformsRef.current
    if (!u) return
    u.color.value.set(edgeColor)
    u.tint.value = edgeTint
  }, [edgeColor, edgeTint])

  // Albedo swap live update (also triggers when template loads via templateVersion)
  useEffect(() => {
    const u = albedoUniformsRef.current
    if (!u) return
    u.front.value = frontAlbedo.tex
    u.back.value = effectiveBackAlbedo
    console.log("[v0] albedo uniforms updated, templateVersion:", templateVersion)
  }, [frontAlbedo.tex, effectiveBackAlbedo, templateVersion])

  // Live scalars
  material.roughness = roughness
  material.metalness = metalness
  material.clearcoat = clearcoat
  material.clearcoatRoughness = clearcoatRoughness
  if (!isSimple) {
    material.normalScale.set(normalScale, normalScale)
    material.clearcoatNormalScale.set(normalScale, normalScale)
  }

  useEffect(() => {
    const m = material
    return () => {
      m.dispose()
    }
  }, [material])

  return material
}
