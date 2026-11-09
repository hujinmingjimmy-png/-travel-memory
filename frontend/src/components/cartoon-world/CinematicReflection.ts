import * as THREE from 'three'
import { Reflector } from 'three/addons/objects/Reflector.js'

/** One low-resolution *local* planar capture. No fullscreen SSR, no extra pass on GEO.
 * It is intentionally confined to the dominant flat lake; sloping rivers keep
 * alpha.2's analytical sky reflection to prevent height/bridge mismatches.
 */
export class CinematicReflection {
  private readonly mirror: Reflector
  private readonly matrix = new THREE.Matrix4()
  private readonly reflectedToWorld = new THREE.Matrix4()
  private frame = 0
  private enabled = false
  private broken = false
  private readonly hiddenWater: THREE.Object3D[] = []

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly root: THREE.Group,
    readonly height: number
  ) {
    this.mirror = new Reflector(new THREE.PlaneGeometry(1, 1), {
      textureWidth: 512,
      textureHeight: 288,
      clipBias: 0.004,
      multisample: 0
    })
    this.mirror.position.y = height
    this.mirror.rotation.x = -Math.PI / 2
    this.mirror.updateMatrixWorld(true)
    this.reflectedToWorld.copy(this.mirror.matrixWorld).invert()
    root.traverse(child => {
      if ((child as THREE.Mesh).isMesh && (child as THREE.Mesh).material) {
        const material = (child as THREE.Mesh).material
        const materials = Array.isArray(material) ? material : [material]
        if (materials.some(m => m.name === 'tm-world-water' || m.name === 'tm-cinema-water')) this.hiddenWater.push(child)
      }
    })
    this.resize()
  }

  private resize() {
    const canvas = this.renderer.domElement
    const ratio = Math.max(0.5, Math.min(2.4, canvas.clientWidth / Math.max(1, canvas.clientHeight) || 16 / 9))
    this.mirror.getRenderTarget().setSize(512, Math.round(512 / ratio))
  }

  get texture(): THREE.Texture { return this.mirror.getRenderTarget().texture }
  get textureMatrix(): THREE.Matrix4 { return this.matrix }
  get active() { return this.enabled }

  update() {
    if (this.broken) return
    // A few reflections per second are sufficient for broad, low-amplitude water.
    // Cost: a second *scene render* every third frame, at 512px width.
    if (++this.frame % 3 !== 1) return
    this.enabled = false
    if (this.camera.position.y <= this.height + 0.2) return
    // Reflection on mocked / headless renderers is optional, not a crash path.
    if (typeof this.renderer.getRenderTarget !== 'function') return
    // The composer has not yet rendered this frame: sync camera/world matrices
    // so the mirrored view uses THIS frame's camera, not last frame's pose.
    this.camera.updateMatrixWorld(true)
    this.scene.updateMatrixWorld(true)
    const previous = this.hiddenWater.map(mesh => mesh.visible)
    const oldTarget = this.renderer.getRenderTarget()
    const oldXr = this.renderer.xr.enabled
    const oldShadow = this.renderer.shadowMap.autoUpdate
    try {
      this.hiddenWater.forEach(mesh => { mesh.visible = false })
      this.mirror.updateMatrixWorld(true)
      this.mirror.onBeforeRender(this.renderer, this.scene, this.camera,
        this.mirror.geometry, this.mirror.material as THREE.Material, null!)
      // Reflector's matrix includes model->world of its proxy plane. Our shader
      // uses vWorldPos, so remove that final transform.
      const proxyMatrix = (this.mirror.material as THREE.ShaderMaterial).uniforms['textureMatrix']!.value as THREE.Matrix4
      this.matrix.copy(proxyMatrix).multiply(this.reflectedToWorld)
      this.enabled = true
    } catch (error) {
      // Graceful GPU fallback: leave analytical sky Fresnel intact.
      this.enabled = false
      this.broken = true
      console.warn('Local water reflection disabled; falling back to analytical sky:', error)
    } finally {
      this.hiddenWater.forEach((mesh, i) => { mesh.visible = previous[i]! })
      this.renderer.xr.enabled = oldXr
      this.renderer.shadowMap.autoUpdate = oldShadow
      this.renderer.setRenderTarget(oldTarget)
    }
  }

  dispose() {
    this.mirror.dispose()
    this.mirror.geometry.dispose()
  }
}
