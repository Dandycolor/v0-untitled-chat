"use client"

import * as THREE from "three"

export type CaptureOptions = {
  transparent: boolean
  size: number
  filename?: string
}

/**
 * Renders the current scene to an off-screen target at the desired resolution
 * and downloads it as a PNG.
 */
export function captureScene(
  gl: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  options: CaptureOptions,
) {
  const { transparent, size } = options
  const prevSize = new THREE.Vector2()
  gl.getSize(prevSize)
  const prevPixelRatio = gl.getPixelRatio()
  const prevClearAlpha = gl.getClearAlpha()
  const prevBackground = scene.background
  const prevAutoClear = gl.autoClear

  const aspect = prevSize.x / prevSize.y
  const width = size
  const height = Math.round(size / aspect)

  const target = new THREE.WebGLRenderTarget(width, height, {
    colorSpace: THREE.SRGBColorSpace,
    samples: 4,
  })

  try {
    if (transparent) {
      scene.background = null
      gl.setClearColor(0x000000, 0)
    }
    gl.setPixelRatio(1)
    gl.setSize(width, height, false)
    gl.setRenderTarget(target)
    gl.clear()
    gl.render(scene, camera)

    const pixels = new Uint8Array(width * height * 4)
    gl.readRenderTargetPixels(target, 0, 0, width, height, pixels)

    // Flip Y (WebGL origin is bottom-left)
    const flipped = new Uint8ClampedArray(pixels.length)
    const rowLen = width * 4
    for (let y = 0; y < height; y++) {
      const srcStart = (height - 1 - y) * rowLen
      const dstStart = y * rowLen
      flipped.set(pixels.subarray(srcStart, srcStart + rowLen), dstStart)
    }

    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d")!
    const imageData = new ImageData(flipped, width, height)
    ctx.putImageData(imageData, 0, 0)

    const dataUrl = canvas.toDataURL("image/png")
    const a = document.createElement("a")
    a.href = dataUrl
    a.download = options.filename ?? `card-${Date.now()}.png`
    a.click()
  } finally {
    gl.setRenderTarget(null)
    scene.background = prevBackground
    gl.setClearAlpha(prevClearAlpha)
    gl.setPixelRatio(prevPixelRatio)
    gl.setSize(prevSize.x, prevSize.y, false)
    gl.autoClear = prevAutoClear
    target.dispose()
  }
}
