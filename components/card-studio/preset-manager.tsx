"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, Check, Edit2, Image as ImageIcon, Loader2, Plus, Save, Trash2, Upload, X } from "lucide-react"
import { useStudio, MATERIAL_KEYS, type DesignPreset, type PresetMaterial } from "@/lib/studio-store"
import {
  loadPresets,
  savePreset,
  deletePreset,
  updatePresetMaterial,
  generatePresetId,
} from "@/lib/preset-storage"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { toast } from "sonner"

const CHANNELS = [
  { key: "albedo", label: "Albedo" },
  { key: "normal", label: "Normal" },
  { key: "roughness", label: "Roughness" },
  { key: "metallic", label: "Metallic" },
  { key: "ao", label: "AO" },
  { key: "height", label: "Height" },
  { key: "orm", label: "ORM (packed)" },
] as const

type ChannelKey = (typeof CHANNELS)[number]["key"]
type SideFiles = Partial<Record<ChannelKey, File>>

export function PresetManager() {
  const presets = useStudio((s) => s.presets)
  const setPresets = useStudio((s) => s.setPresets)
  const applyPreset = useStudio((s) => s.applyPreset)
  const activePresetId = useStudio((s) => s.activePresetId)

  const [loading, setLoading] = useState(false)
  const [savingMaterial, setSavingMaterial] = useState(false)

  const refresh = async () => {
    setLoading(true)
    try {
      const loaded = await loadPresets()
      setPresets(loaded)
    } catch (err) {
      console.error("[v0] Failed to load presets:", err)
      toast.error("Failed to load presets")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onDelete = async (id: string) => {
    try {
      await deletePreset(id)
      setPresets(presets.filter((p) => p.id !== id))
      toast.success("Preset deleted")
    } catch {
      toast.error("Failed to delete preset")
    }
  }

  // Snapshots the current material-state slice into a `PresetMaterial`.
  const snapshotMaterial = (): PresetMaterial => {
    const s = useStudio.getState()
    const out = {} as PresetMaterial
    for (const k of MATERIAL_KEYS) {
      ;(out as Record<string, unknown>)[k] = s[k]
    }
    return out
  }

  // Save material settings to the active preset
  const onSaveMaterialToActive = async () => {
    if (!activePresetId) return
    setSavingMaterial(true)
    try {
      const material = snapshotMaterial()
      updatePresetMaterial(activePresetId, material)
      setPresets(
        presets.map((p) => (p.id === activePresetId ? { ...p, material } : p)),
      )
      toast.success("Material saved to design")
    } catch (err) {
      console.error("[v0] save material error:", err)
      toast.error("Failed to save material")
    } finally {
      setSavingMaterial(false)
    }
  }

  // Update a single material property for a specific preset (independent per preset)
  const handleUpdateMaterial = (presetId: string, key: string, value: number) => {
    setPresets(
      presets.map((p) => {
        if (p.id !== presetId || !p.material) return p
        const updatedMaterial = { ...p.material, [key]: value }
        // Persist to storage
        updatePresetMaterial(presetId, updatedMaterial)
        return { ...p, material: updatedMaterial }
      }),
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Saved designs</Label>
        <div className="flex items-center gap-1.5">
          {activePresetId && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 bg-transparent"
              onClick={onSaveMaterialToActive}
              disabled={savingMaterial}
              title="Save current material settings to active design"
            >
              {savingMaterial ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Save className="size-3.5" />
              )}
              Save material
            </Button>
          )}
          <CreateSimpleDialog onCreated={refresh} snapshotMaterial={snapshotMaterial} />
          <UploadPresetDialog onUploaded={refresh} snapshotMaterial={snapshotMaterial} />
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" /> Loading…
        </div>
      )}

      {!loading && presets.length === 0 && (
        <Empty className="border border-dashed rounded-md">
          <EmptyHeader>
            <EmptyMedia>
              <Upload className="size-5" />
            </EmptyMedia>
            <EmptyTitle>No presets yet</EmptyTitle>
            <EmptyDescription>Upload a PBR texture set to save it locally.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      <div className="flex flex-col gap-1.5">
        {presets.map((p) => {
          const active = activePresetId === p.id
          return (
            <PresetRow
              key={p.id}
              preset={p}
              active={active}
              onApply={() => applyPreset(p)}
              onDelete={() => onDelete(p.id)}
              onUpdateMaterial={handleUpdateMaterial}
              snapshotMaterial={snapshotMaterial}
            />
          )
        })}
      </div>
    </div>
  )
}

/**
 * A single preset row with expand/collapse to show material editing sliders.
 */
function PresetRow({
  preset,
  active,
  onApply,
  onDelete,
  onUpdateMaterial,
  snapshotMaterial,
}: {
  preset: DesignPreset
  active: boolean
  onApply: () => void
  onDelete: () => void
  onUpdateMaterial: (presetId: string, key: string, value: number) => void
  snapshotMaterial: () => PresetMaterial
}) {
  const hasMaterial = !!preset.material
  const [expanded, setExpanded] = useState(false)

  const handleMaterialChange = (key: string, value: number) => {
    onUpdateMaterial(preset.id, key, value)
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 rounded-md border bg-card px-2.5 py-2">
        <button
          type="button"
          onClick={onApply}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span
            className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${active ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
          >
            {active && <Check className="size-3" />}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm">{preset.name}</span>
          {hasMaterial && (
            <span
              className="shrink-0 rounded-full bg-secondary px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-secondary-foreground"
              title="Includes material settings"
            >
              M
            </span>
          )}
        </button>

        {/* Expand button for material editing */}
        {hasMaterial && (
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={() => setExpanded(!expanded)}
            title={expanded ? "Collapse" : "Expand to edit material"}
          >
            <ChevronDown
              className={`size-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
            />
          </Button>
        )}

        {/* Edit textures button */}
        <EditPresetDialog preset={preset} snapshotMaterial={snapshotMaterial} />

        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          onClick={onDelete}
          aria-label="Delete preset"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      {/* Expanded material editing panel */}
      {expanded && hasMaterial && (
        <div className="space-y-2.5 rounded-md border bg-muted/30 p-3">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Edit material
          </p>

          <MaterialSliders preset={preset} onMaterialChange={handleMaterialChange} />
        </div>
      )}
    </div>
  )
}

/**
 * Material editing sliders for an expanded preset.
 * Uses LOCAL state for each preset - changes are independent per preset.
 * For Simple presets: only Roughness and Clearcoat.
 * For PBR presets: full set of sliders.
 */
function MaterialSliders({
  preset,
  onMaterialChange,
}: {
  preset: DesignPreset
  onMaterialChange: (key: string, value: number) => void
}) {
  if (!preset.material) return null

  const isSimple = preset.type === "simple"
  const m = preset.material

  // Simple preset: only 2 sliders
  if (isSimple) {
    return (
      <div className="space-y-2">
        <SliderRow
          label="Roughness"
          value={m.cardRoughness}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => onMaterialChange("cardRoughness", v)}
        />
        <SliderRow
          label="Clearcoat"
          value={m.cardClearcoat}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => onMaterialChange("cardClearcoat", v)}
        />
      </div>
    )
  }

  // PBR preset: full sliders
  return (
    <div className="space-y-2">
      <SliderRow
        label="Roughness"
        value={m.cardRoughness}
        min={0}
        max={1}
        step={0.01}
        onChange={(v) => onMaterialChange("cardRoughness", v)}
      />
      <SliderRow
        label="Metalness"
        value={m.cardMetalness}
        min={0}
        max={1}
        step={0.01}
        onChange={(v) => onMaterialChange("cardMetalness", v)}
      />
      <SliderRow
        label="Normal intensity"
        value={m.cardNormalScale}
        min={0}
        max={2}
        step={0.01}
        onChange={(v) => onMaterialChange("cardNormalScale", v)}
      />
      <SliderRow
        label="Clearcoat"
        value={m.cardClearcoat}
        min={0}
        max={1}
        step={0.01}
        onChange={(v) => onMaterialChange("cardClearcoat", v)}
      />
      <SliderRow
        label="Clearcoat roughness"
        value={m.cardClearcoatRoughness}
        min={0}
        max={1}
        step={0.01}
        onChange={(v) => onMaterialChange("cardClearcoatRoughness", v)}
      />
      <SliderRow
        label="Edge tint"
        value={m.cardEdgeTint}
        min={0}
        max={1}
        step={0.01}
        onChange={(v) => onMaterialChange("cardEdgeTint", v)}
      />

      {/* Glare */}
      {m.glareMode !== "none" && (
        <>
          <SliderRow
            label="Glare intensity"
            value={m.glareIntensity}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => onMaterialChange("glareIntensity", v)}
          />
          <SliderRow
            label="Glare width"
            value={m.glareWidth}
            min={0.1}
            max={3}
            step={0.1}
            onChange={(v) => onMaterialChange("glareWidth", v)}
          />
          <SliderRow
            label="Glare softness"
            value={m.glareSoftness}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => onMaterialChange("glareSoftness", v)}
          />
        </>
      )}

      {/* Holographic */}
      {m.holoEnabled && (
        <>
          <SliderRow
            label="Holo intensity"
            value={m.holoIntensity}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => onMaterialChange("holoIntensity", v)}
          />
          <SliderRow
            label="Holo scale"
            value={m.holoScale}
            min={0.5}
            max={5}
            step={0.1}
            onChange={(v) => onMaterialChange("holoScale", v)}
          />
          <SliderRow
            label="Holo hue shift"
            value={m.holoHueShift}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => onMaterialChange("holoHueShift", v)}
          />
        </>
      )}

      {/* Foil */}
      {m.foilEnabled && (
        <>
          <SliderRow
            label="Foil sheen"
            value={m.foilSheen}
            min={0}
            max={2}
            step={0.01}
            onChange={(v) => onMaterialChange("foilSheen", v)}
          />
          <SliderRow
            label="Foil sparkle"
            value={m.foilSparkle}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => onMaterialChange("foilSparkle", v)}
          />
          <SliderRow
            label="Foil density"
            value={m.foilDensity}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => onMaterialChange("foilDensity", v)}
          />
          <SliderRow
            label="Foil sparkle size"
            value={m.foilSparkleSize}
            min={0.5}
            max={3}
            step={0.1}
            onChange={(v) => onMaterialChange("foilSparkleSize", v)}
          />
        </>
      )}
    </div>
  )
}

/**
 * Simple slider row component.
 */
function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <label className="text-[11px] text-muted-foreground flex-shrink-0">{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 h-1.5"
      />
      <span className="text-[10px] font-mono text-muted-foreground w-10 text-right">
        {value.toFixed(2)}
      </span>
    </div>
  )
}

/**
 * Create a simple material: front albedo + optional gloss, back color or PBR.
 */
function CreateSimpleDialog({
  onCreated,
  snapshotMaterial,
}: {
  onCreated: () => void
  snapshotMaterial: () => PresetMaterial
}) {
  const presets = useStudio((s) => s.presets)
  const setPresets = useStudio((s) => s.setPresets)
  const applyPreset = useStudio((s) => s.applyPreset)

  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [frontAlbedo, setFrontAlbedo] = useState<File | null>(null)
  const [frontGloss, setFrontGloss] = useState<File | null>(null)
  const [backMode, setBackMode] = useState<"color" | "pbr">("color")
  const [backColor, setBackColor] = useState("#ffffff")
  const [backDesign, setBackDesign] = useState<File | null>(null)
  const [backPbrFiles, setBackPbrFiles] = useState<SideFiles>({})
  const [includeMaterial, setIncludeMaterial] = useState(true)
  const [saving, setSaving] = useState(false)

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error("Enter a preset name")
      return
    }
    if (!frontAlbedo) {
      toast.error("Front design (albedo) is required")
      return
    }

    setSaving(true)
    try {
      const frontFiles: SideFiles = { albedo: frontAlbedo }
      if (frontGloss) {
        frontFiles.metallic = frontGloss
      }

      const backFiles: SideFiles = {}
      if (backMode === "color") {
        // For color mode: store the color as metadata, and optional design PNG
        if (backDesign) {
          backFiles.albedo = backDesign
        }
      } else {
        // PBR mode: use uploaded files
        Object.assign(backFiles, backPbrFiles)
      }

      await savePreset({
        id: crypto.randomUUID(),
        name: name.trim(),
        type: "simple",
        frontFiles,
        backFiles,
        backColor: backMode === "color" ? backColor : undefined,
        material: includeMaterial ? snapshotMaterial() : undefined,
      })

      await new Promise((r) => setTimeout(r, 100))
      onCreated()
      
      // Refresh and apply the new preset
      const updated = await loadPresets()
      setPresets(updated)
      // Apply the newest preset (should be first since ordered DESC by created_at)
      if (updated.length > 0) {
        applyPreset(updated[0])
      }

      toast.success("Simple material created")
      setOpen(false)
      setName("")
      setFrontAlbedo(null)
      setFrontGloss(null)
      setBackDesign(null)
      setBackPbrFiles({})
    } catch (err) {
      console.error("[v0] create simple error:", err)
      toast.error("Failed to create material")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 gap-1 bg-transparent">
          <Plus className="size-3.5" />
          Simple
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Simple Material</DialogTitle>
          <DialogDescription>
            Design + optional gloss on front, color or PBR on back.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Preset name */}
          <div className="space-y-2">
            <Label htmlFor="simple-name" className="text-sm">
              Preset name
            </Label>
            <Input
              id="simple-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Aurora Mountains"
              className="text-sm"
            />
          </div>

          {/* Front side */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Front</Label>

            {/* Albedo (required) */}
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="text-xs font-medium text-muted-foreground mb-2">DESIGN (Albedo)</div>
              <FileInput
                label="Design image"
                file={frontAlbedo}
                onFile={setFrontAlbedo}
                accept="image/*"
              />
            </div>

            {/* Optional gloss */}
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="text-xs font-medium text-muted-foreground mb-2">GLOSS (Metallic) - Optional</div>
              <FileInput
                label="Gloss/shine mask"
                file={frontGloss}
                onFile={setFrontGloss}
                accept="image/*"
              />
            </div>
          </div>

          {/* Back side mode */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Back</Label>

            <div className="flex gap-2">
              <label className="flex flex-1 items-center gap-2 rounded-md border px-3 py-2 cursor-pointer hover:bg-muted/50">
                <input
                  type="radio"
                  name="back-mode"
                  value="color"
                  checked={backMode === "color"}
                  onChange={(e) => setBackMode(e.target.value as "color" | "pbr")}
                  className="size-3.5"
                />
                <span className="text-sm font-medium">Simple (Color)</span>
              </label>
              <label className="flex flex-1 items-center gap-2 rounded-md border px-3 py-2 cursor-pointer hover:bg-muted/50">
                <input
                  type="radio"
                  name="back-mode"
                  value="pbr"
                  checked={backMode === "pbr"}
                  onChange={(e) => setBackMode(e.target.value as "color" | "pbr")}
                  className="size-3.5"
                />
                <span className="text-sm font-medium">Full PBR</span>
              </label>
            </div>
          </div>

          {/* Back: Color mode */}
          {backMode === "color" && (
            <div className="space-y-3 rounded-md border bg-muted/20 p-3">
              <div className="flex items-center gap-3">
                <div className="text-xs font-medium text-muted-foreground flex-1">Background Color</div>
                <input
                  type="color"
                  value={backColor}
                  onChange={(e) => setBackColor(e.target.value)}
                  className="size-8 rounded cursor-pointer"
                />
              </div>

              <div className="pt-2 border-t">
                <div className="text-xs font-medium text-muted-foreground mb-2">Design (Optional)</div>
                <FileInput
                  label="Back design image"
                  file={backDesign}
                  onFile={setBackDesign}
                  accept="image/*"
                />
              </div>
            </div>
          )}

          {/* Back: PBR mode */}
          {backMode === "pbr" && (
            <SidePanel
              label="Back PBR"
              side="back"
              files={backPbrFiles}
              onChange={setBackPbrFiles}
            />
          )}

          {/* Material settings */}
          <label className="flex items-start gap-2 rounded-md border bg-muted/30 p-2.5 text-xs">
            <input
              type="checkbox"
              checked={includeMaterial}
              onChange={(e) => setIncludeMaterial(e.target.checked)}
              className="mt-0.5 size-3.5 cursor-pointer accent-primary"
            />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium text-foreground">Include material settings</span>
              <span className="text-muted-foreground">
                Save current roughness, glare, and special effects.
              </span>
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-1.5 size-4 animate-spin" />
                Creating…
              </>
            ) : (
              "Create Material"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Simple file input component.
 */
function FileInput({
  label,
  file,
  onFile,
  accept = "*",
}: {
  label: string
  file: File | null
  onFile: (f: File | null) => void
  accept?: string
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">
        {file && <span className="text-xs font-mono text-foreground">{file.name}</span>}
        <label className="cursor-pointer">
          <input
            type="file"
            accept={accept}
            onChange={(e) => onFile(e.target.files?.[0] || null)}
            className="hidden"
          />
          <span className="inline-block rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity">
            {file ? "Change" : "Upload"}
          </span>
        </label>
      </div>
    </div>
  )
}

function UploadPresetDialog({
  onUploaded,
  snapshotMaterial,
}: {
  onUploaded: () => void
  snapshotMaterial: () => PresetMaterial
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [includeMaterial, setIncludeMaterial] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [front, setFront] = useState<SideFiles>({})
  const [back, setBack] = useState<SideFiles>({})
  
  // Get applyPreset from store so we can apply the new preset after upload
  const applyPreset = useStudio((s) => s.applyPreset)

  const totalCount = Object.keys(front).length + Object.keys(back).length

  const reset = () => {
    setName("")
    setFront({})
    setBack({})
    setIncludeMaterial(true)
  }

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Enter a preset name")
      return
    }
    if (totalCount === 0) {
      toast.error("Select at least one texture")
      return
    }

    setUploading(true)

    try {
      await savePreset({
        id: generatePresetId(),
        name: name.trim(),
        type: "pbr",
        frontFiles: front as Record<string, File>,
        backFiles: back as Record<string, File>,
        material: includeMaterial ? snapshotMaterial() : undefined,
      })

      toast.success("Preset saved locally")
      setOpen(false)
      reset()
      
      // Refresh and apply the new preset
      const updated = await loadPresets()
      onUploaded()
      // Apply the newest preset (should be first since ordered DESC by created_at)
      if (updated.length > 0) {
        applyPreset(updated[0])
      }
    } catch (err) {
      console.error("[v0] preset save error:", err)
      toast.error(`Failed to save preset: ${(err as Error).message}`)
    } finally {
      setUploading(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 gap-1 bg-transparent">
          <Plus className="size-3.5" /> PBR
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload PBR preset</DialogTitle>
          <DialogDescription>
            Upload individual channel maps for the front and back of the card. Textures are stored
            locally in your browser (IndexedDB). Any channel can be left empty.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="preset-name">Preset name</Label>
            <Input
              id="preset-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Midnight Steel"
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SidePanel label="Front" side="front" files={front} onChange={setFront} />
            <SidePanel label="Back" side="back" files={back} onChange={setBack} />
          </div>

          <p className="text-xs text-muted-foreground">
            {totalCount > 0
              ? `${totalCount} file${totalCount === 1 ? "" : "s"} ready to save.`
              : "No files selected yet."}
          </p>

          <label className="flex cursor-pointer items-start gap-2 rounded-md border bg-muted/30 p-2.5 text-xs">
            <input
              type="checkbox"
              checked={includeMaterial}
              onChange={(e) => setIncludeMaterial(e.target.checked)}
              className="mt-0.5 size-3.5 cursor-pointer accent-primary"
            />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium text-foreground">Include current material settings</span>
              <span className="text-muted-foreground">
                Saves card roughness, metalness, edge color, glare, holographic and foil settings together
                with the textures. They&apos;ll be restored every time you load this design.
              </span>
            </span>
          </label>
        </div>

        <DialogFooter className="mt-6">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={uploading}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={uploading || totalCount === 0}>
            {uploading ? (
              <>
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                Saving…
              </>
            ) : (
              "Save preset"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SidePanel({
  label,
  side,
  files,
  onChange,
}: {
  label: string
  side: "front" | "back"
  files: SideFiles
  onChange: (next: SideFiles) => void
}) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="flex flex-col gap-2">
        {CHANNELS.map((c) => (
          <ChannelRow
            key={c.key}
            id={`${side}_${c.key}`}
            label={c.label}
            file={files[c.key]}
            onFile={(f) => {
              const next = { ...files }
              if (f) next[c.key] = f
              else delete next[c.key]
              onChange(next)
            }}
          />
        ))}
      </div>
    </div>
  )
}

function ChannelRow({
  id,
  label,
  file,
  onFile,
}: {
  id: string
  label: string
  file: File | undefined
  onFile: (f: File | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={id} className="w-20 shrink-0 text-xs">
        {label}
      </Label>

      <input
        ref={inputRef}
        id={id}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          onFile(f ?? null)
          e.target.value = ""
        }}
      />

      {file ? (
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border bg-background px-2 py-1">
          <div className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="" className="size-full object-cover" />
            ) : (
              <ImageIcon className="size-3.5 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium">{file.name}</div>
            <div className="text-[10px] text-muted-foreground">{formatSize(file.size)}</div>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-6 shrink-0"
            onClick={() => onFile(null)}
            aria-label={`Remove ${label}`}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 flex-1 justify-start gap-1.5 bg-background font-normal text-muted-foreground"
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="size-3.5" />
          Choose file…
        </Button>
      )}
    </div>
  )
}

/**
 * Dialog to edit preset name, replace textures, and update material settings.
 * Shows different UI for Simple vs PBR presets.
 */
function EditPresetDialog({
  preset,
  snapshotMaterial,
}: {
  preset: DesignPreset
  snapshotMaterial: () => PresetMaterial
}) {
  const presets = useStudio((s) => s.presets)
  const setPresets = useStudio((s) => s.setPresets)

  const isSimple = preset.type === "simple"

  const [open, setOpen] = useState(false)
  const [editName, setEditName] = useState(preset.name)
  const [includeMaterial, setIncludeMaterial] = useState(!!preset.material)
  const [updating, setUpdating] = useState(false)
  
  // Simple mode state
  const [frontAlbedo, setFrontAlbedo] = useState<File | null>(null)
  const [frontGloss, setFrontGloss] = useState<File | null>(null)
  const [backDesign, setBackDesign] = useState<File | null>(null)
  const [backColor, setBackColor] = useState(preset.backColor || "#ffffff")
  
  // PBR mode state
  const [front, setFront] = useState<SideFiles>({})
  const [back, setBack] = useState<SideFiles>({})

  const totalCount = isSimple
    ? (frontAlbedo ? 1 : 0) + (frontGloss ? 1 : 0) + (backDesign ? 1 : 0)
    : Object.keys(front).length + Object.keys(back).length

  const resetAll = () => {
    setFront({})
    setBack({})
    setFrontAlbedo(null)
    setFrontGloss(null)
    setBackDesign(null)
  }

  const handleSave = async () => {
    if (!editName.trim()) {
      toast.error("Enter a preset name")
      return
    }

    setUpdating(true)
    try {
      let frontFiles: Record<string, File> = {}
      let backFiles: Record<string, File> = {}

      if (isSimple) {
        if (frontAlbedo) frontFiles.albedo = frontAlbedo
        if (frontGloss) frontFiles.metallic = frontGloss
        if (backDesign) backFiles.albedo = backDesign
      } else {
        frontFiles = front as Record<string, File>
        backFiles = back as Record<string, File>
      }

      // Save updated name, textures, and optionally new material
      const updatedPreset: DesignPreset = {
        ...preset,
        name: editName.trim(),
        backColor: isSimple ? backColor : preset.backColor,
        material: includeMaterial ? snapshotMaterial() : preset.material,
        createdAt: preset.createdAt,
      }

      await savePreset({
        id: preset.id,
        name: updatedPreset.name,
        type: preset.type,
        frontFiles,
        backFiles,
        backColor: isSimple ? backColor : undefined,
        material: updatedPreset.material,
      })

      // Update local state
      setPresets(presets.map((p) => (p.id === preset.id ? updatedPreset : p)))

      toast.success("Preset updated")
      setOpen(false)
      resetAll()
    } catch (err) {
      console.error("[v0] preset update error:", err)
      toast.error("Failed to update preset")
    } finally {
      setUpdating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          aria-label="Edit preset textures"
        >
          <Edit2 className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {isSimple ? "Simple" : "PBR"} Design</DialogTitle>
          <DialogDescription>
            {isSimple
              ? "Update design images and back color."
              : "Update the preset name, replace textures, and material settings."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          <div className="space-y-2">
            <Label htmlFor="edit-preset-name" className="text-sm">
              Preset name
            </Label>
            <Input
              id="edit-preset-name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="e.g., My custom design"
              className="text-sm"
            />
          </div>

          {/* Simple mode texture replacement */}
          {isSimple ? (
            <div className="space-y-3">
              <Label className="text-sm">Replace images (optional)</Label>
              
              {/* Front */}
              <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                <p className="text-xs font-medium uppercase text-muted-foreground">Front</p>
                <FileInput
                  label="Design (Albedo)"
                  file={frontAlbedo}
                  onFile={setFrontAlbedo}
                  accept="image/*"
                />
                <FileInput
                  label="Gloss (Metallic)"
                  file={frontGloss}
                  onFile={setFrontGloss}
                  accept="image/*"
                />
              </div>
              
              {/* Back */}
              <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                <p className="text-xs font-medium uppercase text-muted-foreground">Back</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Background color</span>
                  <input
                    type="color"
                    value={backColor}
                    onChange={(e) => setBackColor(e.target.value)}
                    className="size-7 rounded cursor-pointer"
                  />
                </div>
                <FileInput
                  label="Design (optional)"
                  file={backDesign}
                  onFile={setBackDesign}
                  accept="image/*"
                />
              </div>
            </div>
          ) : (
            /* PBR mode texture replacement */
            <div className="space-y-2">
              <Label className="text-sm">Replace textures (optional)</Label>
              <div className="grid grid-cols-1 gap-3">
                <SidePanel label="Front" side="front" files={front} onChange={setFront} />
                <SidePanel label="Back" side="back" files={back} onChange={setBack} />
              </div>
              {totalCount > 0 && (
                <p className="text-xs text-muted-foreground">
                  {totalCount} file{totalCount === 1 ? "" : "s"} ready to replace.
                </p>
              )}
            </div>
          )}

          {/* Current material info - only for PBR */}
          {!isSimple && preset.material && (
            <div className="space-y-2 rounded-md border bg-muted/20 p-2.5">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Current material
              </p>
              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Roughness:</span>
                  <span className="font-mono font-medium">{preset.material.cardRoughness.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Clearcoat:</span>
                  <span className="font-mono font-medium">{preset.material.cardClearcoat.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}

          <label className="flex cursor-pointer items-start gap-2 rounded-md border bg-muted/30 p-2.5 text-xs">
            <input
              type="checkbox"
              checked={includeMaterial}
              onChange={(e) => setIncludeMaterial(e.target.checked)}
              className="mt-0.5 size-3.5 cursor-pointer accent-primary"
            />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium text-foreground">Update material settings</span>
              <span className="text-muted-foreground">
                {preset.material
                  ? "Replace the saved material with current settings."
                  : "Save the current card roughness and clearcoat settings to this design."}
              </span>
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={updating}>
            {updating ? (
              <>
                <Loader2 className="mr-1.5 size-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
