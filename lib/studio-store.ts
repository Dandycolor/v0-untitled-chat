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

/** URLs of PBR maps. Absent means "do not use that channel". */
export type PbrMapSet = {
  albedo?: string
  normal?: string
  roughness?: string
  metallic?: string
  ao?: string
  height?: string
  /** Packed Occlusion/Roughness/Metallic (R=ao, G=roughness, B=metallic). If present, overrides separate roughness/metallic/ao. */
  orm?: string
}

export type DesignPreset = {
  id: string
  name: string
  front: PbrMapSet
  back: PbrMapSet
  createdAt: number
}

export type StudioState = {
  // Model
  modelId: CardModelId
  orientation: Orientation
  verticalLogo: boolean

  // View / camera
  viewId: ViewId
  autoRotate: boolean
  projection: Projection
  /** Focal length in mm (35mm film equivalent). Overrides per-view FOV when in perspective mode. */
  focalLength: number

  // PBR per side
  frontPbr: PbrMapSet
  backPbr: PbrMapSet
  /** Mirror all PBR texture samplers horizontally. */
  textureFlipH: boolean
  /** Mirror all PBR texture samplers vertically. Flip this if the uploaded design appears upside-down. */
  textureFlipV: boolean

  // Card material tuning
  cardRoughness: number
  cardMetalness: number
  cardNormalScale: number
  cardClearcoat: number
  cardClearcoatRoughness: number
  /** Hex color used to tint the thin side bevel of the card. */
  cardEdgeColor: string
  /** 0..1 — how strongly the edge color overrides the PBR side shading. */
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

  // Holographic shine (iridescent rainbow overlay, react-native-shine style)
  holoEnabled: boolean
  /** Overall brightness of the rainbow band (0..2). */
  holoIntensity: number
  /** Stripe frequency — higher = more, tighter bands. */
  holoScale: number
  /** Static rotation of the color wheel in [0..1] (maps to 0..360°). */
  holoHueShift: number

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
  /** Hex color of the main (key) directional light that orbits the card. */
  keyColor: string
  /** Hex color of the rim backlight pair that grazes the card's silhouette. */
  rimColor: string
  /** Azimuth (degrees, 0..360) of the key light / HDR rotation around the card's up axis. */
  lightAzimuth: number
  /** Elevation (degrees, 0..89) of the key light above the horizon. */
  lightElevation: number

  // Capture
  captureTransparent: boolean
  captureSize: 1024 | 2048 | 4096

  // Presets (server-backed via Blob)
  presets: DesignPreset[]
  activePresetId: string | null

  // Setters
  set: <K extends keyof StudioState>(key: K, value: StudioState[K]) => void
  setMany: (patch: Partial<StudioState>) => void
  setFrontPbr: (patch: Partial<PbrMapSet>) => void
  setBackPbr: (patch: Partial<PbrMapSet>) => void
  applyPreset: (preset: DesignPreset) => void
  setPresets: (presets: DesignPreset[]) => void
}

const DEFAULT_DOODLE_FRONT: PbrMapSet = {
  albedo: "/textures/doodle/albedo.png",
  normal: "/textures/doodle/normal.png",
  roughness: "/textures/doodle/roughness.png",
  metallic: "/textures/doodle/metallic.png",
  ao: "/textures/doodle/ao.png",
  height: "/textures/doodle/height.png",
  orm: "/textures/doodle/orm.png",
}

const DEFAULT_DOODLE_BACK: PbrMapSet = { ...DEFAULT_DOODLE_FRONT }

export const useStudio = create<StudioState>((set) => ({
  modelId: "card_chip1",
  orientation: "horizontal",
  verticalLogo: false,

  viewId: "threeQuarterFront",
  autoRotate: false,
  projection: "perspective",
  focalLength: 65,

  frontPbr: DEFAULT_DOODLE_FRONT,
  backPbr: DEFAULT_DOODLE_BACK,
  textureFlipH: false,
  textureFlipV: false,

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

  holoEnabled: false,
  holoIntensity: 0.9,
  holoScale: 6,
  holoHueShift: 0,
  glareWidth: 0.35,
  glareSoftness: 0.4,

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

  set: (key, value) => set((s) => ({ ...s, [key]: value })),
  setMany: (patch) => set((s) => ({ ...s, ...patch })),
  setFrontPbr: (patch) => set((s) => ({ frontPbr: { ...s.frontPbr, ...patch } })),
  setBackPbr: (patch) => set((s) => ({ backPbr: { ...s.backPbr, ...patch } })),
  applyPreset: (preset) =>
    set(() => ({
      activePresetId: preset.id,
      frontPbr: preset.front,
      backPbr: preset.back,
    })),
  setPresets: (presets) => set(() => ({ presets })),
}))
