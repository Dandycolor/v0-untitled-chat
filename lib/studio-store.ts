"use client"

import { create } from "zustand"

export type CardModelId = "card_no_chip" | "card_chip1" | "card_chip2" | "card_chip3"
export type Orientation = "horizontal" | "vertical"
export type ViewId = "front" | "back" | "threeQuarterFront" | "threeQuarterBack" | "top" | "side"
export type GlareMode = "off" | "texture" | "clearcoat"

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

  // PBR per side
  frontPbr: PbrMapSet
  backPbr: PbrMapSet

  // Card material tuning
  cardRoughness: number
  cardMetalness: number
  cardNormalScale: number
  cardClearcoat: number
  cardClearcoatRoughness: number

  // Chip shader
  chipColor: string
  chipMetalness: number
  chipRoughness: number
  chipAnisotropy: number
  chipPattern: "grid" | "stripes" | "none"
  chipPatternStrength: number

  // Glare
  glareMode: GlareMode
  glareIntensity: number
  glareRotation: number
  glareWidth: number
  glareSoftness: number

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

  frontPbr: DEFAULT_DOODLE_FRONT,
  backPbr: DEFAULT_DOODLE_BACK,

  cardRoughness: 0.55,
  cardMetalness: 0.2,
  cardNormalScale: 1,
  cardClearcoat: 0.35,
  cardClearcoatRoughness: 0.25,

  chipColor: "#d4b773",
  chipMetalness: 1,
  chipRoughness: 0.28,
  chipAnisotropy: 0.6,
  chipPattern: "grid",
  chipPatternStrength: 0.5,

  glareMode: "clearcoat",
  glareIntensity: 0.7,
  glareRotation: 20,
  glareWidth: 0.35,
  glareSoftness: 0.4,

  showLogo: true,
  logoScale: 1,
  logoOffsetX: 0.3,
  logoOffsetY: -0.25,
  logoMetalness: 0.9,
  logoRoughness: 0.2,
  logoColor: "#ffffff",

  hdrPreset: "studio",
  envIntensity: 1,
  exposure: 1,
  backgroundMode: "studio",
  backgroundColor: "#0b0b0d",
  keyIntensity: 1.2,
  fillIntensity: 0.6,
  rimIntensity: 0.8,

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
