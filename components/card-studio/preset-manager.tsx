"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Check, Edit2, Image as ImageIcon, Loader2, Plus, Save, Trash2, Upload, X } from "lucide-react"
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
            <div
              key={p.id}
              className="flex items-center justify-between gap-2 rounded-md border bg-card px-2.5 py-2"
            >
              <button
                type="button"
                onClick={() => applyPreset(p)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <span
                  className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${active ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
                >
                  {active && <Check className="size-3" />}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                {hasMaterial && (
                  <span
                    className="shrink-0 rounded-full bg-secondary px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-secondary-foreground"
                    title="Includes material settings"
                  >
                    M
                  </span>
                )}
              </button>
              <EditPresetDialog preset={p} onUpdated={refresh} snapshotMaterial={snapshotMaterial} />
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                onClick={() => onDelete(p.id)}
                aria-label="Delete preset"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          )
        })}
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
 * Dialog to edit preset name and optionally update its material settings.
 */
function EditPresetDialog({
  preset,
  onUpdated,
  snapshotMaterial,
}: {
  preset: DesignPreset
  onUpdated: () => void
  snapshotMaterial: () => PresetMaterial
}) {
  const presets = useStudio((s) => s.presets)
  const setPresets = useStudio((s) => s.setPresets)

  const [open, setOpen] = useState(false)
  const [editName, setEditName] = useState(preset.name)
  const [includeMaterial, setIncludeMaterial] = useState(!!preset.material)
  const [updating, setUpdating] = useState(false)

  const handleSave = async () => {
    if (!editName.trim()) {
      toast.error("Enter a preset name")
      return
    }

    setUpdating(true)
    try {
      // Save updated name and optionally new material
      const updatedPreset: DesignPreset = {
        ...preset,
        name: editName.trim(),
        material: includeMaterial ? snapshotMaterial() : preset.material,
        createdAt: preset.createdAt,
      }

      await savePreset({
        id: preset.id,
        name: updatedPreset.name,
        frontFiles: {},
        backFiles: {},
        material: updatedPreset.material,
      })

      // Update local state
      setPresets(presets.map((p) => (p.id === preset.id ? updatedPreset : p)))

      toast.success("Preset updated")
      setOpen(false)
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
          aria-label="Edit preset"
        >
          <Edit2 className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Design</DialogTitle>
          <DialogDescription>
            Update the preset name and material settings.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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
                Save the current card roughness, glare, holographic and foil settings to this design.
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
