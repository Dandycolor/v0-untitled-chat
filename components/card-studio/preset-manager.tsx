"use client"

import { useEffect, useRef, useState } from "react"
import {
  Check,
  ChevronDown,
  Image as ImageIcon,
  Loader2,
  Plus,
  Save,
  Trash2,
  Upload,
  X,
} from "lucide-react"
import { useStudio, MATERIAL_KEYS, type DesignPreset, type PresetMaterial } from "@/lib/studio-store"
import {
  loadPresets,
  savePreset,
  deletePreset,
  updatePresetMaterial,
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
import { Slider } from "@/components/ui/slider"
import { toast } from "sonner"

/** PBR channels — must match server schema. */
const PBR_CHANNELS = [
  { key: "albedo", label: "Albedo" },
  { key: "normal", label: "Normal" },
  { key: "roughness", label: "Roughness" },
  { key: "metallic", label: "Metallic" },
  { key: "ao", label: "AO" },
  { key: "height", label: "Height" },
  { key: "orm", label: "ORM (packed)" },
] as const

type PbrChannelKey = (typeof PBR_CHANNELS)[number]["key"]
type PbrFiles = Partial<Record<PbrChannelKey, File>>

const TEMPLATE_DEFAULT_URL = "/textures/back-template.png"

// ---------------------------------------------------------------------------
// PresetManager — top-level UI
// ---------------------------------------------------------------------------

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
      toast.success("Material deleted")
    } catch {
      toast.error("Failed to delete material")
    }
  }

  const snapshotMaterial = (): PresetMaterial => {
    const s = useStudio.getState()
    const out = {} as PresetMaterial
    for (const k of MATERIAL_KEYS) {
      ;(out as Record<string, unknown>)[k] = s[k]
    }
    return out
  }

  const onSaveMaterialToActive = async () => {
    if (!activePresetId) return
    setSavingMaterial(true)
    try {
      const material = snapshotMaterial()
      await updatePresetMaterial(activePresetId, material)
      setPresets(presets.map((p) => (p.id === activePresetId ? { ...p, material } : p)))
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
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Materials
        </Label>
        <div className="flex items-center gap-1.5">
          {activePresetId && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 bg-transparent"
              onClick={onSaveMaterialToActive}
              disabled={savingMaterial}
              title="Save current settings to active material"
            >
              {savingMaterial ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
              Save
            </Button>
          )}
          <CreateMaterialDialog
            kind="pbr"
            onCreated={refresh}
            snapshotMaterial={snapshotMaterial}
          />
          <CreateMaterialDialog
            kind="simple"
            onCreated={refresh}
            snapshotMaterial={snapshotMaterial}
          />
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
            <EmptyTitle>No materials yet</EmptyTitle>
            <EmptyDescription>
              Create a Simple material (design + gloss) or PBR material (full texture set).
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      <div className="flex flex-col gap-1.5">
        {presets.map((p) => (
          <PresetRow
            key={p.id}
            preset={p}
            active={activePresetId === p.id}
            onApply={() => applyPreset(p)}
            onDelete={() => onDelete(p.id)}
            onRefresh={refresh}
          />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PresetRow — single material in the list, expandable to edit textures + sliders
// ---------------------------------------------------------------------------

function PresetRow({
  preset,
  active,
  onApply,
  onDelete,
  onRefresh,
}: {
  preset: DesignPreset
  active: boolean
  onApply: () => void
  onDelete: () => void
  onRefresh: () => void
}) {
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
            className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${
              active ? "border-primary bg-primary text-primary-foreground" : "border-border"
            }`}
          >
            {active && <Check className="size-3" />}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm">{preset.name}</span>
          <span
            className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide ${
              preset.type === "simple"
                ? "bg-secondary text-secondary-foreground"
                : "bg-primary/10 text-primary"
            }`}
          >
            {preset.type === "simple" ? "Simple" : "PBR"}
          </span>
        </button>

        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          onClick={() => setExpanded(!expanded)}
          title={expanded ? "Collapse" : "Expand"}
        >
          <ChevronDown className={`size-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </Button>

        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          onClick={onDelete}
          aria-label="Delete material"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      {expanded && (
        <PresetEditor preset={preset} onRefresh={onRefresh} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// PresetEditor — replace textures, edit back color/template, edit material strength
// ---------------------------------------------------------------------------

function PresetEditor({
  preset,
  onRefresh,
}: {
  preset: DesignPreset
  onRefresh: () => void
}) {
  const presets = useStudio((s) => s.presets)
  const setPresets = useStudio((s) => s.setPresets)
  const applyPreset = useStudio((s) => s.applyPreset)
  const setMany = useStudio((s) => s.setMany)
  const activePresetId = useStudio((s) => s.activePresetId)
  const isActive = activePresetId === preset.id
  const isSimple = preset.type === "simple"

  // Live edits
  const [name, setName] = useState(preset.name)
  const [backColor, setBackColor] = useState(preset.backColor || "#000000")
  const [useTemplate, setUseTemplate] = useState(!!preset.backTemplate)
  const [saving, setSaving] = useState(false)

  // Replacement files (optional)
  const [pbrFront, setPbrFront] = useState<PbrFiles>({})
  const [simpleAlbedo, setSimpleAlbedo] = useState<File | null>(null)
  const [simpleClearMask, setSimpleClearMask] = useState<File | null>(null)

  // Live update back settings on the active preset (so user sees changes instantly)
  useEffect(() => {
    if (!isActive) return
    setMany({ backColor, backTemplate: useTemplate ? (preset.backTemplate || TEMPLATE_DEFAULT_URL) : undefined })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backColor, useTemplate, isActive])

  const material = preset.material
  const handleMaterialChange = async (key: keyof PresetMaterial, value: number) => {
    if (!material) return
    const newMat = { ...material, [key]: value }
    // Live-update the active preset's runtime values too
    if (isActive) setMany({ [key]: value } as Partial<typeof newMat>)
    setPresets(presets.map((p) => (p.id === preset.id ? { ...p, material: newMat } : p)))
    try {
      await updatePresetMaterial(preset.id, newMat)
    } catch (err) {
      console.error("[v0] live material update failed:", err)
    }
  }

  const onSaveAll = async () => {
    setSaving(true)
    try {
      const frontFiles: Record<string, File> = isSimple
        ? simpleAlbedo
          ? { albedo: simpleAlbedo, ...(simpleClearMask ? { clearcoatMask: simpleClearMask } : {}) }
          : simpleClearMask
            ? { clearcoatMask: simpleClearMask }
            : {}
        : (pbrFront as Record<string, File>)
      const backFiles: Record<string, File> = {}

      await savePreset({
        id: preset.id,
        name: name.trim() || preset.name,
        type: preset.type,
        frontFiles,
        backFiles,
        backColor,
        backTemplate: useTemplate
          ? preset.backTemplate || TEMPLATE_DEFAULT_URL
          : undefined,
        backTemplateClear: !useTemplate,
        material: preset.material,
      })

      toast.success("Material updated")
      onRefresh()
      setPbrFront({})
      setSimpleAlbedo(null)
      setSimpleClearMask(null)
      // Re-apply if active, so new textures show
      if (isActive) {
        const updated = await loadPresets()
        const fresh = updated.find((p) => p.id === preset.id)
        if (fresh) applyPreset(fresh)
      }
    } catch (err) {
      console.error("[v0] update preset error:", err)
      toast.error("Failed to update material")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3">
      {/* Name */}
      <div className="space-y-1.5">
        <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Name</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-8 text-sm"
        />
      </div>

      {/* Texture replacement */}
      {isSimple ? (
        <div className="space-y-2 rounded-md border bg-background/50 p-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Front design
          </p>
          <FileSlot label="Design (Albedo)" file={simpleAlbedo} onFile={setSimpleAlbedo} />
          <FileSlot
            label="Clearcoat mask (optional)"
            file={simpleClearMask}
            onFile={setSimpleClearMask}
          />
          <p className="text-[10px] text-muted-foreground">
            Mask: white = glossy, black = matte. Leave empty for uniform finish.
          </p>
        </div>
      ) : (
        <PbrSidePanel label="Front" files={pbrFront} onChange={setPbrFront} />
      )}

      {/* Back settings — color + template toggle */}
      <div className="space-y-2.5 rounded-md border bg-background/50 p-2.5">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Back side
        </p>
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs">Background color</Label>
          <div className="flex items-center gap-1.5">
            <Input
              type="color"
              value={backColor}
              onChange={(e) => setBackColor(e.target.value)}
              className="h-7 w-12 cursor-pointer p-1"
            />
            <Input
              value={backColor}
              onChange={(e) => setBackColor(e.target.value)}
              className="h-7 w-24 font-mono text-xs"
            />
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={useTemplate}
            onChange={(e) => setUseTemplate(e.target.checked)}
            className="size-3.5 cursor-pointer accent-primary"
          />
          <span className="text-xs">Show YooMoney back template</span>
        </label>
      </div>

      {/* Material strength sliders */}
      {material && (
        <div className="space-y-2 rounded-md border bg-background/50 p-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Material strength
          </p>
          <SliderRow
            label="Roughness"
            value={material.cardRoughness}
            min={0}
            max={1}
            onChange={(v) => handleMaterialChange("cardRoughness", v)}
          />
          {!isSimple && (
            <SliderRow
              label="Metalness"
              value={material.cardMetalness}
              min={0}
              max={1}
              onChange={(v) => handleMaterialChange("cardMetalness", v)}
            />
          )}
          {!isSimple && (
            <SliderRow
              label="Normal"
              value={material.cardNormalScale}
              min={0}
              max={3}
              onChange={(v) => handleMaterialChange("cardNormalScale", v)}
            />
          )}
          <SliderRow
            label="Clearcoat"
            value={material.cardClearcoat}
            min={0}
            max={1}
            onChange={(v) => handleMaterialChange("cardClearcoat", v)}
          />
          <SliderRow
            label="Clearcoat rough."
            value={material.cardClearcoatRoughness}
            min={0}
            max={1}
            onChange={(v) => handleMaterialChange("cardClearcoatRoughness", v)}
          />
        </div>
      )}

      <Button onClick={onSaveAll} disabled={saving} size="sm" className="w-full gap-1.5">
        {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
        Save changes
      </Button>
    </div>
  )
}

function SliderRow({
  label,
  value,
  min,
  max,
  step = 0.01,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
}) {
  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        <span className="font-mono text-[10px] text-muted-foreground">{value.toFixed(2)}</span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(v) => onChange(v[0])}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// CreateMaterialDialog — both PBR and Simple, controlled by `kind`
// ---------------------------------------------------------------------------

function CreateMaterialDialog({
  kind,
  onCreated,
  snapshotMaterial,
}: {
  kind: "simple" | "pbr"
  onCreated: () => void
  snapshotMaterial: () => PresetMaterial
}) {
  const setPresets = useStudio((s) => s.setPresets)
  const applyPreset = useStudio((s) => s.applyPreset)

  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)
  const [includeMaterial, setIncludeMaterial] = useState(true)

  // Simple state
  const [simpleAlbedo, setSimpleAlbedo] = useState<File | null>(null)
  const [simpleClearMask, setSimpleClearMask] = useState<File | null>(null)

  // PBR state
  const [pbrFront, setPbrFront] = useState<PbrFiles>({})

  // Back settings
  const [backColor, setBackColor] = useState("#000000")
  const [useTemplate, setUseTemplate] = useState(false)

  const reset = () => {
    setName("")
    setSimpleAlbedo(null)
    setSimpleClearMask(null)
    setPbrFront({})
    setBackColor("#000000")
    setUseTemplate(false)
    setIncludeMaterial(true)
  }

  const isPbr = kind === "pbr"
  const totalCount = isPbr
    ? Object.keys(pbrFront).length
    : (simpleAlbedo ? 1 : 0) + (simpleClearMask ? 1 : 0)

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error("Enter a name")
      return
    }
    if (isPbr && !pbrFront.albedo) {
      toast.error("Front albedo is required for PBR materials")
      return
    }
    if (!isPbr && !simpleAlbedo) {
      toast.error("Front design (albedo) is required")
      return
    }

    setSaving(true)
    try {
      let frontFiles: Record<string, File> = {}
      const backFiles: Record<string, File> = {}

      if (isPbr) {
        frontFiles = pbrFront as Record<string, File>
      } else {
        if (simpleAlbedo) frontFiles.albedo = simpleAlbedo
        if (simpleClearMask) frontFiles.clearcoatMask = simpleClearMask
      }

      await savePreset({
        id: crypto.randomUUID(),
        name: name.trim(),
        type: kind,
        frontFiles,
        backFiles,
        backColor,
        backTemplate: useTemplate ? TEMPLATE_DEFAULT_URL : undefined,
        material: includeMaterial ? snapshotMaterial() : undefined,
      })

      onCreated()
      const updated = await loadPresets()
      setPresets(updated)
      if (updated.length > 0) {
        // Apply the just-created preset (newest is first since DESC order)
        applyPreset(updated[0])
      }

      toast.success(`${isPbr ? "PBR" : "Simple"} material created`)
      setOpen(false)
      reset()
    } catch (err) {
      console.error("[v0] create error:", err)
      toast.error(`Failed to create material: ${(err as Error).message}`)
    } finally {
      setSaving(false)
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
        <Button size="sm" variant={isPbr ? "default" : "outline"} className="h-7 gap-1">
          <Plus className="size-3.5" />
          {isPbr ? "PBR" : "Simple"}
        </Button>
      </DialogTrigger>
      <DialogContent className={isPbr ? "max-w-2xl" : "sm:max-w-md"}>
        <DialogHeader>
          <DialogTitle>Create {isPbr ? "PBR" : "Simple"} Material</DialogTitle>
          <DialogDescription>
            {isPbr
              ? "Upload the full set of PBR maps for the front (and optional back)."
              : "Front design + optional clearcoat mask. Black = matte, white = glossy."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="mat-name">Name</Label>
            <Input
              id="mat-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={isPbr ? "e.g. Violet Metal" : "e.g. Monster Eyes"}
              className="text-sm"
            />
          </div>

          {/* Front textures */}
          {isPbr ? (
            <PbrSidePanel label="Front" files={pbrFront} onChange={setPbrFront} />
          ) : (
            <div className="space-y-2 rounded-md border bg-muted/30 p-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Front
              </p>
              <FileSlot label="Design (Albedo)" file={simpleAlbedo} onFile={setSimpleAlbedo} />
              <FileSlot
                label="Clearcoat mask (optional)"
                file={simpleClearMask}
                onFile={setSimpleClearMask}
              />
              <p className="text-[10px] text-muted-foreground">
                Mask: white pixels are glossy (e.g. monster eyes), black are matte.
              </p>
            </div>
          )}

          {/* Back settings */}
          <div className="space-y-2.5 rounded-md border bg-muted/30 p-3">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Back side
            </p>
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs">Background color</Label>
              <div className="flex items-center gap-1.5">
                <Input
                  type="color"
                  value={backColor}
                  onChange={(e) => setBackColor(e.target.value)}
                  className="h-8 w-14 cursor-pointer p-1"
                />
                <Input
                  value={backColor}
                  onChange={(e) => setBackColor(e.target.value)}
                  className="h-8 w-24 font-mono text-xs"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={useTemplate}
                onChange={(e) => setUseTemplate(e.target.checked)}
                className="size-3.5 cursor-pointer accent-primary"
              />
              <span className="text-xs">Show YooMoney back template overlay</span>
            </label>
            {useTemplate && (
              <div className="rounded-md border overflow-hidden bg-background">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={TEMPLATE_DEFAULT_URL}
                  alt="Back template preview"
                  className="w-full"
                  style={{ background: backColor }}
                />
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            {totalCount} file{totalCount === 1 ? "" : "s"} ready.
          </p>

          <label className="flex cursor-pointer items-start gap-2 rounded-md border bg-muted/30 p-2.5 text-xs">
            <input
              type="checkbox"
              checked={includeMaterial}
              onChange={(e) => setIncludeMaterial(e.target.checked)}
              className="mt-0.5 size-3.5 cursor-pointer accent-primary"
            />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium text-foreground">Save current material settings</span>
              <span className="text-muted-foreground">
                Roughness, clearcoat, glare, holo and foil settings.
              </span>
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                Creating…
              </>
            ) : (
              "Create"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// PBR side panel — list of channel slots
// ---------------------------------------------------------------------------

function PbrSidePanel({
  label,
  files,
  onChange,
}: {
  label: string
  files: PbrFiles
  onChange: (next: PbrFiles) => void
}) {
  return (
    <div className="rounded-md border bg-background/50 p-2.5">
      <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="flex flex-col gap-1.5">
        {PBR_CHANNELS.map((c) => (
          <FileSlot
            key={c.key}
            label={c.label}
            file={files[c.key] ?? null}
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

// ---------------------------------------------------------------------------
// FileSlot — single file picker with preview thumbnail
// ---------------------------------------------------------------------------

function FileSlot({
  label,
  file,
  onFile,
}: {
  label: string
  file: File | null
  onFile: (f: File | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  return (
    <div className="flex items-center gap-2">
      <Label className="w-24 shrink-0 text-[11px] text-muted-foreground">{label}</Label>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          onFile(e.target.files?.[0] ?? null)
          e.target.value = ""
        }}
      />
      {file ? (
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border bg-background px-2 py-1">
          <div className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="" className="size-full object-cover" />
            ) : (
              <ImageIcon className="size-3 text-muted-foreground" />
            )}
          </div>
          <span className="min-w-0 flex-1 truncate text-[11px]">{file.name}</span>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-5 shrink-0"
            onClick={() => onFile(null)}
            aria-label={`Remove ${label}`}
          >
            <X className="size-3" />
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 flex-1 justify-start gap-1.5 bg-background font-normal text-muted-foreground"
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="size-3" />
          Choose file…
        </Button>
      )}
    </div>
  )
}
