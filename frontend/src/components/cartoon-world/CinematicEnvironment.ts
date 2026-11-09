import * as THREE from 'three'

/**
 * Small deterministic outdoor lighting environment for physical materials.
 * PMREM prefilters a linear high-dynamic-range sky with a broad sun highlight.
 * It needs no network HDRI or external image licensing, and uses one cubemap.
 * It does not reflect buildings or bridges; that needs separate reflections.
 */
export class CinematicEnvironment {
  private target: THREE.WebGLRenderTarget | null = null
  private readonly baseEnvironment: THREE.Texture | null
  private readonly baseIntensity: number

  constructor(
    private readonly scene: THREE.Scene,
    private readonly renderer: THREE.WebGLRenderer,
    private readonly night: boolean
  ) {
    this.baseEnvironment = scene.environment
    this.baseIntensity = scene.environmentIntensity
  }

  activate() {
    if (!this.target) {
      const width = 256
      const height = 128
      const data = new Float32Array(width * height * 4)
      const top = new THREE.Color(this.night ? '#202a48' : '#8db1cb')
      const horizon = new THREE.Color(this.night ? '#607398' : '#ffe3cd')
      const ground = new THREE.Color(this.night ? '#182337' : '#a3aba3')
      const sunColor = new THREE.Color(this.night ? '#a5baf1' : '#fff4dd')
      const sun = new THREE.Vector3(-28, 62, 34).normalize()
      const color = new THREE.Color()
      for (let y = 0; y < height; y += 1) {
        const theta = Math.PI * (y + 0.5) / height
        const dirY = Math.cos(theta)
        for (let x = 0; x < width; x += 1) {
          const phi = Math.PI * 2 * (x + 0.5) / width
          const direction = new THREE.Vector3(Math.sin(theta) * Math.cos(phi), dirY, Math.sin(theta) * Math.sin(phi))
          if (dirY > 0) {
            color.copy(horizon).lerp(top, THREE.MathUtils.smoothstep(dirY, 0, 1))
          } else {
            color.copy(horizon).lerp(ground, THREE.MathUtils.smoothstep(-dirY, 0, 1))
          }
          // A wide, soft luminance lobe avoids hot-pixel fireflies in rough PBR reflections.
          const dot = Math.max(0, direction.dot(sun))
          const glow = Math.pow(dot, 72) * (this.night ? 0.3 : 2.0)
          color.r += sunColor.r * glow
          color.g += sunColor.g * glow
          color.b += sunColor.b * glow
          const index = (y * width + x) * 4
          data[index] = color.r
          data[index + 1] = color.g
          data[index + 2] = color.b
          data[index + 3] = 1
        }
      }
      const equirect = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType)
      equirect.colorSpace = THREE.LinearSRGBColorSpace
      equirect.mapping = THREE.EquirectangularReflectionMapping
      equirect.minFilter = THREE.LinearFilter
      equirect.magFilter = THREE.LinearFilter
      equirect.generateMipmaps = false
      equirect.needsUpdate = true
      const generator = new THREE.PMREMGenerator(this.renderer)
      try {
        this.target = generator.fromEquirectangular(equirect)
      } finally {
        equirect.dispose()
        generator.dispose()
      }
    }
    this.scene.environment = this.target.texture
    this.scene.environmentIntensity = this.night ? 0.42 : 0.66
  }

  deactivate() {
    this.scene.environment = this.baseEnvironment
    this.scene.environmentIntensity = this.baseIntensity
  }

  dispose() {
    this.deactivate()
    this.target?.dispose()
    this.target = null
  }
}
