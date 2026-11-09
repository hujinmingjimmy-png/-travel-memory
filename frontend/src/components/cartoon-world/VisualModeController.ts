import * as THREE from 'three'
import type { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import type { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import type { CartoonMapStyle } from '@/api/travelMapScene'
import type { WorldQualityProfile } from './quality'
import type { WorldPalette } from './theme'
import { CinematicEnvironment } from './CinematicEnvironment'
import { createCinematicPbrMaterial } from './CinematicMaterialProfiles'
import { createCinematicWaterMaterial, updateCinematicWater } from './CinematicWater'
import { createShoreMask, type ShoreMask } from './CinematicShore'
import { CinematicReflection } from './CinematicReflection'
import type { PolygonArea } from './topology'

/** Visual mode is separate from the underlying geospatial scene and story data. */
export type WorldVisualMode = 'GEO' | 'CINEMA'

type SceneLights = {
  sun: THREE.DirectionalLight
  hemi: THREE.HemisphereLight
  rim: THREE.DirectionalLight
}

type ControllerOptions = {
  scene: THREE.Scene
  root: THREE.Group
  renderer: THREE.WebGLRenderer
  camera: THREE.PerspectiveCamera
  skyPass: ShaderPass
  bloomPass: UnrealBloomPass
  gradePass: ShaderPass
  lights: SceneLights
  palette: WorldPalette
  style: CartoonMapStyle
  lod: WorldQualityProfile['id']
}

type OriginalMaterial = THREE.Material | THREE.Material[]

/**
 * The first dual-3D milestone. One geographic scene/route, two reversible
 * material-and-lighting treatments. Future film-specific assets may be layered
 * over the shared spatial scene without multiplying route or memory data.
 *
 * This does NOT claim photorealistic water/reflections; those require a later
 * water shader, HDR environment, licensed models and visual QA.
 */
export class VisualModeController {
  private readonly originals = new Map<THREE.Mesh, OriginalMaterial>()
  private readonly filmVariants = new Map<THREE.Material, THREE.Material>()
  private readonly shoreVariants = new Map<THREE.Mesh, THREE.ShaderMaterial>()
  private readonly shoreMasks: ShoreMask[] = []
  private reflection: CinematicReflection | null = null
  private reflectionUnavailable = false
  private readonly reflectedWaters: THREE.Mesh[] = []
  private mode: WorldVisualMode = 'GEO'
  private readonly environment: CinematicEnvironment
  private environmentUnavailable = false
  private waterClock = 0
  private targetFov = 38
  private readonly baseline = {
    fov: 38,
    exposure: 0.9,
    fog: null as THREE.Scene['fog'],
    sunColor: new THREE.Color(),
    hemiSky: new THREE.Color(),
    hemiGround: new THREE.Color(),
    rimColor: new THREE.Color(),
    sunIntensity: 0,
    hemiIntensity: 0,
    rimIntensity: 0,
    bloomStrength: 0,
    bloomRadius: 0,
    bloomThreshold: 0,
    saturation: 0,
    warmth: 0,
    vignette: 0,
    skyTop: new THREE.Color(),
    skyBottom: new THREE.Color()
  }

  constructor(private readonly options: ControllerOptions) {
    const { camera, scene, renderer, lights, bloomPass, gradePass, skyPass } = options
    this.environment = new CinematicEnvironment(scene, renderer, options.style === 'NIGHT')
    this.baseline.fov = camera.fov
    this.targetFov = camera.fov
    this.baseline.exposure = renderer.toneMappingExposure
    this.baseline.fog = scene.fog
    this.baseline.sunColor.copy(lights.sun.color)
    this.baseline.hemiSky.copy(lights.hemi.color)
    this.baseline.hemiGround.copy(lights.hemi.groundColor)
    this.baseline.rimColor.copy(lights.rim.color)
    this.baseline.sunIntensity = lights.sun.intensity
    this.baseline.hemiIntensity = lights.hemi.intensity
    this.baseline.rimIntensity = lights.rim.intensity
    this.baseline.bloomStrength = bloomPass.strength
    this.baseline.bloomRadius = bloomPass.radius
    this.baseline.bloomThreshold = bloomPass.threshold
    this.baseline.saturation = gradePass.uniforms['saturation']!.value as number
    this.baseline.warmth = gradePass.uniforms['warmth']!.value as number
    this.baseline.vignette = gradePass.uniforms['vignette']!.value as number
    this.baseline.skyTop.copy(skyPass.uniforms['top']!.value as THREE.Color)
    this.baseline.skyBottom.copy(skyPass.uniforms['bottom']!.value as THREE.Color)
    options.root.traverse(object => {
      const mesh = object as THREE.Mesh
      if (!mesh.isMesh || !(mesh.material instanceof THREE.MeshStandardMaterial) || mesh.material.name !== 'tm-world-water') return
      if (typeof mesh.userData.tmWaterArea === 'number' && mesh.userData.tmWaterArea > 0) this.reflectedWaters.push(mesh)
    })
    this.reflectedWaters.sort((a, b) => (b.userData.tmWaterArea as number) - (a.userData.tmWaterArea as number))
  }

  private createFilmMaterial(material: THREE.Material): THREE.Material {
    const cached = this.filmVariants.get(material)
    if (cached) return cached
    let converted: THREE.Material = material
    if (material instanceof THREE.MeshStandardMaterial && material.name === 'tm-world-water') {
      converted = createCinematicWaterMaterial(this.options.palette, this.options.style === 'NIGHT')
    } else if (material instanceof THREE.MeshToonMaterial) {
      // Film-only PBR upgrade, preserving the exact GEO source and GLB materials.
      converted = createCinematicPbrMaterial(material)
    }
    if (converted !== material) {
      if (converted.name !== 'tm-cinema-water') converted.name = `${material.name || material.type}-film`
      this.filmVariants.set(material, converted)
    }
    return converted
  }

  private waterForMesh(mesh: THREE.Mesh, material: THREE.Material): THREE.Material {
    const area = mesh.userData.tmShoreArea as PolygonArea | undefined
    // Limit additional shoreline distance maps to the three dominant basins.
    if (area && this.reflectedWaters.slice(0, 3).includes(mesh)) {
      const cached = this.shoreVariants.get(mesh)
      if (cached) return cached
      const shore = createShoreMask(area)
      if (shore) {
        this.shoreMasks.push(shore)
        const variant = createCinematicWaterMaterial(this.options.palette, this.options.style === 'NIGHT', shore)
        this.shoreVariants.set(mesh, variant)
        return variant
      }
    }
    return this.createFilmMaterial(material)
  }

  /** Apply to newly loaded GLBs as well; never dispose source-owned materials. */
  refreshMaterials() {
    if (this.mode !== 'CINEMA') return
    this.options.root.traverse(object => {
      const mesh = object as THREE.Mesh
      if (!mesh.isMesh) return
      if (!this.originals.has(mesh)) this.originals.set(mesh, mesh.material)
      const original = this.originals.get(mesh)!
      mesh.material = Array.isArray(original)
        ? original.map(material => this.waterForMesh(mesh, material))
        : this.waterForMesh(mesh, original)
    })
  }

  setMode(next: WorldVisualMode) {
    if (next !== 'GEO' && next !== 'CINEMA') return
    this.mode = next
    const { scene, renderer, lights, skyPass, bloomPass, gradePass, style, lod, palette } = this.options
    if (next === 'GEO') {
      this.originals.forEach((material, mesh) => { mesh.material = material })
      this.originals.clear()
      this.environment.deactivate()
      skyPass.uniforms['filmSky']!.value = 0
      this.reflection?.dispose()
      this.reflection = null
      scene.fog = this.baseline.fog
      this.targetFov = this.baseline.fov
      renderer.toneMappingExposure = this.baseline.exposure
      lights.sun.color.copy(this.baseline.sunColor)
      lights.sun.intensity = this.baseline.sunIntensity
      lights.hemi.color.copy(this.baseline.hemiSky)
      lights.hemi.groundColor.copy(this.baseline.hemiGround)
      lights.hemi.intensity = this.baseline.hemiIntensity
      lights.rim.color.copy(this.baseline.rimColor)
      lights.rim.intensity = this.baseline.rimIntensity
      bloomPass.strength = this.baseline.bloomStrength
      bloomPass.radius = this.baseline.bloomRadius
      bloomPass.threshold = this.baseline.bloomThreshold
      gradePass.uniforms['saturation']!.value = this.baseline.saturation
      gradePass.uniforms['warmth']!.value = this.baseline.warmth
      gradePass.uniforms['vignette']!.value = this.baseline.vignette
      ;(skyPass.uniforms['top']!.value as THREE.Color).copy(this.baseline.skyTop)
      ;(skyPass.uniforms['bottom']!.value as THREE.Color).copy(this.baseline.skyBottom)
    } else {
      // Film look is a safe baseline, not a replacement for authentic materials.
      // Keep OSM geometry, route topology, anchors and vehicle transforms unchanged.
      const isNight = style === 'NIGHT'
      const density = lod === 'REGION' ? 0.0020 : lod === 'DISTRICT' ? 0.0027 : 0.0030
      scene.fog = new THREE.FogExp2(palette.fog, density * (isNight ? 1.15 : 1))
      this.targetFov = 35
      renderer.toneMappingExposure = isNight ? 0.84 : 0.99
      lights.sun.color.set(isNight ? '#b3c6ff' : '#ffe3c4')
      lights.sun.intensity = isNight ? 0.92 : 2.10
      lights.hemi.color.set(isNight ? '#819ac9' : '#d8e5fc')
      lights.hemi.groundColor.set(isNight ? '#45547a' : '#a5ab9e')
      lights.hemi.intensity = isNight ? 0.72 : 0.84
      lights.rim.color.set(isNight ? '#d4c8ff' : '#b9d4ff')
      lights.rim.intensity = isNight ? 0.52 : 0.40
      bloomPass.strength = isNight ? 0.21 : 0.085
      bloomPass.radius = 0.42
      bloomPass.threshold = 0.89
      gradePass.uniforms['saturation']!.value = isNight ? 0.98 : 0.93
      gradePass.uniforms['warmth']!.value = isNight ? -0.006 : 0.024
      gradePass.uniforms['vignette']!.value = 0.23
      ;(skyPass.uniforms['top']!.value as THREE.Color).set(isNight ? '#20233c' : '#aebfd7')
      ;(skyPass.uniforms['bottom']!.value as THREE.Color).set(isNight ? '#47465f' : '#f5ded3')
      skyPass.uniforms['filmSky']!.value = isNight ? 0.2 : 1
      // PMREM may be unavailable on older WebGL devices. In that case keep
      // the sky/water shader and the original geography usable.
      if (!this.environmentUnavailable) {
        try { this.environment.activate() }
        catch (error) {
          this.environmentUnavailable = true
          this.environment.deactivate()
          console.warn('CINEMA environment fallback:', error)
        }
      }
      this.refreshMaterials()
      this.ensureReflection()
    }
  }

  private ensureReflection() {
    if (this.reflection || this.reflectionUnavailable || this.mode !== 'CINEMA') return
    const dominant = this.reflectedWaters[0]
    if (!dominant || !(dominant.userData.tmWaterArea > 8)) return
    const height = dominant.userData.tmWaterLevel as number
    if (!Number.isFinite(height)) return
    try {
      this.reflection = new CinematicReflection(this.options.renderer, this.options.scene,
        this.options.camera, this.options.root, height)
    } catch (error) {
      this.reflectionUnavailable = true
      console.warn('Planar water capture unavailable; keeping sky reflection:', error)
    }
  }

  /** Runs BEFORE the composer's scene render, never recursively inside a pass. */
  updateReflection() {
    if (this.mode !== 'CINEMA') return
    this.ensureReflection()
    try { this.reflection?.update() } catch (error) {
      console.warn('Reflection capture fallback:', error)
      this.reflectionUnavailable = true
      this.reflection?.dispose()
      this.reflection = null
    }
    const reflection = this.reflection
    const materials = [...this.filmVariants.values(), ...this.shoreVariants.values()]
    materials.forEach(material => {
      if (!(material instanceof THREE.ShaderMaterial) || material.name !== 'tm-cinema-water') return
      material.uniforms['uReflectionEnabled']!.value = reflection?.active ? 1 : 0
      material.uniforms['uReflectionHeight']!.value = reflection?.height ?? 0
      material.uniforms['uReflectionMap']!.value = reflection?.texture ?? null
      if (reflection) (material.uniforms['uReflectionMatrix']!.value as THREE.Matrix4).copy(reflection.textureMatrix)
    })
  }

  /** Frame-rate independent 3D lens transition without altering camera world position. */
  update(deltaSeconds: number) {
    if (this.mode === 'CINEMA') {
      this.waterClock += Math.max(0, Math.min(deltaSeconds, 0.05))
      this.filmVariants.forEach(material => updateCinematicWater(material, this.waterClock))
      this.shoreVariants.forEach(material => updateCinematicWater(material, this.waterClock))
      // This is a distant background halo and a handful of soft sky rays,
      // not a physically simulated volumetric beam or an additional full-screen pass.
      const { camera, skyPass } = this.options
      const sun = new THREE.Vector3(-28, 62, 34).normalize()
      const direction = new THREE.Vector3()
      camera.getWorldDirection(direction)
      const inFront = direction.dot(sun) > 0.04
      const screen = skyPass.uniforms['sunScreen']!.value as THREE.Vector2
      if (inFront) {
        const projected = camera.position.clone().addScaledVector(sun, 180).project(camera)
        screen.set(projected.x * 0.5 + 0.5, projected.y * 0.5 + 0.5)
      } else screen.set(-10, -10)
    }
    const camera = this.options.camera
    if (Math.abs(camera.fov - this.targetFov) < 0.005) return
    const t = 1 - Math.exp(-Math.min(Math.max(deltaSeconds, 0), 0.05) * 7.5)
    camera.fov = THREE.MathUtils.lerp(camera.fov, this.targetFov, t)
    camera.updateProjectionMatrix()
  }

  dispose() {
    this.originals.forEach((material, mesh) => { mesh.material = material })
    this.originals.clear()
    this.reflection?.dispose()
    this.reflection = null
    this.environment.dispose()
    this.shoreMasks.forEach(mask => mask.texture.dispose())
    this.shoreMasks.length = 0
    this.shoreVariants.forEach(material => material.dispose())
    this.shoreVariants.clear()
    this.filmVariants.forEach(material => material.dispose())
    this.filmVariants.clear()
  }
}
