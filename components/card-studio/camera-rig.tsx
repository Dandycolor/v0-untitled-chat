"use client"

import { useRef, useEffect } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"
import { useStudio, type ViewId } from "@/lib/studio-store"

/**
 * Animated camera positioning based on the currently selected view preset.
 * The rig lerps the camera position + a look-at target every frame toward
 * the active view when the user is not orbiting manually.
 */
const VIEWS: Record<ViewId, { pos: [number, number, number]; fov: number }> = {
  front: { pos: [0, 0, 3.2], fov: 28 },
  back: { pos: [0, 0, -3.2], fov: 28 },
  threeQuarterFront: { pos: [1.7, 1.2, 2.6], fov: 30 },
  threeQuarterBack: { pos: [-1.7, 1.2, -2.6], fov: 30 },
  top: { pos: [0, 3.4, 0.01], fov: 32 },
  side: { pos: [3.4, 0, 0], fov: 28 },
}

export function CameraRig({
  target,
  enabled,
}: {
  target: THREE.Vector3
  enabled: boolean
}) {
  const viewId = useStudio((s) => s.viewId)
  const { camera } = useThree()
  const desiredPos = useRef(new THREE.Vector3())
  const desiredLookAt = useRef(new THREE.Vector3())

  useEffect(() => {
    const v = VIEWS[viewId]
    desiredPos.current.set(...v.pos)
    desiredLookAt.current.copy(target)
    if ("fov" in camera) {
      ;(camera as THREE.PerspectiveCamera).fov = v.fov
      ;(camera as THREE.PerspectiveCamera).updateProjectionMatrix()
    }
  }, [viewId, target, camera])

  useFrame((_, dt) => {
    if (!enabled) return
    const t = Math.min(1, dt * 4)
    camera.position.lerp(desiredPos.current, t)
    camera.lookAt(desiredLookAt.current)
  })

  return null
}
