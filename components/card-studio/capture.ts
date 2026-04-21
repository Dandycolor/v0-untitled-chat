"use client"

import * as THREE from "three"

export type CaptureOptions = {
  transparent: boolean
  size: number
  filename?: string
}

/**
 * Renders the current scene at a chosen resolution and downloads it as PNG.
 *
 * Why not render to an offscreen WebGLRenderTarget and readPixels?
 * Because writing to a RenderTarget skips three.js's output-color-space conversion,
 * so the resulting bytes are linear (tone-mapped but not sRGB-encoded). The PNG
 * looks washed-out / "greyer" than the browser preview.
 *
 * Instead we briefly resize the on-screen canvas to the requested size, render
 * through the normal screen path (which DOES apply ACES tone mapping + sRGB
 * encoding), then grab the drawing buffer with `canvas.toBlob()`. This is true
 * WYSIWYG — what you see in the preview is exactly what the PNG will contain.
 * `preserveDrawingBuffer: true` on the Canvas keeps the buffer readable after render.
 */
export function captureScene(
  gl: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  options: CaptureOptions,
) {
  const { transparent, size } = options
  const canvas = gl.domElement

  // Capture existing state so we can restore every side-effect we mutate.
  const prevSize = new THREE.Vector2()
  gl.getSize(prevSize)
  const prevPixelRatio = gl.getPixelRatio()
  const prevClearAlpha = gl.getClearAlpha()
  const prevBackground = scene.background
  const prevAutoClear = gl.autoClear

  // Keep the aspect ratio of the current viewport so cropping doesn't change.
  const aspect = prevSize.x / prevSize.y
  const width = size
  const height = Math.round(size / aspect)

  // If the active camera is a PerspectiveCamera we need to keep its aspect
  // in sync, otherwise the captured frame stretches.
  const persp = camera as THREE.PerspectiveCamera
  const prevCamAspect = persp.isPerspectiveCamera ? persp.aspect : undefined

  try {
    if (transparent) {
      scene.background = null
      gl.setClearColor(0x000000, 0)
    }
    // setSize with updateStyle=false keeps the CSS size unchanged (no visible flicker),
    // only the drawing buffer is resized to the export dimensions.
    gl.setPixelRatio(1)
    gl.setSize(width, height, false)

    if (persp.isPerspectiveCamera) {
      persp.aspect = width / height
      persp.updateProjectionMatrix()
    }

    // Render through the default framebuffer so tone mapping + sRGB encoding apply.
    gl.setRenderTarget(null)
    gl.clear()
    gl.render(scene, camera)

    canvas.toBlob(
      (blob) => {
        if (!blob) return
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = options.filename ?? `card-${Date.now()}.png`
        a.click()
        // Release the object URL after the download is dispatched.
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      },
      "image/png",
    )
  } finally {
    scene.background = prevBackground
    gl.setClearAlpha(prevClearAlpha)
    gl.setPixelRatio(prevPixelRatio)
    gl.setSize(prevSize.x, prevSize.y, false)
    gl.autoClear = prevAutoClear
    if (persp.isPerspectiveCamera && prevCamAspect !== undefined) {
      persp.aspect = prevCamAspect
      persp.updateProjectionMatrix()
    }
  }
}
