"use client"

import { create } from "zustand"

export type CardModelId = "card_no_chip" | "card_chip1" | "card_chip2" | "card_chip3"
export type Orientation = "horizontal" | "vertical"
export type ViewId =
  | "front"
  | "back"
  | "threeQuarterFront"
  | "threeQuarterBack"
  | "top"
  | "side"
  | "hero"
export type GlareMode = "off" | "texture" | "clearcoat"
export type Projection = "perspective" | "orthographic"

export type HdrPreset =
  | "studio"
  | "apartment"
  | "city"
  | "dawn"
  | "forest"
  | "lobby"
  | "night"
  | "park"
  | "sunset"
  | "warehouse"

/**
 * URLs of PBR maps. Absent means "do not use that channel".
 *
 * `clearcoatMask` is used by Simple presets only — a black/white texture where
 * white = glossy lacquer (e.g. monster eyes), black = matte. Maps to the
 * MeshPhysicalMaterial's `clearcoatMap`.
 */
export type PbrMapSet = {
  albedo?: string
  normal?: string
  roughness?: string
  metallic?: string
  ao?: string
  height?: string
  /** Packed Occlusion/Roughness/Metallic (R=ao, G=roughness, B=metallic). If present, overrides separate roughness/metallic/ao. */
  orm?: string
  /** Simple-preset only: gloss / lacquer mask (white = shiny). */
  clearcoatMask?: string
}

export type DesignPreset = {
  id: string
  name: string
  /** "simple" = albedo + optional clearcoat mask; "pbr" = full PBR set */
  type: "simple" | "pbr"
  front: PbrMapSet
  back: PbrMapSet
  /** Background color for the back side (composited under backTemplate) */
  backColor?: string
  /** Optional PNG template overlay for the back side (e.g. card numbers, QR) */
  backTemplate?: string
  /** Per-design material overrides. */
  material?: PresetMaterial
  createdAt: number
}

/**
 * The material-side state that travels with a design preset.
 */
export type PresetMaterial = {
  cardRoughness: number
  cardMetalness: number
  cardNormalScale: number
  cardClearcoat: number
  cardClearcoatRoughness: number
  cardEdgeColor: string
  cardEdgeTint: number
  textureFlipH: boolean
  textureFlipV: boolean
  glareMode: GlareMode
  glareIntensity: number
  glareRotation: number
  glareWidth: number
  glareSoftness: number
  holoEnabled: boolean
  holoIntensity: number
  holoScale: number
  holoHueShift: number
  foilEnabled: boolean
  foilSheen: number
  foilSparkle: number
  foilDensity: number
  foilSparkleSize: number
  foilTint: string
}

export const MATERIAL_KEYS = [
  "cardRoughness",
  "cardMetalness",
  "cardNormalScale",
  "cardClearcoat",
  "cardClearcoatRoughness",
  "cardEdgeColor",
  "cardEdgeTint",
  "textureFlipH",
  "textureFlipV",
  "glareMode",
  "glareIntensity",
  "glareRotation",
  "glareWidth",
  "glareSoftness",
  "holoEnabled",
  "holoIntensity",
  "holoScale",
  "holoHueShift",
  "foilEnabled",
  "foilSheen",
  "foilSparkle",
  "foilDensity",
  "foilSparkleSize",
  "foilTint",
] as const satisfies readonly (keyof PresetMaterial)[]

