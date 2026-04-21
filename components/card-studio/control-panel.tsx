"use client"

import { Download, Camera, Sparkles, Palette, Box, Sun, Layers, Cpu } from "lucide-react"
import { useStudio, type CardModelId, type HdrPreset, type ViewId } from "@/lib/studio-store"
import { VIEWS } from "./camera-rig"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Separator } from "@/components/ui/separator"
import { PresetManager } from "./preset-manager"

function Row({
  label,
  value,
  children,
}: {
  label: string
  value?: string | number
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        {value !== undefined && (
          <span className="font-mono text-[10px] text-muted-foreground">{value}</span>
        )}
      </div>
      {children}
    </div>
  )
}

function NumSlider({
  label,
  value,
  min,
  max,
  step = 0.01,
  onChange,
  format = (v) => v.toFixed(2),
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  format?: (v: number) => string
}) {
  return (
    <Row label={label} value={format(value)}>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(v) => onChange(v[0])}
      />
    </Row>
  )
}

function SectionTrigger({
  icon,
  title,
}: {
  icon: React.ReactNode
  title: string
}) {
  return (
    <AccordionTrigger className="px-3 hover:no-underline">
      <span className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">{icon}</span>
        {title}
      </span>
    </AccordionTrigger>
  )
}

export function ControlPanel() {
  const s = useStudio()

  const onCapture = () => {
    const fn = (window as unknown as { __captureCard?: () => void }).__captureCard
    fn?.()
  }

  return (
    <aside className="flex h-full w-[340px] shrink-0 flex-col border-l bg-sidebar text-sidebar-foreground">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex flex-col">
          <span className="text-sm font-semibold leading-tight">Card Material Studio</span>
          <span className="text-[11px] text-muted-foreground">PBR · Blink · Logo · Chip</span>
        </div>
        <Button size="sm" onClick={onCapture} className="gap-1.5">
          <Camera className="size-3.5" />
          PNG
        </Button>
      </header>

      <ScrollArea className="min-h-0 flex-1 [&>[data-radix-scroll-area-viewport]]:max-h-full">
        <Accordion
          type="multiple"
          defaultValue={["model", "designs", "card", "glare", "chip", "logo", "env", "capture"]}
          className="px-0"
        >
          <AccordionItem value="model" className="border-b">
            <SectionTrigger icon={<Box className="size-3.5" />} title="Model & View" />
            <AccordionContent className="space-y-4 px-4 pb-4">
              <Row label="Card model">
                <Select
                  value={s.modelId}
                  onValueChange={(v) => s.set("modelId", v as CardModelId)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="card_no_chip">No chip</SelectItem>
                    <SelectItem value="card_chip1">Chip 1</SelectItem>
                    <SelectItem value="card_chip2">Chip 2</SelectItem>
                    <SelectItem value="card_chip3">Chip 3</SelectItem>
                  </SelectContent>
                </Select>
              </Row>

              <Row label="Orientation">
                <ToggleGroup
                  type="single"
                  value={s.orientation}
                  onValueChange={(v) => v && s.set("orientation", v as "horizontal" | "vertical")}
                  className="w-full"
                >
                  <ToggleGroupItem value="horizontal" className="flex-1">
                    Horizontal
                  </ToggleGroupItem>
                  <ToggleGroupItem value="vertical" className="flex-1">
                    Vertical
                  </ToggleGroupItem>
                </ToggleGroup>
              </Row>

              <Row label="Projection">
                <ToggleGroup
                  type="single"
                  value={s.projection}
                  onValueChange={(v) =>
                    v && s.set("projection", v as "perspective" | "orthographic")
                  }
                  className="w-full"
                >
                  <ToggleGroupItem value="perspective" className="flex-1">
                    Perspective
                  </ToggleGroupItem>
                  <ToggleGroupItem value="orthographic" className="flex-1">
                    Orthographic
                  </ToggleGroupItem>
                </ToggleGroup>
              </Row>

              {s.projection === "perspective" && (
                <NumSlider
                  label="Focal length (mm)"
                  value={s.focalLength}
                  min={14}
                  max={200}
                  step={1}
                  onChange={(v) => s.set("focalLength", v)}
                />
              )}

              <Row label="Camera view">
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      ["front", "Front"],
                      ["threeQuarterFront", "3/4 F"],
                      ["side", "Side"],
                      ["back", "Back"],
                      ["threeQuarterBack", "3/4 B"],
                      ["top", "Top"],
                      ["hero", "Hero"],
                    ] as Array<[ViewId, string]>
                  ).map(([v, lbl]) => (
                    <Button
                      key={v}
                      size="sm"
                      variant={s.viewId === v ? "default" : "outline"}
                      onClick={() => {
                        s.set("viewId", v)
                        // If the view has an authored focal length, apply it so the preset
                        // lands at the exact framing it was captured at.
                        const presetFocal = VIEWS[v].focal
                        if (presetFocal) s.set("focalLength", presetFocal)
                      }}
                      className="h-8 text-xs"
                    >
                      {lbl}
                    </Button>
                  ))}
                </div>
              </Row>

              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Auto-rotate</Label>
                <Switch checked={s.autoRotate} onCheckedChange={(v) => s.set("autoRotate", v)} />
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="designs" className="border-b">
            <SectionTrigger icon={<Palette className="size-3.5" />} title="Designs (PBR)" />
            <AccordionContent className="space-y-4 px-4 pb-4">
              <PresetManager />
              <Separator />
              <div className="space-y-2">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Texture orientation
                </p>
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Flip horizontal</Label>
                  <Switch
                    checked={s.textureFlipH}
                    onCheckedChange={(v) => s.set("textureFlipH", v)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Flip vertical</Label>
                  <Switch
                    checked={s.textureFlipV}
                    onCheckedChange={(v) => s.set("textureFlipV", v)}
                  />
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="card" className="border-b">
            <SectionTrigger icon={<Layers className="size-3.5" />} title="Card material" />
            <AccordionContent className="space-y-4 px-4 pb-4">
              <NumSlider
                label="Base roughness"
                value={s.cardRoughness}
                min={0}
                max={1}
                onChange={(v) => s.set("cardRoughness", v)}
              />
              <NumSlider
                label="Base metalness"
                value={s.cardMetalness}
                min={0}
                max={1}
                onChange={(v) => s.set("cardMetalness", v)}
              />
              <NumSlider
                label="Normal intensity"
                value={s.cardNormalScale}
                min={0}
                max={3}
                onChange={(v) => s.set("cardNormalScale", v)}
              />
              <NumSlider
                label="Clearcoat"
                value={s.cardClearcoat}
                min={0}
                max={1}
                onChange={(v) => s.set("cardClearcoat", v)}
              />
              <NumSlider
                label="Clearcoat roughness"
                value={s.cardClearcoatRoughness}
                min={0}
                max={1}
                onChange={(v) => s.set("cardClearcoatRoughness", v)}
              />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="glare" className="border-b">
            <SectionTrigger icon={<Sparkles className="size-3.5" />} title="Glare layer" />
            <AccordionContent className="space-y-4 px-4 pb-4">
              <Row label="Mode">
                <ToggleGroup
                  type="single"
                  value={s.glareMode}
                  onValueChange={(v) => v && s.set("glareMode", v as typeof s.glareMode)}
                  className="w-full"
                >
                  <ToggleGroupItem value="off" className="flex-1">
                    Off
                  </ToggleGroupItem>
                  <ToggleGroupItem value="texture" className="flex-1">
                    Texture
                  </ToggleGroupItem>
                  <ToggleGroupItem value="clearcoat" className="flex-1">
                    PBR
                  </ToggleGroupItem>
                </ToggleGroup>
              </Row>
              {s.glareMode === "texture" && (
                <>
                  <NumSlider
                    label="Intensity"
                    value={s.glareIntensity}
                    min={0}
                    max={2}
                    onChange={(v) => s.set("glareIntensity", v)}
                  />
                  <NumSlider
                    label="Band width"
                    value={s.glareWidth}
                    min={0.02}
                    max={1}
                    onChange={(v) => s.set("glareWidth", v)}
                  />
                  <NumSlider
                    label="Softness"
                    value={s.glareSoftness}
                    min={0}
                    max={1}
                    onChange={(v) => s.set("glareSoftness", v)}
                  />
                  <NumSlider
                    label="Rotation"
                    value={s.glareRotation}
                    min={-90}
                    max={90}
                    step={1}
                    onChange={(v) => s.set("glareRotation", v)}
                    format={(v) => `${v.toFixed(0)}°`}
                  />
                </>
              )}
              {s.glareMode === "clearcoat" && (
                <p className="text-xs text-muted-foreground">
                  Physical glare from HDR. Tune via Clearcoat sliders in Card material.
                </p>
              )}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="chip" className="border-b">
            <SectionTrigger icon={<Cpu className="size-3.5" />} title="Chip shader" />
            <AccordionContent className="space-y-4 px-4 pb-4">
              <Row label="Color">
                <div className="flex items-center gap-2">
                  <Input
                    type="color"
                    value={s.chipColor}
                    onChange={(e) => s.set("chipColor", e.target.value)}
                    className="h-8 w-14 p-1"
                  />
                  <Input
                    value={s.chipColor}
                    onChange={(e) => s.set("chipColor", e.target.value)}
                    className="h-8 flex-1 font-mono text-xs"
                  />
                </div>
              </Row>
              <NumSlider
                label="Metalness"
                value={s.chipMetalness}
                min={0}
                max={1}
                onChange={(v) => s.set("chipMetalness", v)}
              />
              <NumSlider
                label="Roughness"
                value={s.chipRoughness}
                min={0}
                max={1}
                onChange={(v) => s.set("chipRoughness", v)}
              />
              <NumSlider
                label="Anisotropy"
                value={s.chipAnisotropy}
                min={0}
                max={1}
                onChange={(v) => s.set("chipAnisotropy", v)}
              />
              <NumSlider
                label="Noise amount"
                value={s.chipNoiseAmount}
                min={0}
                max={1}
                onChange={(v) => s.set("chipNoiseAmount", v)}
              />
              <NumSlider
                label="Noise scale"
                value={s.chipNoiseScale}
                min={4}
                max={64}
                step={1}
                onChange={(v) => s.set("chipNoiseScale", v)}
              />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="logo" className="border-b">
            <SectionTrigger icon={<Sparkles className="size-3.5" />} title="Logo decal" />
            <AccordionContent className="space-y-4 px-4 pb-4">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Show logo</Label>
                <Switch checked={s.showLogo} onCheckedChange={(v) => s.set("showLogo", v)} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Force vertical variant</Label>
                <Switch
                  checked={s.verticalLogo}
                  onCheckedChange={(v) => s.set("verticalLogo", v)}
                />
              </div>
              <Separator />
              <NumSlider
                label="Scale"
                value={s.logoScale}
                min={0.1}
                max={1.6}
                onChange={(v) => s.set("logoScale", v)}
              />
              <NumSlider
                label="Offset X"
                value={s.logoOffsetX}
                min={-1}
                max={1}
                onChange={(v) => s.set("logoOffsetX", v)}
              />
              <NumSlider
                label="Offset Y"
                value={s.logoOffsetY}
                min={-1}
                max={1}
                onChange={(v) => s.set("logoOffsetY", v)}
              />
              <Row label="Tint">
                <div className="flex items-center gap-2">
                  <Input
                    type="color"
                    value={s.logoColor}
                    onChange={(e) => s.set("logoColor", e.target.value)}
                    className="h-8 w-14 p-1"
                  />
                  <Input
                    value={s.logoColor}
                    onChange={(e) => s.set("logoColor", e.target.value)}
                    className="h-8 flex-1 font-mono text-xs"
                  />
                </div>
              </Row>
              <NumSlider
                label="Metalness"
                value={s.logoMetalness}
                min={0}
                max={1}
                onChange={(v) => s.set("logoMetalness", v)}
              />
              <NumSlider
                label="Roughness"
                value={s.logoRoughness}
                min={0}
                max={1}
                onChange={(v) => s.set("logoRoughness", v)}
              />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="env" className="border-b">
            <SectionTrigger icon={<Sun className="size-3.5" />} title="Environment & lighting" />
            <AccordionContent className="space-y-4 px-4 pb-4">
              <Row label="HDR preset">
                <Select
                  value={s.hdrPreset}
                  onValueChange={(v) => s.set("hdrPreset", v as HdrPreset)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(
                      [
                        "studio",
                        "apartment",
                        "city",
                        "dawn",
                        "forest",
                        "lobby",
                        "night",
                        "park",
                        "sunset",
                        "warehouse",
                      ] as HdrPreset[]
                    ).map((p) => (
                      <SelectItem key={p} value={p} className="capitalize">
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Row>
              <NumSlider
                label="Environment intensity"
                value={s.envIntensity}
                min={0}
                max={3}
                onChange={(v) => s.set("envIntensity", v)}
              />
              <NumSlider
                label="Exposure"
                value={s.exposure}
                min={0.2}
                max={3}
                onChange={(v) => s.set("exposure", v)}
              />
              <Row label="Background">
                <Select
                  value={s.backgroundMode}
                  onValueChange={(v) => s.set("backgroundMode", v as typeof s.backgroundMode)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="studio">Studio gradient</SelectItem>
                    <SelectItem value="transparent">Transparent</SelectItem>
                    <SelectItem value="solid">Solid color</SelectItem>
                    <SelectItem value="hdr">Show HDR</SelectItem>
                  </SelectContent>
                </Select>
              </Row>
              {s.backgroundMode === "solid" && (
                <Row label="Background color">
                  <div className="flex items-center gap-2">
                    <Input
                      type="color"
                      value={s.backgroundColor}
                      onChange={(e) => s.set("backgroundColor", e.target.value)}
                      className="h-8 w-14 p-1"
                    />
                    <Input
                      value={s.backgroundColor}
                      onChange={(e) => s.set("backgroundColor", e.target.value)}
                      className="h-8 flex-1 font-mono text-xs"
                    />
                  </div>
                </Row>
              )}
              <Separator />
              <NumSlider
                label="Key light"
                value={s.keyIntensity}
                min={0}
                max={3}
                onChange={(v) => s.set("keyIntensity", v)}
              />
              <NumSlider
                label="Fill light"
                value={s.fillIntensity}
                min={0}
                max={3}
                onChange={(v) => s.set("fillIntensity", v)}
              />
              <NumSlider
                label="Rim light"
                value={s.rimIntensity}
                min={0}
                max={3}
                onChange={(v) => s.set("rimIntensity", v)}
              />
              <div className="h-px bg-border" />
              <p className="text-xs text-muted-foreground">
                Rotate the main light around the card. Affects both the direct highlight and HDR reflections.
              </p>
              <NumSlider
                label="Light azimuth"
                value={s.lightAzimuth}
                min={0}
                max={360}
                step={1}
                onChange={(v) => s.set("lightAzimuth", v)}
              />
              <NumSlider
                label="Light elevation"
                value={s.lightElevation}
                min={0}
                max={89}
                step={1}
                onChange={(v) => s.set("lightElevation", v)}
              />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="capture">
            <SectionTrigger icon={<Download className="size-3.5" />} title="Capture" />
            <AccordionContent className="space-y-4 px-4 pb-6">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Transparent PNG</Label>
                <Switch
                  checked={s.captureTransparent}
                  onCheckedChange={(v) => s.set("captureTransparent", v)}
                />
              </div>
              <Row label="Size">
                <Select
                  value={String(s.captureSize)}
                  onValueChange={(v) => s.set("captureSize", Number(v) as 1024 | 2048 | 4096)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1024">1024 px</SelectItem>
                    <SelectItem value="2048">2048 px</SelectItem>
                    <SelectItem value="4096">4096 px</SelectItem>
                  </SelectContent>
                </Select>
              </Row>
              <Button onClick={onCapture} className="w-full gap-2">
                <Download className="size-4" /> Export PNG
              </Button>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Renders the scene at the selected resolution. The viewport aspect is preserved; for
                transparent output disable &quot;HDR&quot; background mode.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </ScrollArea>
    </aside>
  )
}
