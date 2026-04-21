"use client"

import { Canvas, useThree } from "@react-three/fiber"
import { useEffect } from "react"
import * as THREE from "three"
import { useStudio } from "@/lib/studio-store"
import { CardScene } from "./card-scene"
import { captureScene } from "./capture"

/**
 * R3F canvas host. Exposes `window.__captureCard` so the sidebar button can
 * trigger a PNG export against the current renderer/scene/camera.
 */
export function CardCanvas() {
  const backgroundMode = useStudio((s) => s.backgroundMode)

  return (
    <Canvas
      dpr={[1, 2]}
      gl={{
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
        powerPreference: "high-performance",
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
