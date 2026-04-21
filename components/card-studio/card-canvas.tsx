"use client"

import { Canvas } from "@react-three/fiber"
import { useEffect, useRef } from "react"
import * as THREE from "three"
import { useStudio } from "@/lib/studio-store"
import { CardScene } from "./card-scene"
import { captureScene } from "./capture"

/**
 * The R3F canvas. Exposes a `captureRef` which the control panel can call
 * via window-level imperative handle to trigger a PNG export.
 */
export function CardCanvas() {
  const exposure = useStudio((s) => s.exposure)
  const backgroundMode = useStudio((s) => s.backgroundMode)
  const glRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.Camera | null>(null)

  // Expose capture function on window for the sidebar button
  useEffect(() => {
    ;(window as unknown as { __captureCard?: () => void }).__captureCard = () => {
      const { captureTransparent, captureSize } = useStudio.getState()
      if (!glRef.current || !sceneRef.current || !cameraRef.current) return
      captureScene(glRef.current, sceneRef.current, cameraRef.current, {
        transparent: captureTransparent,
        size: captureSize,
      })
    }
    return () => {
      delete (window as unknown as { __captureCard?: () => void }).__captureCard
    }
  }, [])

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
        powerPreference: "high-performance",
      }}
      camera={{ position: [1.7, 1.2, 2.6], fov: 30 }}
      style={{
        background:
          backgroundMode === "transparent"
            ? "transparent"
            : backgroundMode === "studio"
              ? "radial-gradient(ellipse at center, oklch(0.22 0 0) 0%, oklch(0.1 0 0) 70%)"
              : undefined,
      }}
      onCreated={({ gl, scene, camera }) => {
        glRef.current = gl
        sceneRef.current = scene
        cameraRef.current = camera
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = exposure
      }}
    >
      <ToneMappingUpdater />
      <CardScene />
    </Canvas>
  )
}

function ToneMappingUpdater() {
  const exposure = useStudio((s) => s.exposure)
  // Access renderer via three-fiber context
  // Using useThree would add dependency; we update via scene graph effect
  // The onCreated handler sets the initial value; this hook keeps it synced
  const { gl } = useThreeRenderer()
  useEffect(() => {
    if (gl) gl.toneMappingExposure = exposure
  }, [gl, exposure])
  return null
}

// Tiny inline hook to avoid an extra file
import { useThree } from "@react-three/fiber"
function useThreeRenderer() {
  const gl = useThree((s) => s.gl)
  return { gl }
}
