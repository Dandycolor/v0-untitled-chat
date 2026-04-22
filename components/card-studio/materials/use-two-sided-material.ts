"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import { resolveTextureUrl } from "@/lib/texture-url"
import { fetchTextureBlob } from "@/lib/fetch-texture-blob"
import { useTextureLoading } from "@/lib/texture-loading"
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
  /** Mirror all textures horizontally (applies to both sides). */
  flipH: boolean
  /** Mirror all textures vertically (applies to both sides). */
  flipV: boolean
  /** Hex color used to tint the thin side bevel of the card. */
  edgeColor: string
  /** 0..1 — mixes `edgeColor` into the card's diffuse near perpendicular faces. */
  edgeTint: number
  /**
   * Optional per-side albedo override. When provided, replaces the sampled
   * PBR diffuse for that face entirely (solid color / gradient paint).
   * Pass `null` / `undefined` to fall back to the preset's albedo texture.
   */
  frontAlbedoOverride?: THREE.Texture | null
  backAlbedoOverride?: THREE.Texture | null
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
    const ac = new AbortController()

    // Notify the global loading counter so the overlay can show progress.
    // `start` bumps both `pending` and `total`; `note` only decrements
    // `pending`, so the overlay can show "5 / 8 loaded" without collapsing
    // to 0/0 immediately when something finishes.
    useTextureLoading.getState().start()
    let settled = false
    const settle = () => {
      if (settled) return
      settled = true
      useTextureLoading.getState().note(true)
    }

    ;(async () => {
      try {
        // fetchTextureBlob owns: persistent Cache Storage lookup, 3-attempt
        // retry with exponential backoff, and abort-signal propagation.
        const blob = await fetchTextureBlob(resolved, ac.signal)
        if (cancelled) return

        const objectUrl = URL.createObjectURL(blob)
        const img = new Image()
        // No crossOrigin attribute — the URL is blob: so it's same-origin
        // and WebGL reads are never tainted (keeps screenshot capture working).
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
          // Revoke the object URL after the next tick — Three has already
          // read the image data into the GPU by then.
          setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
          setTex(t)
          settle()
        }
        img.onerror = (e) => {
          console.log("[v0] texture decode failed:", resolved, e)
          URL.revokeObjectURL(objectUrl)
          if (!cancelled) setTex(fallback)
          settle()
        }
        img.src = objectUrl
      } catch (err) {
        if ((err as Error)?.name === "AbortError") {
          // Cancelled via effect cleanup — not a real failure, but we still
          // need to drop the pending counter so the overlay doesn't get stuck.
          settle()
          return
        }
        console.log("[v0] texture fetch failed:", resolved, err)
        if (!cancelled) setTex(fallback)
        settle()
      }
    })()

    return () => {
      cancelled = true
      ac.abort()
      // Defensive: if the async chain never reached a settle path before the
      // component unmounted, make sure we don't leak a pending counter.
      settle()
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
  const {
    front,
    back,
    roughness,
    metalness,
    normalScale,
    clearcoat,
    clearcoatRoughness,
    sideAxis,
    flipH,
    flipV,
    edgeColor,
    edgeTint,
    frontAlbedoOverride,
    backAlbedoOverride,
  } = params

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

  // Live handles to the shader uniforms for edge color + tint, populated inside
  // onBeforeCompile and updated from a separate useEffect to avoid recompiling the
  // shader every time the user drags the slider or picks a new color.
  const edgeUniformsRef = useRef<{
    color: { value: THREE.Color }
    tint: { value: number }
  } | null>(null)

  // Same trick for front/back albedo: onBeforeCompile picks an initial texture
  // (override if present, preset otherwise) and exposes the uniform handles so a
  // downstream effect can hot-swap in the new CanvasTexture whenever the user
  // toggles solid / gradient fill without tearing down the whole material.
  const albedoUniformsRef = useRef<{
    front: { value: THREE.Texture }
    back: { value: THREE.Texture }
  } | null>(null)

  const material = useMemo(() => {
    const mat = new THREE.MeshPhysicalMaterial({})

    // Base maps — use front set as the "primary" so Three enables all chunks.
    mat.map = frontAlbedo.tex
    mat.normalMap = frontNormal.tex
    mat.roughnessMap = frontRough.tex
    mat.metalnessMap = frontMetal.tex
    mat.aoMap = frontAo.tex
    mat.normalScale = new THREE.Vector2(1, 1)

    // IMPORTANT: MeshPhysicalMaterial's clearcoat layer uses its OWN normal and
    // roughness maps. If we don't assign them, the clearcoat highlight forms on
    // an idealized flat plane, which blows out into a flat mirror blob that
    // ignores the texture grain and normal detail underneath. Feeding the same
    // maps into clearcoatNormalMap / clearcoatRoughnessMap makes the PBR glare
    // follow wood grain, embossing, and roughness variation — i.e. "the PBR
    // highlight reacts to the material shader".
    mat.clearcoatNormalMap = frontNormal.tex
    mat.clearcoatRoughnessMap = frontRough.tex
    mat.clearcoatNormalScale = new THREE.Vector2(1, 1)

    // We intentionally do NOT set `customProgramCacheKey` to a constant here:
    // doing so made Three reuse the very first compiled WebGL program across every
    // subsequent material instance. Custom uniforms like `uFrontAlbedo` live on the
    // material's own uniforms object, but in production (no StrictMode, no HMR) the
    // first material's textures stayed bound to the shared program long after the user
    // picked a different design — which manifested as "uploaded designs don't switch".
    // Letting Three hash the modified shader source is cheap and correct.

    mat.onBeforeCompile = (shader) => {
      const frontAlbedoUniform = { value: frontAlbedoOverride ?? frontAlbedo.tex }
      const backAlbedoUniform = { value: backAlbedoOverride ?? backAlbedo.tex }
      shader.uniforms.uFrontAlbedo = frontAlbedoUniform
      shader.uniforms.uBackAlbedo = backAlbedoUniform
      albedoUniformsRef.current = { front: frontAlbedoUniform, back: backAlbedoUniform }
      shader.uniforms.uFrontRough = { value: frontRough.tex }
      shader.uniforms.uBackRough = { value: backRough.tex }
      shader.uniforms.uFrontMetal = { value: frontMetal.tex }
      shader.uniforms.uBackMetal = { value: backMetal.tex }
      shader.uniforms.uFrontAo = { value: frontAo.tex }
      shader.uniforms.uBackAo = { value: backAo.tex }
      shader.uniforms.uSideAxis = { value: sideAxis }
      // Edge tint: uniform references that we live-update from outside the shader closure
      // so changing the color / tint slider doesn't force a shader recompile.
      const edgeColorUniform = { value: new THREE.Color(edgeColor) }
      const edgeTintUniform = { value: edgeTint }
      shader.uniforms.uEdgeColor = edgeColorUniform
      shader.uniforms.uEdgeTint = edgeTintUniform
      edgeUniformsRef.current = { color: edgeColorUniform, tint: edgeTintUniform }

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
        uniform vec3 uEdgeColor;
        uniform float uEdgeTint;
        float cs_sideBlend() {
          float c = (uSideAxis == 0) ? vObjectNormal.x : ((uSideAxis == 1) ? vObjectNormal.y : vObjectNormal.z);
          return smoothstep(-0.2, 0.2, c);
        }
        // Mask that is 1 on the thin side bevel (normal perpendicular to sideAxis)
        // and 0 on the front/back faces. smoothstep band keeps the transition soft
        // enough to hide chip geometry aliasing on the corner radius.
        float cs_edgeMask() {
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
          // Edge recolor: on the thin side bevel fade towards the solid edge color.
          float edgeMask = cs_edgeMask() * uEdgeTint;
          diffuseColor.rgb = mix(diffuseColor.rgb, uEdgeColor, edgeMask);
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

  // Apply flip-H/V to every PBR texture via repeat/center. center=0.5 pivots the mirror
  // around the middle of the texture; repeat = -1 flips, = 1 keeps. Cheap and works on the fly.
  useEffect(() => {
    const textures: THREE.Texture[] = [
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
    backAlbedo.tex,
    frontNormal.tex,
    backNormal.tex,
    frontRough.tex,
    backRough.tex,
    frontMetal.tex,
    backMetal.tex,
    frontAo.tex,
    backAo.tex,
  ])

  // Edge tint is driven through the shader uniforms stored in `edgeUniformsRef`.
  // onBeforeCompile populates that ref the first time the material is rendered.
  // Before that happens (e.g. first frame), the ref is null and we simply skip;
  // the shader gets the correct value from the closure on initial compile.
  useEffect(() => {
    const u = edgeUniformsRef.current
    if (!u) return
    u.color.value.set(edgeColor)
    u.tint.value = edgeTint
  }, [edgeColor, edgeTint])

  // Albedo override swap: whenever the user toggles solid / gradient / none or
  // changes colors, the generated CanvasTexture reference changes. Point the
  // shader uniforms at the new texture (or back at the preset albedo) without
  // triggering a shader recompile.
  useEffect(() => {
    const u = albedoUniformsRef.current
    if (!u) return
    u.front.value = frontAlbedoOverride ?? frontAlbedo.tex
    u.back.value = backAlbedoOverride ?? backAlbedo.tex
  }, [frontAlbedoOverride, backAlbedoOverride, frontAlbedo.tex, backAlbedo.tex])

  // Apply Flip H/V to override textures too, so the user-facing "Flip horizontal /
  // vertical" toggles behave identically regardless of whether the card shows a
  // PBR design or a solid / gradient fill. Cheap (only two textures at most).
  useEffect(() => {
    const overrides = [frontAlbedoOverride, backAlbedoOverride].filter(
      (t): t is THREE.Texture => !!t,
    )
    for (const t of overrides) {
      t.center.set(0.5, 0.5)
      t.repeat.x = flipH ? -1 : 1
      t.repeat.y = flipV ? -1 : 1
      t.needsUpdate = true
    }
  }, [flipH, flipV, frontAlbedoOverride, backAlbedoOverride])

  // Apply live scalar params every render — Three's WebGLMaterials reads these
  // plain properties on each frame, so updates are picked up without shader recompile.
  material.roughness = roughness
  material.metalness = metalness
  material.clearcoat = clearcoat
  material.clearcoatRoughness = clearcoatRoughness
  material.normalScale.set(normalScale, normalScale)
  // Keep the clearcoat normals aligned with the base normals so the PBR glare
  // follows the same micro-geometry as the diffuse — when the user dials up
  // Normal intensity, the highlight also starts breaking up over the texture.
  material.clearcoatNormalScale.set(normalScale, normalScale)

  // Cleanup on unmount
  useEffect(() => {
    const m = material
    return () => {
      m.dispose()
    }
  }, [material])

  return material
}
