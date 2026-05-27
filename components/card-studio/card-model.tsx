"use client"

import { useEffect, useMemo } from "react"
import * as THREE from "three"
import { useGLTF } from "@react-three/drei"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import { useStudio, type CardModelId } from "@/lib/studio-store"
import { useTwoSidedPhysicalMaterial } from "./materials/use-two-sided-material"
import { useChipMaterial } from "./materials/chip-material"
import { useLogoTexture } from "./logo-decal"

const MODEL_URLS: Record<CardModelId, string> = {
  card_no_chip: "/models/card_no_chip.glb",
  card_chip1: "/models/card_chip1.glb",
  card_chip2: "/models/card_chip2.glb",
  card_chip3: "/models/card_chip3.glb",
}

Object.values(MODEL_URLS).forEach((u) => useGLTF.preload(u))

type AnalyzedMesh = {
  mesh: THREE.Mesh
  volume: number
  bbox: THREE.Box3
  size: THREE.Vector3
  role: "body" | "chip" | "other"
}

function ensurePlanarUv(mesh: THREE.Mesh, sideAxis: 0 | 1 | 2, flipU = false) {
  const geo = mesh.geometry
  geo.computeBoundingBox()
  const bbox = geo.boundingBox!
  const size = new THREE.Vector3()
  bbox.getSize(size)
  const axes = [0, 1, 2].filter((i) => i !== sideAxis) as [number, number]
  const pos = geo.attributes.position
  if (!pos) return
  const u = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) {
    const a0 =
      (pos.getComponent(i, axes[0]) - bbox.min.getComponent(axes[0])) / (size.getComponent(axes[0]) || 1)
    const a1 =
      (pos.getComponent(i, axes[1]) - bbox.min.getComponent(axes[1])) / (size.getComponent(axes[1]) || 1)
    u[i * 2] = flipU ? 1 - a0 : a0
    u[i * 2 + 1] = a1
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(u, 2))
  geo.setAttribute("uv1", new THREE.BufferAttribute(u, 2))
}

function analyzeMeshes(root: THREE.Object3D): { analyzed: AnalyzedMesh[]; sideAxis: 0 | 1 | 2 } {
  const meshes: THREE.Mesh[] = []
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh)
  })

  const entries: AnalyzedMesh[] = meshes.map((m) => {
    m.geometry.computeBoundingBox()
    const bbox = m.geometry.boundingBox!.clone()
    const rel = new THREE.Matrix4().copy(m.matrixWorld)
    if (root.matrixWorld) {
      const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert()
      rel.premultiply(rootInv)
    }
    bbox.applyMatrix4(rel)
    const size = new THREE.Vector3()
    bbox.getSize(size)
    const volume = Math.max(size.x * size.y * size.z, 1e-8)
    return { mesh: m, volume, bbox, size, role: "other" }
  })

  if (entries.length === 0) return { analyzed: [], sideAxis: 2 }

  const body = entries.reduce((best, cur) => (cur.volume > best.volume ? cur : best), entries[0])
  body.role = "body"

  const s = body.size
  let sideAxis: 0 | 1 | 2 = 2
  if (s.x <= s.y && s.x <= s.z) sideAxis = 0
  else if (s.y <= s.x && s.y <= s.z) sideAxis = 1
  else sideAxis = 2

  // Compute footprint area (in the plane perpendicular to sideAxis)
  const planeAxes = [0, 1, 2].filter((i) => i !== sideAxis) as [number, number]
  const bodyFootprint =
    body.size.getComponent(planeAxes[0]) * body.size.getComponent(planeAxes[1])

  for (const e of entries) {
    if (e === body) continue
    const eFootprint =
      e.size.getComponent(planeAxes[0]) * e.size.getComponent(planeAxes[1])
    const footprintRatio = eFootprint / Math.max(bodyFootprint, 1e-8)
    const withinFootprint = body.bbox.containsBox(e.bbox) || body.bbox.intersectsBox(e.bbox)

    if (footprintRatio < 0.4 && withinFootprint) {
      // Small footprint relative to body → real chip (gold contact pad)
      e.role = "chip"
    } else if (footprintRatio >= 0.4 && withinFootprint) {
      // Similar footprint to body → back-face plane (separate mesh covering the back)
      // Treat as body so it gets the card material.
      // flipU=true mirrors the U coordinate so the back texture reads correctly
      // when viewed from behind (the back mesh's normal points opposite to body's).
      e.role = "body"
      ensurePlanarUv(e.mesh, sideAxis, true)
    }
  }

  ensurePlanarUv(body.mesh, sideAxis)

  return { analyzed: entries, sideAxis }
}

