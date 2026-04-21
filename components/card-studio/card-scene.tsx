"use client"

import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import { Environment, Lightformer, OrbitControls, ContactShadows } from "@react-three/drei"
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib"
import { useStudio } from "@/lib/studio-store"
import { CardModel } from "./card-model"
import { CameraRig } from "./camera-rig"
import { GlareLayer } from "./glare-layer"

/**
 * Scene contents live here. The environment is built from <Lightformer> meshes
 * into a small cubemap (no external HDR download), so the viewer always works
 * even without network access to HDRI CDNs.
 */
export function CardScene() {
  const envIntensity = useStudio((s) => s.envIntensity)
  const backgroundMode = useStudio((s) => s.backgroundMode)
  const keyIntensity = useStudio((s) => s.keyIntensity)
  const fillIntensity = useStudio((s) => s.fillIntensity)
  const rimIntensity = useStudio((s) => s.rimIntensity)
  const viewId = useStudio((s) => s.viewId)
  const autoRotate = useStudio((s) => s.autoRotate)
  const glareMode = useStudio((s) => s.glareMode)

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
  const controlsRef = useRef<OrbitControlsImpl>(null)

  const glareW = 1.9
  const glareH = 1.25

  return (
    <>
      <Environment
        frames={1}
        resolution={256}
        environmentIntensity={envIntensity}
        background={backgroundMode === "hdr"}
      >
        <color attach="background" args={["#1a1a1a"]} />
        <Lightformer intensity={2.4} position={[4, 5, 3]} scale={[6, 3, 1]} color="#ffffff" />
        <Lightformer intensity={1.2} position={[-5, 3, 2]} scale={[4, 4, 1]} color="#cfe3ff" />
        <Lightformer intensity={0.9} position={[0, -3, 4]} scale={[5, 2, 1]} color="#ffe6c8" />
        <Lightformer intensity={1.6} position={[0, 4, -4]} scale={[5, 2, 1]} color="#e3d8ff" />
      </Environment>

      {backgroundMode === "solid" && <SolidBackground />}

      <directionalLight position={[5, 6, 4]} intensity={keyIntensity} />
      <directionalLight position={[-4, 2, 3]} intensity={fillIntensity} />
      <directionalLight position={[0, 2, -5]} intensity={rimIntensity} color={"#b8d0ff"} />
      <ambientLight intensity={0.12} />

      <Suspense fallback={null}>
        <group>
          <CardModel />
          <GlareLayer
            width={glareW}
            height={glareH}
            position={[0, 0, 0.06]}
            rotation={[0, 0, 0]}
          />
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
        position={[0, -0.6, 0]}
        opacity={0.4}
        scale={6}
        blur={2.8}
        far={2}
        resolution={512}
      />

      <CameraRig target={target} enabled={rigEnabled} />

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        enablePan={false}
        minDistance={1.2}
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
