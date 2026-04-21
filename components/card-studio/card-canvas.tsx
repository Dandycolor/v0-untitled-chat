"use client"

import { Canvas, useThree } from "@react-three/fiber"
import { useEffect } from "react"
import * as THREE from "three"
import { useStudio } from "@/lib/studio-store"
import { CardScene } from "./card-scene"
import { CameraTelemetryBinding } from "./camera-telemetry"
import { captureScene } from "./capture"

/**
 * R3F canvas host. Exposes `window.__captureCard` so the sidebar button can
 * trigger a PNG export against the current renderer/scene/camera.
 */
export function CardCanvas() {
  const backgroundMode = useStudio((s) => s.backgroundMode)

  return (
    <Canvas
      // Allow up to 3x DPR so aliasing is reduced on high-DPI displays; the min stays at 1.
      dpr={[1, 3]}
      // R3F-level MSAA on its internal WebGL2 multisample render target.
      // 8 samples gives smooth silhouette edges on the card's rounded corners and
      // logo/chip outlines with modest GPU cost. This replaces the postprocessing
      // SMAA pass which was incompatible with React 19 / R3F 9.
      gl={{
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
        powerPreference: "high-performance",
        samples: 8,
      }}
      style={{
        background:
          backgroundMode === "transparent"
            ? "transparent"
            : backgroundMode === "studio"
              ? "radial-gradient(ellipse at center, oklch(0.22 0 0) 0%, oklch(0.08 0 0) 70%)"
              : undefined,
      }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = useStudio.getState().exposure
      }}
    >
      <ToneMappingBinding />
      <CaptureBinding />
      <CameraTelemetryBinding />
      <CardScene />
    </Canvas>
  )
}

/** Keeps renderer exposure synced with the store. */
function ToneMappingBinding() {
  const gl = useThree((s) => s.gl)
  const exposure = useStudio((s) => s.exposure)
  useEffect(() => {
    gl.toneMappingExposure = exposure
  }, [gl, exposure])
  return null
}

/** Wires the capture function to window so the sidebar button can call it. */
function CaptureBinding() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    const w = window as unknown as { __captureCard?: () => void }
    w.__captureCard = () => {
      const { captureTransparent, captureSize } = useStudio.getState()
      captureScene(gl, scene, camera, {
        transparent: captureTransparent,
        size: captureSize,
      })
    }
    return () => {
      delete w.__captureCard
    }
  }, [gl, scene, camera])
  return null
}
