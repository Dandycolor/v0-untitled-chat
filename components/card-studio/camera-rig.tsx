"use client"

import { useRef, useEffect } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"
import { useStudio, type ViewId } from "@/lib/studio-store"

/**
 * Per-view camera positioning. `fov` is used in perspective mode,
 * `zoom` is used in orthographic mode so the card stays a similar size.
 */
export const VIEWS: Record<ViewId, { pos: [number, number, number]; fov: number; zoom: number }> = {
  front: { pos: [0, 0, 3.2], fov: 28, zoom: 420 },
  back: { pos: [0, 0, -3.2], fov: 28, zoom: 420 },
  threeQuarterFront: { pos: [1.7, 1.2, 2.6], fov: 30, zoom: 400 },
  threeQuarterBack: { pos: [-1.7, 1.2, -2.6], fov: 30, zoom: 400 },
  top: { pos: [0, 3.4, 0.01], fov: 32, zoom: 400 },
  side: { pos: [3.4, 0, 0], fov: 28, zoom: 420 },
}

export function CameraRig({
  target,
  enabled,
}: {
  target: THREE.Vector3
  enabled: boolean
}) {
  const viewId = useStudio((s) => s.viewId)
  const projection = useStudio((s) => s.projection)
  const { camera } = useThree()
  const desiredPos = useRef(new THREE.Vector3())
  const desiredLookAt = useRef(new THREE.Vector3())

  useEffect(() => {
    const v = VIEWS[viewId]
    desiredPos.current.set(...v.pos)
    desiredLookAt.current.copy(target)
    const persp = camera as THREE.PerspectiveCamera
    const ortho = camera as THREE.OrthographicCamera
    if ((persp as unknown as { isPerspectiveCamera?: boolean }).isPerspectiveCamera) {
      persp.fov = v.fov
      persp.updateProjectionMatrix()
    }
    if ((ortho as unknown as { isOrthographicCamera?: boolean }).isOrthographicCamera) {
      ortho.zoom = v.zoom
      ortho.updateProjectionMatrix()
    }
  }, [viewId, target, camera, projection])

  useFrame((_, dt) => {
    if (!enabled) return
    const t = Math.min(1, dt * 4)
    camera.position.lerp(desiredPos.current, t)
    camera.lookAt(desiredLookAt.current)
  })

  return null
}
