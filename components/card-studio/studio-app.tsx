"use client"

import { CardCanvas } from "./card-canvas"
import { CameraTelemetryHUD } from "./camera-telemetry"
import { ControlPanel } from "./control-panel"
import { MobileControlDrawer } from "./mobile-control-drawer"
import { TextureLoadingOverlay } from "./texture-loading-overlay"
import { PresetPreloader } from "./preset-preloader"
import { Toaster } from "@/components/ui/sonner"

export function StudioApp() {
  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background text-foreground">
      {/* Main 3D canvas area — full width on mobile, flex-1 on desktop */}
      <main className="relative flex-1">
        <CardCanvas />
        {/* Status indicator — smaller on mobile, positioned to avoid FAB */}
        <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-full border bg-background/70 px-2 py-1 text-[10px] font-medium text-muted-foreground backdrop-blur md:left-4 md:top-4 md:gap-2 md:px-3 md:py-1.5 md:text-xs">
          <span className="inline-block size-1.5 rounded-full bg-emerald-500" />
          <span className="hidden sm:inline">Studio running</span>
          <span className="sm:hidden">Live</span>
        </div>
        <TextureLoadingOverlay />
        {/* Camera telemetry hidden on mobile to reduce clutter */}
        <div className="hidden md:block">
          <CameraTelemetryHUD />
        </div>
      </main>

      {/* Desktop sidebar — hidden on mobile (md:flex via the component) */}
      <ControlPanel />

      {/* Mobile bottom drawer + FAB — hidden on desktop (md:hidden via the component) */}
      <MobileControlDrawer />

      <PresetPreloader />
      <Toaster position="bottom-left" richColors />
    </div>
  )
}