export type StudioState = {
  // Model
  modelId: CardModelId
  orientation: Orientation
  verticalLogo: boolean

  // View / camera
  viewId: ViewId
  autoRotate: boolean
  projection: Projection
  focalLength: number

  // PBR per side
  frontPbr: PbrMapSet
  backPbr: PbrMapSet
  textureFlipH: boolean
  textureFlipV: boolean

  /** Background color for the back side (always applied under any back albedo/template). */
  backColor: string
  /** Optional PNG overlay drawn on top of backColor (uses its alpha channel). */
  backTemplate?: string

  // Card material tuning
  cardRoughness: number
  cardMetalness: number
  cardNormalScale: number
  cardClearcoat: number
  cardClearcoatRoughness: number
  cardEdgeColor: string
  cardEdgeTint: number

  // Chip shader
  chipColor: string
  chipMetalness: number
  chipRoughness: number
  chipAnisotropy: number
  chipNoiseAmount: number
  chipNoiseScale: number

  // Glare
  glareMode: GlareMode
  glareIntensity: number
  glareRotation: number
  glareWidth: number
  glareSoftness: number

  // Holographic shine
  holoEnabled: boolean
  holoIntensity: number
  holoScale: number
  holoHueShift: number

  // Foil / glitter
  foilEnabled: boolean
  foilSheen: number
  foilSparkle: number
  foilDensity: number
  foilSparkleSize: number
  foilTint: string

  // Logo
  showLogo: boolean
  logoScale: number
  logoOffsetX: number
  logoOffsetY: number
  logoMetalness: number
  logoRoughness: number
  logoColor: string

  // Environment / lighting
  hdrPreset: HdrPreset
  envIntensity: number
  exposure: number
  backgroundMode: "studio" | "transparent" | "solid" | "hdr"
  backgroundColor: string
  keyIntensity: number
  fillIntensity: number
  rimIntensity: number
  keyColor: string
  rimColor: string
  lightAzimuth: number
  lightElevation: number

  // Capture
  captureTransparent: boolean
  captureSize: 1024 | 2048 | 4096

  // Presets (server-backed via Blob)
  presets: DesignPreset[]
  activePresetId: string | null
  /** "simple" or "pbr" — drives shader behavior (Simple skips normal/roughness/metallic/ao). */
  activePresetType: "simple" | "pbr"

  // Setters
  set: <K extends keyof StudioState>(key: K, value: StudioState[K]) => void
  setMany: (patch: Partial<StudioState>) => void
  setFrontPbr: (patch: Partial<PbrMapSet>) => void
  setBackPbr: (patch: Partial<PbrMapSet>) => void
  applyPreset: (preset: DesignPreset) => void
  setPresets: (presets: DesignPreset[]) => void
}

export const useStudio = create<StudioState>((set) => ({
  modelId: "card_chip1",
  orientation: "horizontal",
  verticalLogo: false,

  viewId: "threeQuarterFront",
  autoRotate: false,
  projection: "perspective",
  focalLength: 65,

  frontPbr: {},
  backPbr: {},
  textureFlipH: false,
  textureFlipV: false,

  backColor: "#000000",
  backTemplate: undefined,

  cardRoughness: 1,
  cardMetalness: 0.19,
  cardNormalScale: 0.16,
  cardClearcoat: 0.92,
  cardClearcoatRoughness: 0.29,
  cardEdgeColor: "#111111",
  cardEdgeTint: 0,

  chipColor: "#ababab",
  chipMetalness: 1,
  chipRoughness: 0.56,
  chipAnisotropy: 0.09,
  chipNoiseAmount: 0.45,
  chipNoiseScale: 18,

  glareMode: "clearcoat",
  glareIntensity: 0.7,
  glareRotation: 20,
  glareWidth: 0.35,
  glareSoftness: 0.4,

  holoEnabled: false,
  holoIntensity: 0.9,
  holoScale: 6,
  holoHueShift: 0,

  foilEnabled: false,
  foilSheen: 0.8,
  foilSparkle: 1.4,
  foilDensity: 80,
  foilSparkleSize: 1,
  foilTint: "#fff4cc",

  showLogo: true,
  logoScale: 1.6,
  logoOffsetX: 0.21,
  logoOffsetY: 0.03,
  logoMetalness: 1,
  logoRoughness: 0.64,
  logoColor: "#ffffff",

  hdrPreset: "studio",
  envIntensity: 1,
  exposure: 1,
  backgroundMode: "studio",
  backgroundColor: "#0b0b0d",
  keyIntensity: 1.2,
  keyColor: "#ffffff",
  fillIntensity: 0.6,
  rimIntensity: 2.2,
  rimColor: "#cfe0ff",
  lightAzimuth: 35,
  lightElevation: 40,

  captureTransparent: true,
  captureSize: 2048,

  presets: [],
  activePresetId: null,
  activePresetType: "pbr",

  set: (key, value) => set((s) => ({ ...s, [key]: value })),
  setMany: (patch) => set((s) => ({ ...s, ...patch })),
  setFrontPbr: (patch) => set((s) => ({ frontPbr: { ...s.frontPbr, ...patch } })),
  setBackPbr: (patch) => set((s) => ({ backPbr: { ...s.backPbr, ...patch } })),
  applyPreset: (preset) =>
    set((s) => {
      const next: Partial<StudioState> = {
        activePresetId: preset.id,
        activePresetType: preset.type,
        frontPbr: preset.front,
        backPbr: preset.back,
        backColor: preset.backColor ?? "#000000",
        backTemplate: preset.backTemplate,
      }
      if (preset.material) {
        for (const k of MATERIAL_KEYS) {
          ;(next as Record<string, unknown>)[k] = preset.material[k]
        }
      }
      return { ...s, ...next }
    }),
  setPresets: (presets) => set(() => ({ presets })),
}))
