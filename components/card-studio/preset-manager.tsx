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
          const hasMaterial = !!p.material
          return (
            <PresetRow
              key={p.id}
              preset={p}
              active={active}
              onApply={() => applyPreset(p)}
              onDelete={() => onDelete(p.id)}
              onEdit={() => {}}
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
  snapshotMaterial,
}: {
  preset: DesignPreset
  active: boolean
  onApply: () => void
  onDelete: () => void
  snapshotMaterial: () => PresetMaterial
}) {
  const hasMaterial = !!preset.material
  const setStudioState = useStudio((s) => s.set)
  const [expanded, setExpanded] = useState(false)

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

          <MaterialSliders preset={preset} setStudioState={setStudioState} />
        </div>
      )}
    </div>
  )
}

/**
 * Material editing sliders for an expanded preset.
 * Reads current values from studio store, not from the preset itself.
 */
function MaterialSliders({
  preset,
  setStudioState,
}: {
  preset: DesignPreset
  setStudioState: (key: string, value: unknown) => void
}) {
  if (!preset.material) return null

  // Read current values from store, not from preset snapshot
  const cardRoughness = useStudio((s) => s.cardRoughness)
  const cardMetalness = useStudio((s) => s.cardMetalness)
  const cardNormalScale = useStudio((s) => s.cardNormalScale)
  const cardClearcoat = useStudio((s) => s.cardClearcoat)
  const cardClearcoatRoughness = useStudio((s) => s.cardClearcoatRoughness)
  const cardEdgeTint = useStudio((s) => s.cardEdgeTint)
  const glareMode = useStudio((s) => s.glareMode)
  const glareIntensity = useStudio((s) => s.glareIntensity)
  const glareWidth = useStudio((s) => s.glareWidth)
  const glareSoftness = useStudio((s) => s.glareSoftness)
  const holoEnabled = useStudio((s) => s.holoEnabled)
  const holoIntensity = useStudio((s) => s.holoIntensity)
  const holoScale = useStudio((s) => s.holoScale)
  const holoHueShift = useStudio((s) => s.holoHueShift)
  const foilEnabled = useStudio((s) => s.foilEnabled)
  const foilSheen = useStudio((s) => s.foilSheen)
  const foilSparkle = useStudio((s) => s.foilSparkle)
  const foilDensity = useStudio((s) => s.foilDensity)
  const foilSparkleSize = useStudio((s) => s.foilSparkleSize)

  return (
    <div className="space-y-2">
      <SliderRow
        label="Roughness"
        value={cardRoughness}
        min={0}
        max={1}
        step={0.01}
        onChange={(v) => setStudioState("cardRoughness", v)}
      />
      <SliderRow
        label="Metalness"
        value={cardMetalness}
        min={0}
        max={1}
        step={0.01}
        onChange={(v) => setStudioState("cardMetalness", v)}
      />
      <SliderRow
        label="Normal intensity"
        value={cardNormalScale}
        min={0}
        max={2}
        step={0.01}
        onChange={(v) => setStudioState("cardNormalScale", v)}
      />
      <SliderRow
        label="Clearcoat"
        value={cardClearcoat}
        min={0}
        max={1}
        step={0.01}
        onChange={(v) => setStudioState("cardClearcoat", v)}
      />
      <SliderRow
        label="Clearcoat roughness"
        value={cardClearcoatRoughness}
        min={0}
        max={1}
        step={0.01}
        onChange={(v) => setStudioState("cardClearcoatRoughness", v)}
      />
      <SliderRow
        label="Edge tint"
        value={cardEdgeTint}
        min={0}
        max={1}
        step={0.01}
        onChange={(v) => setStudioState("cardEdgeTint", v)}
      />

      {/* Glare */}
      {glareMode !== "none" && (
        <>
          <SliderRow
            label="Glare intensity"
            value={glareIntensity}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => setStudioState("glareIntensity", v)}
          />
          <SliderRow
            label="Glare width"
            value={glareWidth}
            min={0.1}
            max={3}
            step={0.1}
            onChange={(v) => setStudioState("glareWidth", v)}
          />
          <SliderRow
            label="Glare softness"
            value={glareSoftness}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => setStudioState("glareSoftness", v)}
          />
        </>
      )}

      {/* Holographic */}
      {holoEnabled && (
        <>
          <SliderRow
            label="Holo intensity"
            value={holoIntensity}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => setStudioState("holoIntensity", v)}
          />
          <SliderRow
            label="Holo scale"
            value={holoScale}
            min={0.5}
            max={5}
            step={0.1}
            onChange={(v) => setStudioState("holoScale", v)}
          />
          <SliderRow
            label="Holo hue shift"
            value={holoHueShift}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => setStudioState("holoHueShift", v)}
          />
        </>
      )}

      {/* Foil */}
      {foilEnabled && (
        <>
          <SliderRow
            label="Foil sheen"
            value={foilSheen}
            min={0}
            max={2}
            step={0.01}
            onChange={(v) => setStudioState("foilSheen", v)}
          />
          <SliderRow
            label="Foil sparkle"
            value={foilSparkle}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => setStudioState("foilSparkle", v)}
          />
          <SliderRow
            label="Foil density"
            value={foilDensity}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => setStudioState("foilDensity", v)}
          />
          <SliderRow
            label="Foil sparkle size"
            value={foilSparkleSize}
            min={0.5}
            max={3}
            step={0.1}
            onChange={(v) => setStudioState("foilSparkleSize", v)}
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
        frontFiles: front as Record<string, File>,
        backFiles: back as Record<string, File>,
        material: includeMaterial ? snapshotMaterial() : undefined,
      })

      toast.success("Preset saved locally")
      setOpen(false)
      reset()
      onUploaded()
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
          <Plus className="size-3.5" /> New
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

  const [open, setOpen] = useState(false)
  const [editName, setEditName] = useState(preset.name)
  const [includeMaterial, setIncludeMaterial] = useState(!!preset.material)
  const [updating, setUpdating] = useState(false)
  const [front, setFront] = useState<SideFiles>({})
  const [back, setBack] = useState<SideFiles>({})

  const totalCount = Object.keys(front).length + Object.keys(back).length

  const resetTextures = () => {
    setFront({})
    setBack({})
  }

  const handleSave = async () => {
    if (!editName.trim()) {
      toast.error("Enter a preset name")
      return
    }

    setUpdating(true)
    try {
      // Save updated name, textures, and optionally new material
      const updatedPreset: DesignPreset = {
        ...preset,
        name: editName.trim(),
        material: includeMaterial ? snapshotMaterial() : preset.material,
        createdAt: preset.createdAt,
      }

      await savePreset({
        id: preset.id,
        name: updatedPreset.name,
        frontFiles: front as Record<string, File>,
        backFiles: back as Record<string, File>,
        material: updatedPreset.material,
      })

      // Update local state
      setPresets(presets.map((p) => (p.id === preset.id ? updatedPreset : p)))

      toast.success("Preset updated")
      setOpen(false)
      resetTextures()
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
          <DialogTitle>Edit Design</DialogTitle>
          <DialogDescription>
            Update the preset name, replace textures, and material settings.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          <div className="space-y-2">
            <Label htmlFor="preset-name" className="text-sm">
              Preset name
            </Label>
            <Input
              id="preset-name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="e.g., My custom design"
              className="text-sm"
            />
          </div>

          {/* Texture replacement */}
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

          {/* Current material info */}
          {preset.material && (
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
                  <span className="text-muted-foreground">Metalness:</span>
                  <span className="font-mono font-medium">{preset.material.cardMetalness.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Clearcoat:</span>
                  <span className="font-mono font-medium">{preset.material.cardClearcoat.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Glare:</span>
                  <span className="font-mono font-medium">
                    {preset.material.glareMode !== "none" ? "✓" : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Holo:</span>
                  <span className="font-mono font-medium">{preset.material.holoEnabled ? "✓" : "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Foil:</span>
                  <span className="font-mono font-medium">{preset.material.foilEnabled ? "✓" : "—"}</span>
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
                  : "Save the current card roughness, glare, holographic and foil settings to this design."}
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
