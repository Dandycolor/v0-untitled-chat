"use client"

import { Canvas, useThree } from "@react-three/fiber"
import { useEffect, useRef } from "react"
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
  const glRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.Camera | null>(null)

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
      dpr={[1, 2]}
      gl={{
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
        powerPreference: "high-performance",
      }}
      camera={{ position: [1.8, 1.3, 2.8], fov: 28 }}
      style={{
        background:
          backgroundMode === "transparent"
            ? "transparent"
            : backgroundMode === "studio"
              ? "radial-gradient(ellipse at center, oklch(0.22 0 0) 0%, oklch(0.08 0 0) 70%)"
              : undefined,
      }}
      onCreated={({ gl, scene, camera }) => {
        glRef.current = gl
        sceneRef.current = scene
        cameraRef.current = camera
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = useStudio.getState().exposure
      }}
    >
      <ToneMappingUpdater glRef={glRef} />
      <CardScene />
    </Canvas>
  )
}

function ToneMappingUpdater({ glRef }: { glRef: React.MutableRefObject<THREE.WebGLRenderer | null> }) {
  const exposure = useStudio((s) => s.exposure)
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    if (glRef.current !== gl) glRef.current = gl
    gl.toneMappingExposure = exposure
  }, [gl, exposure, glRef])
  return null
}
