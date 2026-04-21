"use client"

import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import * as THREE from "three"
import {
  Environment,
  Lightformer,
  OrbitControls,
  ContactShadows,
  PerspectiveCamera,
  OrthographicCamera,
} from "@react-three/drei"
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib"
import { useStudio } from "@/lib/studio-store"
import { CardModel } from "./card-model"
import { CameraRig, VIEWS } from "./camera-rig"
import { GlareLayer } from "./glare-layer"

/**
 * Scene contents live here. The environment is built from <Lightformer> meshes
 * into a small cubemap (no external HDR download), so the viewer always works
 * even without network access to HDRI CDNs.
 */
export function CardScene() {
  const envIntensity = useStudio((s) => s.envIntensity)
  const backgroundMode = useStudio((s) => s.backgroundMode)
  const hdrPreset = useStudio((s) => s.hdrPreset)
  const keyIntensity = useStudio((s) => s.keyIntensity)
  const keyColor = useStudio((s) => s.keyColor)
  const fillIntensity = useStudio((s) => s.fillIntensity)
  const rimIntensity = useStudio((s) => s.rimIntensity)
  const lightAzimuth = useStudio((s) => s.lightAzimuth)
  const lightElevation = useStudio((s) => s.lightElevation)
  const orientation = useStudio((s) => s.orientation)

  // Compute key light position from azimuth/elevation so the user can rotate the highlight
  // around the card. We also rotate the HDR environment by the same azimuth so PBR reflections
  // (clearcoat glare) follow the key light.
  const keyPos = useMemo<[number, number, number]>(() => {
    const az = (lightAzimuth * Math.PI) / 180
    const el = (lightElevation * Math.PI) / 180
    const r = 8
    const y = r * Math.sin(el)
    const rh = r * Math.cos(el)
    const x = rh * Math.sin(az)
    const z = rh * Math.cos(az)
    return [x, y, z]
  }, [lightAzimuth, lightElevation])

  const fillPos = useMemo<[number, number, number]>(() => {
    // Fill light sits ~120° away from the key on the opposite side, slightly lower.
    const az = ((lightAzimuth + 140) * Math.PI) / 180
    const el = Math.max(0.15, (lightElevation - 10) * (Math.PI / 180))
    const r = 7
    const y = r * Math.sin(el)
    const rh = r * Math.cos(el)
    return [rh * Math.sin(az), y, rh * Math.cos(az)]
  }, [lightAzimuth, lightElevation])

  const rimPos = useMemo<[number, number, number]>(() => {
    // Rim light is opposite the camera/key, higher up, to outline silhouette.
    const az = ((lightAzimuth + 180) * Math.PI) / 180
    const el = (Math.min(80, lightElevation + 20) * Math.PI) / 180
    const r = 7
    const y = r * Math.sin(el)
    const rh = r * Math.cos(el)
    return [rh * Math.sin(az), y, rh * Math.cos(az)]
  }, [lightAzimuth, lightElevation])

  const envRotationY = (lightAzimuth * Math.PI) / 180
  const viewId = useStudio((s) => s.viewId)
  const autoRotate = useStudio((s) => s.autoRotate)
  const glareMode = useStudio((s) => s.glareMode)
  const projection = useStudio((s) => s.projection)
  const focalLength = useStudio((s) => s.focalLength)
  const initialView = VIEWS[viewId]

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

  // Live dolly-zoom: when the user drags the focal slider, pull the camera along its
  // current view direction so the subject stays the same size, but perspective
  // distortion changes. This runs every time focalLength (or view) changes, so it
  // works even after OrbitControls has taken over the camera.
  useEffect(() => {
    if (projection !== "perspective") return
    const controls = controlsRef.current
    if (!controls) return
    const cam = controls.object as THREE.PerspectiveCamera
    if (!cam.isPerspectiveCamera) return

    const view = VIEWS[viewId]
    const refFocal = (() => {
      const fovRad = (view.fov * Math.PI) / 180
      return 35 / 2 / Math.tan(fovRad / 2)
    })()
    // Baseline distance = length of the authored position vector (controls.target is origin).
    const baseDistance = Math.hypot(view.pos[0], view.pos[1], view.pos[2])
    const desiredDistance = baseDistance * (focalLength / refFocal)

    const offset = new THREE.Vector3().subVectors(cam.position, controls.target)
    const currentDistance = offset.length() || 1
    offset.multiplyScalar(desiredDistance / currentDistance)
    cam.position.copy(controls.target).add(offset)
    cam.setFocalLength(focalLength)
    controls.update()
  }, [focalLength, viewId, projection])

  // Card body is normalized in CardModel so the long side = 1.6 world units.
  // ISO/IEC 7810 ID-1 aspect is 85.6/53.98 ≈ 1.586, which gives a short side of ~1.009.
  // In vertical orientation CardModel rotates the mesh 90° around Z, so width/height swap.
  // Fit the glare plane exactly to these dimensions so it never extends past the card silhouette.
  const glareLong = 1.6
  const glareShort = 1.6 / (85.6 / 53.98)
  const glareW = orientation === "vertical" ? glareShort : glareLong
  const glareH = orientation === "vertical" ? glareLong : glareShort

  return (
    <>
      <PerspectiveCamera
        makeDefault={projection === "perspective"}
        position={initialView.pos}
        fov={initialView.fov}
        near={0.1}
        far={100}
      />
      <OrthographicCamera
        makeDefault={projection === "orthographic"}
        position={initialView.pos}
        zoom={initialView.zoom}
        near={0.1}
        far={100}
      />

      {hdrPreset === "studio" ? (
        <StudioEnvironment
          envIntensity={envIntensity}
          envRotationY={envRotationY}
          background={backgroundMode === "hdr"}
        />
      ) : (
        // Built-in drei HDR presets are downloaded from a CDN. Wrap in Suspense so the
        // tree doesn't block the whole <Canvas> while the HDR streams in, and in an
        // ErrorBoundary so a CDN failure falls back to the built-in studio rig instead
        // of killing the WebGL context.
        <EnvironmentErrorBoundary
          fallback={
            <StudioEnvironment
              envIntensity={envIntensity}
              envRotationY={envRotationY}
              background={backgroundMode === "hdr"}
            />
          }
        >
          <Suspense
            fallback={
              <StudioEnvironment
                envIntensity={envIntensity}
                envRotationY={envRotationY}
                background={backgroundMode === "hdr"}
              />
            }
          >
            <Environment
              key={hdrPreset}
              preset={hdrPreset}
              environmentIntensity={envIntensity}
              environmentRotation={[0, envRotationY, 0]}
              backgroundRotation={[0, envRotationY, 0]}
              background={backgroundMode === "hdr"}
            />
          </Suspense>
        </EnvironmentErrorBoundary>
      )}

      {backgroundMode === "solid" && <SolidBackground />}

      <directionalLight position={keyPos} intensity={keyIntensity} color={keyColor} />
      <directionalLight position={fillPos} intensity={fillIntensity} />
      <directionalLight position={rimPos} intensity={rimIntensity} color={"#b8d0ff"} />
      <ambientLight intensity={0.12} />

      <Suspense fallback={null}>
        <group>
          <CardModel />
          {/*
            Glare sits right on top of the card's front face. The card's half-thickness
            after normalization is ~0.007, so a 0.0015 offset is visually coplanar;
            polygonOffset inside GlareLayer prevents z-fighting with the PBR surface.
          */}
          <GlareLayer
            width={glareW}
            height={glareH}
            position={[0, 0, 0.0015]}
            rotation={[0, 0, 0]}
          />
          {glareMode === "texture" && (
            <group rotation={[0, Math.PI, 0]}>
              <GlareLayer
                width={glareW}
                height={glareH}
                position={[0, 0, 0.0015]}
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
        minDistance={0.35}
        maxDistance={14}
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

/**
 * Custom studio lighting rig built from Lightformers — no external HDR download.
 * Used as the "studio" preset and as the Suspense/ErrorBoundary fallback for CDN
 * presets when they can't be reached.
 */
function StudioEnvironment({
  envIntensity,
  envRotationY,
  background,
}: {
  envIntensity: number
  envRotationY: number
  background: boolean
}) {
  return (
    <Environment
      frames={1}
      resolution={256}
      environmentIntensity={envIntensity}
      environmentRotation={[0, envRotationY, 0]}
      backgroundRotation={[0, envRotationY, 0]}
      background={background}
    >
      <color attach="background" args={["#1a1a1a"]} />
      <Lightformer intensity={2.4} position={[4, 5, 3]} scale={[6, 3, 1]} color="#ffffff" />
      <Lightformer intensity={1.2} position={[-5, 3, 2]} scale={[4, 4, 1]} color="#cfe3ff" />
      <Lightformer intensity={0.9} position={[0, -3, 4]} scale={[5, 2, 1]} color="#ffe6c8" />
      <Lightformer intensity={1.6} position={[0, 4, -4]} scale={[5, 2, 1]} color="#e3d8ff" />
    </Environment>
  )
}

/**
 * Scene-internal error boundary. If the drei HDR preset fails to load (network
 * error, CDN 404), we render the provided fallback instead of letting the error
 * unwind past <Canvas> and destroy the WebGL context.
 */
class EnvironmentErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  componentDidCatch(err: unknown) {
    console.warn("[v0] HDR preset failed, using studio fallback:", err)
  }
  // Reset error state when the preset (children) changes so a new pick gets a fresh try.
  componentDidUpdate(prev: { children: ReactNode }) {
    if (this.state.hasError && prev.children !== this.props.children) {
      this.setState({ hasError: false })
    }
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children
  }
}
