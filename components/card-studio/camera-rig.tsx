"use client"

import { useRef, useEffect } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"
import { useStudio, type ViewId } from "@/lib/studio-store"

/**
 * Per-view camera positioning. `fov` is used in perspective mode,
 * `zoom` is used in orthographic mode so the card stays a similar size.
 */
/** Convert a vertical FOV (degrees) to a 35mm-equivalent focal length (mm). */
function focalFromFov(fovDeg: number): number {
  const FILM_GAUGE = 35
  const fovRad = (fovDeg * Math.PI) / 180
  return FILM_GAUGE / 2 / Math.tan(fovRad / 2)
}

export const VIEWS: Record<ViewId, { pos: [number, number, number]; fov: number; zoom: number }> = {
  front: { pos: [0, 0, 3.2], fov: 28, zoom: 420 },
  back: { pos: [0, 0, -3.2], fov: 28, zoom: 420 },
  threeQuarterFront: { pos: [1.7, 1.2, 2.6], fov: 30, zoom: 400 },
  threeQuarterBack: { pos: [-1.7, 1.2, -2.6], fov: 30, zoom: 400 },
  top: { pos: [0, 3.4, 0.01], fov: 32, zoom: 400 },
  side: { pos: [3.4, 0, 0], fov: 28, zoom: 420 },
  // Low-angle, sharp-oblique marketing shot (SberBank-style hero render):
  // camera is almost on the card's plane (tiny Y), heavily to the side (large X)
  // and only slightly in front (small Z), so the long edge recedes deep into frame.
  // Narrow FOV (~20°) mimics a ~100mm lens — compresses perspective without
  // wide-angle distortion and keeps the card readable at this oblique angle.
  hero: { pos: [3.1, 0.28, 0.85], fov: 20, zoom: 560 },
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
  const focalLength = useStudio((s) => s.focalLength)
  const { camera } = useThree()
  const desiredPos = useRef(new THREE.Vector3())
  const desiredLookAt = useRef(new THREE.Vector3())

  useEffect(() => {
    const v = VIEWS[viewId]
    desiredLookAt.current.copy(target)
    const persp = camera as THREE.PerspectiveCamera
    const ortho = camera as THREE.OrthographicCamera

    // Baseline authored distance for this view (used as reference so the card stays
    // the same screen-size at the reference focal length).
    const refFocal = focalFromFov(v.fov)
    const distanceScale = focalLength / refFocal

    desiredPos.current.set(
      v.pos[0] * distanceScale,
      v.pos[1] * distanceScale,
      v.pos[2] * distanceScale,
    )

    if ((persp as unknown as { isPerspectiveCamera?: boolean }).isPerspectiveCamera) {
      persp.setFocalLength(focalLength)
    }
    if ((ortho as unknown as { isOrthographicCamera?: boolean }).isOrthographicCamera) {
      ortho.zoom = v.zoom
      ortho.updateProjectionMatrix()
    }
  }, [viewId, target, camera, projection, focalLength])

  useFrame((_, dt) => {
    if (!enabled) return
    const t = Math.min(1, dt * 4)
    camera.position.lerp(desiredPos.current, t)
    camera.lookAt(desiredLookAt.current)
  })

  return null
}
