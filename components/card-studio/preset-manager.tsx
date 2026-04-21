"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Check, Image as ImageIcon, Loader2, Plus, Trash2, Upload, X } from "lucide-react"
import { upload } from "@vercel/blob/client"
import { useStudio, type DesignPreset } from "@/lib/studio-store"
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

  const refresh = async () => {
    setLoading(true)
    try {
      const r = await fetch("/api/presets")
      if (!r.ok) throw new Error("failed")
      const { presets } = (await r.json()) as { presets: DesignPreset[] }
      setPresets(presets)
    } catch {
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
    const r = await fetch(`/api/presets?id=${encodeURIComponent(id)}`, { method: "DELETE" })
    if (!r.ok) {
      toast.error("Failed to delete preset")
      return
    }
    setPresets(presets.filter((p) => p.id !== id))
    toast.success("Preset deleted")
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Saved designs</Label>
        <UploadPresetDialog onUploaded={refresh} />
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
            <EmptyDescription>Upload a PBR set to store it in Vercel Blob.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      <div className="flex flex-col gap-1.5">
        {presets.map((p) => {
          const active = activePresetId === p.id
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
                <span className="truncate text-sm">{p.name}</span>
              </button>
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

function UploadPresetDialog({ onUploaded }: { onUploaded: () => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [uploading, setUploading] = useState(false)
  const [front, setFront] = useState<SideFiles>({})
  const [back, setBack] = useState<SideFiles>({})

  const totalCount = Object.keys(front).length + Object.keys(back).length

  const reset = () => {
    setName("")
    setFront({})
    setBack({})
  }

  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

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
    setProgress({ done: 0, total: totalCount })

    const id = generateId()
    const entries: Array<{ side: "front" | "back"; channel: string; file: File }> = []
    for (const [k, f] of Object.entries(front)) if (f) entries.push({ side: "front", channel: k, file: f })
    for (const [k, f] of Object.entries(back)) if (f) entries.push({ side: "back", channel: k, file: f })

    try {
      const frontUrls: Record<string, string> = {}
      const backUrls: Record<string, string> = {}
      let done = 0

      for (const { side, channel, file } of entries) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
        const pathname = `presets/${id}/${side}-${channel}-${safeName}`
        // Uploads directly from the browser to Blob, bypassing the 4.5 MB serverless body limit.
        const blob = await upload(pathname, file, {
          access: "public",
          handleUploadUrl: "/api/blob-upload-token",
        })
        if (side === "front") frontUrls[channel] = blob.url
        else backUrls[channel] = blob.url
        done += 1
        setProgress({ done, total: entries.length })
      }

      const r = await fetch("/api/presets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, name: name.trim(), front: frontUrls, back: backUrls }),
      })
      if (!r.ok) throw new Error(`meta ${r.status}`)

      toast.success("Preset saved")
      setOpen(false)
      reset()
      onUploaded()
    } catch (err) {
      console.error("[v0] preset upload error:", err)
      toast.error(`Failed to upload preset: ${(err as Error).message}`)
    } finally {
      setUploading(false)
      setProgress(null)
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
            Upload individual channel maps for the front and back of the card. Any channel can be left
            empty — the studio falls back to neutral values.
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
              ? `${totalCount} file${totalCount === 1 ? "" : "s"} ready to upload.`
              : "No files selected yet."}
          </p>
        </div>

        <DialogFooter className="mt-6">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={uploading}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={uploading || totalCount === 0}>
            {uploading ? (
              <>
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                {progress ? `Uploading ${progress.done}/${progress.total}…` : "Uploading…"}
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
          // reset native value so picking the same file twice re-triggers onChange
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

function generateId() {
  return (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2))
    .replace(/-/g, "")
    .slice(0, 12)
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