export function CardModel() {
  const modelId = useStudio((s) => s.modelId)
  const orientation = useStudio((s) => s.orientation)
  const frontPbr = useStudio((s) => s.frontPbr)
  const backPbr = useStudio((s) => s.backPbr)
  const backColor = useStudio((s) => s.backColor)
  const backTemplate = useStudio((s) => s.backTemplate)
  const activePresetType = useStudio((s) => s.activePresetType)
  const textureFlipH = useStudio((s) => s.textureFlipH)
  const textureFlipV = useStudio((s) => s.textureFlipV)
  const cardRoughness = useStudio((s) => s.cardRoughness)
  const cardMetalness = useStudio((s) => s.cardMetalness)
  const cardNormalScale = useStudio((s) => s.cardNormalScale)
  const cardClearcoat = useStudio((s) => s.cardClearcoat)
  const cardClearcoatRoughness = useStudio((s) => s.cardClearcoatRoughness)
  const cardEdgeColor = useStudio((s) => s.cardEdgeColor)
  const cardEdgeTint = useStudio((s) => s.cardEdgeTint)
  const chipColor = useStudio((s) => s.chipColor)
  const chipMetalness = useStudio((s) => s.chipMetalness)
  const chipRoughness = useStudio((s) => s.chipRoughness)
  const chipAnisotropy = useStudio((s) => s.chipAnisotropy)
  const chipNoiseAmount = useStudio((s) => s.chipNoiseAmount)
  const chipNoiseScale = useStudio((s) => s.chipNoiseScale)
  const showLogo = useStudio((s) => s.showLogo)
  const logoScale = useStudio((s) => s.logoScale)
  const logoOffsetX = useStudio((s) => s.logoOffsetX)
  const logoOffsetY = useStudio((s) => s.logoOffsetY)
  const logoColor = useStudio((s) => s.logoColor)
  const logoMetalness = useStudio((s) => s.logoMetalness)
  const logoRoughness = useStudio((s) => s.logoRoughness)

  const gltf = useGLTF(MODEL_URLS[modelId], undefined, undefined, (loader) => {
    ;(loader as unknown as GLTFLoader).setCrossOrigin("anonymous")
  })

  const { analyzed, sideAxis, bodyMesh, bodyBBox, bodyCenter, normScale, normOffset } = useMemo(() => {
    gltf.scene.updateMatrixWorld(true)
    const { analyzed, sideAxis } = analyzeMeshes(gltf.scene)
    const body = analyzed.find((a) => a.role === "body")
    const bbox = body?.bbox ?? new THREE.Box3().setFromObject(gltf.scene)
    const center = bbox.getCenter(new THREE.Vector3())
    const size = bbox.getSize(new THREE.Vector3())
    const maxSide = Math.max(size.x, size.y, size.z) || 1
    const TARGET = 1.6
    const scale = TARGET / maxSide
    const offset = center.clone().multiplyScalar(-1)
    return {
      analyzed,
      sideAxis,
      bodyMesh: body?.mesh,
      bodyBBox: bbox,
      bodyCenter: center,
      normScale: scale,
      normOffset: offset.toArray() as [number, number, number],
    }
  }, [gltf.scene])

  const cardMaterial = useTwoSidedPhysicalMaterial({
    presetType: activePresetType,
    front: frontPbr,
    back: backPbr,
    backColor,
    backTemplate,
    roughness: cardRoughness,
    metalness: cardMetalness,
    normalScale: cardNormalScale,
    clearcoat: cardClearcoat,
    clearcoatRoughness: cardClearcoatRoughness,
    sideAxis,
    flipH: textureFlipH,
    flipV: textureFlipV,
    edgeColor: cardEdgeColor,
    edgeTint: cardEdgeTint,
  })

  const chipMaterial = useChipMaterial({
    color: chipColor,
    metalness: chipMetalness,
    roughness: chipRoughness,
    anisotropy: chipAnisotropy,
    noiseAmount: chipNoiseAmount,
    noiseScale: chipNoiseScale,
  })

  useMemo(() => {
    analyzed.forEach(({ mesh, role }) => {
      if (role === "body") mesh.material = cardMaterial
      else if (role === "chip") mesh.material = chipMaterial
    })
  }, [analyzed, cardMaterial, chipMaterial])

  const logoTexture = useLogoTexture()

  const logoPlane = useMemo(() => {
    if (!bodyMesh || !bodyBBox) return null
    const size = new THREE.Vector3()
    bodyBBox.getSize(size)
    const axes = [0, 1, 2].filter((i) => i !== sideAxis) as [number, number]
    const planeW = size.getComponent(axes[0])
    const planeH = size.getComponent(axes[1])
    const thickness = size.getComponent(sideAxis)

    const logoW = planeW * 0.6 * logoScale
    const logoAspect = logoTexture
      ? (logoTexture.image?.width ?? 1) / (logoTexture.image?.height ?? 1)
      : 1.5
    const logoH = logoW / logoAspect

    const pos = bodyCenter.clone()
    pos.setComponent(axes[0], bodyCenter.getComponent(axes[0]) + (planeW / 2 - logoW / 2) * logoOffsetX)
    pos.setComponent(axes[1], bodyCenter.getComponent(axes[1]) + (planeH / 2 - logoH / 2) * logoOffsetY)
    pos.setComponent(sideAxis, bodyBBox.max.getComponent(sideAxis) + thickness * 0.01)

    const rot = new THREE.Euler()
    if (sideAxis === 0) rot.set(0, Math.PI / 2, 0)
    else if (sideAxis === 1) rot.set(-Math.PI / 2, 0, 0)
    else rot.set(0, 0, 0)

    return {
      pos: pos.toArray() as [number, number, number],
      rot: [rot.x, rot.y, rot.z] as [number, number, number],
      w: logoW,
      h: logoH,
    }
  }, [bodyMesh, bodyBBox, bodyCenter, sideAxis, logoScale, logoOffsetX, logoOffsetY, logoTexture])

  const groupRotation: [number, number, number] =
    orientation === "vertical" ? [0, 0, Math.PI / 2] : [0, 0, 0]

  return (
    <group rotation={groupRotation} scale={normScale}>
      <group position={normOffset}>
        <primitive object={gltf.scene} />
        {showLogo && logoTexture && logoPlane && (
          <mesh position={logoPlane.pos} rotation={logoPlane.rot} renderOrder={5}>
            <planeGeometry args={[logoPlane.w, logoPlane.h]} />
            <meshPhysicalMaterial
              map={logoTexture}
              transparent
              alphaTest={0.02}
              color={logoColor}
              metalness={logoMetalness}
              roughness={logoRoughness}
              polygonOffset
              polygonOffsetFactor={-4}
              polygonOffsetUnits={-4}
              depthWrite={false}
            />
          </mesh>
        )}
      </group>
    </group>
  )
}
