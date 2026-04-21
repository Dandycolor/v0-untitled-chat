"use client"

import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import { Environment, OrbitControls, ContactShadows } from "@react-three/drei"
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib"
import { useStudio } from "@/lib/studio-store"
import { CardModel } from "./card-model"
import { CameraRig } from "./camera-rig"
import { GlareLayer } from "./glare-layer"

export function CardScene() {
  const hdrPreset = useStudio((s) => s.hdrPreset)
  const envIntensity = useStudio((s) => s.envIntensity)
  const backgroundMode = useStudio((s) => s.backgroundMode)
  const keyIntensity = useStudio((s) => s.keyIntensity)
  const fillIntensity = useStudio((s) => s.fillIntensity)
  const rimIntensity = useStudio((s) => s.rimIntensity)
  const viewId = useStudio((s) => s.viewId)
  const autoRotate = useStudio((s) => s.autoRotate)
  const glareMode = useStudio((s) => s.glareMode)

  // Camera rig enabled briefly when view changes; user orbit disables it
  const [rigEnabled, setRigEnabled] = useState(true)
  const rigTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    setRigEnabled(true)
    if (rigTimer.current) clearTimeout(rigTimer.current)
    rigTimer.current = setTimeout(() => setRigEnabled(false), 1200)
    return () => {
      if (rigTimer.current) clearTimeout(rigTimer.current)
    }
  }, [viewId])

  const target = useMemo(() => new THREE.Vector3(0, 0, 0), [])

  // Approx card dims for glare plane sizing (visible card ~= 1.6 x 1.0 units)
  const glareW = 1.9
  const glareH = 1.25

  const controlsRef = useRef<OrbitControlsImpl>(null)

  return (
    <>
      {backgroundMode === "hdr" && (
        <Environment preset={hdrPreset} background environmentIntensity={envIntensity} />
      )}
      {backgroundMode !== "hdr" && (
        <Environment preset={hdrPreset} environmentIntensity={envIntensity} />
      )}

      {backgroundMode === "solid" && <SolidBackground />}

      {/* Three-point studio rig in addition to IBL */}
      <directionalLight position={[5, 6, 4]} intensity={keyIntensity} castShadow />
      <directionalLight position={[-4, 2, 3]} intensity={fillIntensity} />
      <directionalLight position={[0, 2, -5]} intensity={rimIntensity} color={"#b8d0ff"} />
      <ambientLight intensity={0.08} />

      <Suspense fallback={null}>
        <group>
          <CardModel />
          <GlareLayer
            width={glareW}
            height={glareH}
            position={[0, 0, 0.06]}
            rotation={[0, 0, 0]}
          />
          {/* Back side glare, when texture mode enabled */}
          {glareMode === "texture" && (
            <group rotation={[0, Math.PI, 0]}>
              <GlareLayer
                width={glareW}
                height={glareH}
                position={[0, 0, 0.06]}
                rotation={[0, 0, 0]}
              />
            </group>
          )}
        </group>
      </Suspense>

      <ContactShadows
        position={[0, -0.55, 0]}
        opacity={0.45}
        scale={6}
        blur={2.5}
        far={2}
        resolution={1024}
      />

      <CameraRig target={target} enabled={rigEnabled} />

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        enablePan={false}
        minDistance={1.5}
        maxDistance={6}
        autoRotate={autoRotate}
        autoRotateSpeed={0.6}
        onStart={() => setRigEnabled(false)}
      />
    </>
  )
}

function SolidBackground() {
  const color = useStudio((s) => s.backgroundColor)
  return <color attach="background" args={[color]} />
}
