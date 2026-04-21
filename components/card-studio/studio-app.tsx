"use client"

import { CardCanvas } from "./card-canvas"
import { CameraTelemetryHUD } from "./camera-telemetry"
import { ControlPanel } from "./control-panel"
import { Toaster } from "@/components/ui/sonner"

export function StudioApp() {
  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background text-foreground">
      <main className="relative flex-1">
        <CardCanvas />
        <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2 rounded-full border bg-background/70 px-3 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur">
          <span className="inline-block size-1.5 rounded-full bg-emerald-500" />
          Studio running
        </div>
        <CameraTelemetryHUD />
      </main>
      <ControlPanel />
      <Toaster position="bottom-left" richColors />
    </div>
  )
}
