"use client"

import { useEffect, useRef, useState } from "react"
import { Check, Loader2, Plus, Trash2, Upload } from "lucide-react"
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
  const formRef = useRef<HTMLFormElement>(null)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!formRef.current) return
    const fd = new FormData(formRef.current)
    fd.set("name", name || "Untitled")
    setUploading(true)
    try {
      const r = await fetch("/api/presets", { method: "POST", body: fd })
      if (!r.ok) throw new Error("upload failed")
      toast.success("Preset saved")
      setOpen(false)
      setName("")
      formRef.current.reset()
      onUploaded()
    } catch {
      toast.error("Failed to upload preset")
    } finally {
      setUploading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 gap-1 bg-transparent">
          <Plus className="size-3.5" /> New
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <form ref={formRef} onSubmit={handleSubmit}>
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
              <SidePanel side="front" label="Front" />
              <SidePanel side="back" label="Back" />
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={uploading}>
              {uploading ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" /> Uploading…
                </>
              ) : (
                "Save preset"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function SidePanel({ side, label }: { side: "front" | "back"; label: string }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="grid grid-cols-1 gap-2">
        {CHANNELS.map((c) => (
          <div key={c.key} className="grid grid-cols-[5rem_1fr] items-center gap-2">
            <Label htmlFor={`${side}_${c.key}`} className="text-xs">
              {c.label}
            </Label>
            <Input
              id={`${side}_${c.key}`}
              name={`${side}_${c.key}`}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="h-8 text-xs file:text-xs"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
