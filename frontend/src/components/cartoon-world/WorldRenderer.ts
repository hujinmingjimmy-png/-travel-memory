import * as THREE from 'three'
import gsap from 'gsap'
import { createNoise2D } from 'simplex-noise'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js'
import { buildRoadSurface, type SurfaceRoad } from './RoadSurface'
import { classifyBuilding, curateBuildings, type BuildingKind } from './BuildingLayout'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import type { CartoonMapStyle } from '@/api/travelMapScene'
import type { RealMapPoint } from '@/api/travelRealMap'
import type { GeoBounds } from './geo'
import { WORLD_DEPTH, WORLD_WIDTH, projectLngLat, seededRandom, stringSeed } from './geo'
import type { OsmFeature, OsmWorldData } from './osm'
import type { DemTerrainData } from './dem'
import { getWorldPalette, type WorldPalette } from './theme'
import { CartoonAssetLibrary, type AssetCategory } from './AssetLibrary'
import type { WorldQualityProfile } from './quality'
import { clipAreasToRect, pointInArea, unionAreas, type PolygonArea } from './topology'
import { buildJourneyRoute } from './journey/JourneyRouteBuilder'
import { projectSharedJourneyRoute } from './journey/SharedJourneyRoute'
import type { TravelRoute } from '@/utils/travelRoute'
import { JourneyPlaybackController, type JourneyCameraMode, type JourneyPlaybackSnapshot } from './journey/JourneyPlaybackController'
import { VehicleController } from './journey/VehicleController'
import { createDioramaAtmosphere, type DioramaAtmosphere } from './DioramaAtmosphere'
import { buildDioramaEdgeSeal } from './DioramaEdgeSeal'
import { visibleJourneyVertices } from './journey/JourneyProgress'
import { roadRenderPolicy, cinematicDamping } from './RoadRenderPolicy'
import { VisualModeController, type WorldVisualMode } from './VisualModeController'

export interface WorldRendererOptions {
  container: HTMLElement
  travelId: number
  style: CartoonMapStyle
  bounds: GeoBounds
  points: RealMapPoint[]
  photoUrls: Record<number, string>
  osm: OsmWorldData
  dem: DemTerrainData | null
  quality: WorldQualityProfile
  preferredAzimuthDeg?: number
  sharedRoute?: TravelRoute | null
  onAssetProgress?: (loaded: number, total: number) => void
  onRenderError?: (message: string) => void
  onRenderWarning?: (message: string, fallbackMode?: WorldVisualMode) => void
  onJourneyState?: (state: JourneyPlaybackSnapshot) => void
}

type VecXZ = { x: number; z: number }

type PolygonMask = VecXZ[]
type CorridorMask = { points: VecXZ[]; halfWidth: number }
type RoadCorridor = CorridorMask & { bridge: boolean; inferredBridge: boolean; highway: string; featureId: number }
type RoadFrame = { x: number; z: number; angle: number; halfWidth: number; distance: number }

type AssetUpgradeSlot = {
  seed: string
  category: AssetCategory
  x: number
  y: number
  z: number
  yaw: number
  width: number
  depth: number
  height: number
  fallbackObjects: THREE.Object3D[]
}


// OSM's bbox query selects ways that TOUCH the requested bbox, but `out geom`
// can return the whole way/polygon. Therefore some coordinates may lie far
// outside the user's saved map selection. Everything below clips the returned
// geometry to the diorama rectangle before any mesh/mask is built.
const CLIP_MIN_X = -WORLD_WIDTH * 0.495
const CLIP_MAX_X = WORLD_WIDTH * 0.495
const CLIP_MIN_Z = -WORLD_DEPTH * 0.495
const CLIP_MAX_Z = WORLD_DEPTH * 0.495

function almostSamePoint(a: VecXZ, b: VecXZ, epsilon = 1e-4) {
  return Math.abs(a.x - b.x) <= epsilon && Math.abs(a.z - b.z) <= epsilon
}

function clampWorldPoint(point: VecXZ): VecXZ {
  return {
    x: clamp(point.x, CLIP_MIN_X, CLIP_MAX_X),
    z: clamp(point.z, CLIP_MIN_Z, CLIP_MAX_Z)
  }
}

// Liang-Barsky clipping for one line segment.
function clipSegmentToWorld(a: VecXZ, b: VecXZ): [VecXZ, VecXZ] | null {
  const dx = b.x - a.x
  const dz = b.z - a.z
  let t0 = 0
  let t1 = 1

  const clip = (p: number, q: number) => {
    if (Math.abs(p) < 1e-12) return q >= 0
    const r = q / p
    if (p < 0) {
      if (r > t1) return false
      if (r > t0) t0 = r
    } else {
      if (r < t0) return false
      if (r < t1) t1 = r
    }
    return true
  }

  if (!clip(-dx, a.x - CLIP_MIN_X)) return null
  if (!clip(dx, CLIP_MAX_X - a.x)) return null
  if (!clip(-dz, a.z - CLIP_MIN_Z)) return null
  if (!clip(dz, CLIP_MAX_Z - a.z)) return null
  if (t1 < t0) return null

  return [
    { x: a.x + dx * t0, z: a.z + dz * t0 },
    { x: a.x + dx * t1, z: a.z + dz * t1 }
  ]
}

// Returns separate visible runs. This is important: joining two disconnected
// clipped runs would create a fake road straight across the map.
function clipPolylineToWorld(points: VecXZ[]): VecXZ[][] {
  const runs: VecXZ[][] = []
  let current: VecXZ[] = []

  for (let i = 1; i < points.length; i += 1) {
    const clipped = clipSegmentToWorld(points[i - 1]!, points[i]!)
    if (!clipped) {
      if (current.length >= 2) runs.push(current)
      current = []
      continue
    }
    const [start, end] = clipped
    if (!current.length) {
      current = [start, end]
    } else if (almostSamePoint(current[current.length - 1]!, start)) {
      if (!almostSamePoint(current[current.length - 1]!, end)) current.push(end)
    } else {
      if (current.length >= 2) runs.push(current)
      current = [start, end]
    }
  }
  if (current.length >= 2) runs.push(current)
  return runs
}

// Sutherland-Hodgman polygon clipping against the rectangular map selection.
function clipPolygonToWorld(points: VecXZ[]): VecXZ[] {
  if (points.length < 3) return []
  let polygon = points.slice()

  const clipEdge = (
    input: VecXZ[],
    inside: (p: VecXZ) => boolean,
    intersect: (a: VecXZ, b: VecXZ) => VecXZ
  ) => {
    const output: VecXZ[] = []
    if (!input.length) return output
    let previous = input[input.length - 1]!
    let previousInside = inside(previous)
    for (const current of input) {
      const currentInside = inside(current)
      if (currentInside) {
        if (!previousInside) output.push(intersect(previous, current))
        output.push(current)
      } else if (previousInside) {
        output.push(intersect(previous, current))
      }
      previous = current
      previousInside = currentInside
    }
    return output
  }

  const intersectX = (x: number) => (a: VecXZ, b: VecXZ) => {
    const t = (x - a.x) / ((b.x - a.x) || 1e-12)
    return { x, z: a.z + (b.z - a.z) * t }
  }
  const intersectZ = (z: number) => (a: VecXZ, b: VecXZ) => {
    const t = (z - a.z) / ((b.z - a.z) || 1e-12)
    return { x: a.x + (b.x - a.x) * t, z }
  }

  polygon = clipEdge(polygon, p => p.x >= CLIP_MIN_X, intersectX(CLIP_MIN_X))
  polygon = clipEdge(polygon, p => p.x <= CLIP_MAX_X, intersectX(CLIP_MAX_X))
  polygon = clipEdge(polygon, p => p.z >= CLIP_MIN_Z, intersectZ(CLIP_MIN_Z))
  polygon = clipEdge(polygon, p => p.z <= CLIP_MAX_Z, intersectZ(CLIP_MAX_Z))

  // Remove duplicate consecutive points and clamp tiny numerical overshoot.
  const cleaned: VecXZ[] = []
  for (const point of polygon.map(clampWorldPoint)) {
    if (!cleaned.length || !almostSamePoint(cleaned[cleaned.length - 1]!, point)) cleaned.push(point)
  }
  if (cleaned.length > 1 && almostSamePoint(cleaned[0]!, cleaned[cleaned.length - 1]!)) cleaned.pop()
  return cleaned.length >= 3 ? cleaned : []
}

function projectFeature(feature: OsmFeature, bounds: GeoBounds): VecXZ[] {
  return feature.geometry.map(p => projectLngLat(p.lng, p.lat, bounds))
}

function projectFeatureHoles(feature: OsmFeature, bounds: GeoBounds): VecXZ[][] {
  return (feature.holes || []).map(ring => ring.map(p => projectLngLat(p.lng, p.lat, bounds)))
}

function isExplicitBridge(tags: Record<string, string>) {
  const bridge = String(tags.bridge || '').toLowerCase()
  const layer = Number.parseInt(tags.layer || '0', 10)
  return (bridge && bridge !== 'no') || tags.man_made === 'bridge' || (Number.isFinite(layer) && layer > 0)
}

function pointInPolygon(point: VecXZ, polygon: PolygonMask) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!
    const b = polygon[j]!
    const intersects = ((a.z > point.z) !== (b.z > point.z))
      && point.x < ((b.x - a.x) * (point.z - a.z)) / ((b.z - a.z) || 1e-9) + a.x
    if (intersects) inside = !inside
  }
  return inside
}

function distanceToSegment(point: VecXZ, a: VecXZ, b: VecXZ) {
  const vx = b.x - a.x
  const vz = b.z - a.z
  const wx = point.x - a.x
  const wz = point.z - a.z
  const denom = vx * vx + vz * vz
  if (denom <= 1e-9) return Math.hypot(point.x - a.x, point.z - a.z)
  const t = clamp((wx * vx + wz * vz) / denom, 0, 1)
  return Math.hypot(point.x - (a.x + vx * t), point.z - (a.z + vz * t))
}

function polygonCentroid(points: VecXZ[]): VecXZ {
  if (!points.length) return { x: 0, z: 0 }
  let x = 0
  let z = 0
  points.forEach(p => { x += p.x; z += p.z })
  return { x: x / points.length, z: z / points.length }
}

function polygonSignedArea(points: VecXZ[]) {
  let sum = 0
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!
    const b = points[(i + 1) % points.length]!
    sum += a.x * b.z - b.x * a.z
  }
  return sum * 0.5
}

// OSM building footprints often contain tiny duplicate/collinear vertices. Those
// are harmless in 2D, but bevelled ExtrudeGeometry can fold badly around them.
// Clean the ring before triangulation so complex concave buildings remain stable.
function sanitizePolygon(points: VecXZ[]) {
  if (points.length < 3) return []
  const deduped: VecXZ[] = []
  for (const point of points) {
    if (!deduped.length || !almostSamePoint(deduped[deduped.length - 1]!, point, 0.025)) deduped.push(point)
  }
  if (deduped.length > 2 && almostSamePoint(deduped[0]!, deduped[deduped.length - 1]!, 0.025)) deduped.pop()

  const cleaned: VecXZ[] = []
  for (let i = 0; i < deduped.length; i += 1) {
    const prev = deduped[(i - 1 + deduped.length) % deduped.length]!
    const cur = deduped[i]!
    const next = deduped[(i + 1) % deduped.length]!
    const ax = cur.x - prev.x
    const az = cur.z - prev.z
    const bx = next.x - cur.x
    const bz = next.z - cur.z
    const lenA = Math.hypot(ax, az)
    const lenB = Math.hypot(bx, bz)
    if (lenA < 0.035 || lenB < 0.035) continue
    const cross = Math.abs(ax * bz - az * bx)
    const sin = cross / Math.max(1e-6, lenA * lenB)
    if (sin < 0.012 && ax * bx + az * bz > 0) continue
    cleaned.push(cur)
  }
  return cleaned.length >= 3 ? cleaned : deduped
}

function polygonIsConcave(points: VecXZ[]) {
  if (points.length < 4) return false
  let sign = 0
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!
    const b = points[(i + 1) % points.length]!
    const c = points[(i + 2) % points.length]!
    const cross = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x)
    if (Math.abs(cross) < 1e-5) continue
    const current = Math.sign(cross)
    if (!sign) sign = current
    else if (current !== sign) return true
  }
  return false
}

function outwardNormalForEdge(a: VecXZ, b: VecXZ, polygon: VecXZ[]) {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const len = Math.hypot(dx, dz) || 1
  let nx = -dz / len
  let nz = dx / len
  const mid = { x: (a.x + b.x) * 0.5, z: (a.z + b.z) * 0.5 }
  if (pointInPolygon({ x: mid.x + nx * 0.16, z: mid.z + nz * 0.16 }, polygon)) {
    nx *= -1
    nz *= -1
  }
  return { nx, nz, len, angle: Math.atan2(-dz, dx), mid }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function getBuildingHeight(tags: Record<string, string>, random: () => number) {
  // Phase 2.5.1: miniature-friendly height compression.
  // Real-world metres are deliberately compressed so the city reads like a diorama,
  // not a forest of skyscraper columns.
  const direct = Number.parseFloat(tags.height || '')
  if (Number.isFinite(direct) && direct > 0) return clamp(direct / 14.5, 1.0, 6.8)
  const levels = Number.parseFloat(tags['building:levels'] || '')
  if (Number.isFinite(levels) && levels > 0) return clamp(levels * 0.52, 0.95, 6.8)

  const type = String(tags.building || tags['building:part'] || '').toLowerCase()
  if (/apartments|office|commercial|retail|hotel|hospital/.test(type)) return 2.2 + random() * 3.1
  if (/school|university|civic|public/.test(type)) return 1.7 + random() * 1.8
  if (/industrial|warehouse|supermarket/.test(type)) return 1.25 + random() * 1.0
  if (/house|detached|residential|terrace|bungalow/.test(type)) return 0.95 + random() * 1.05
  return 1.2 + random() * 2.4
}

function chooseBuildingAssetCategory(tags: Record<string, string>, height: number, width: number, depth: number): AssetCategory {
  const kind=classifyBuilding(tags)
  if(kind==='INDUSTRIAL')return 'industrial'
  if(kind==='OFFICE')return 'tower'
  if(kind==='RETAIL')return 'commercial'
  if(kind==='HOME'||kind==='APARTMENT')return 'house'
  const type = String(tags.building || tags['building:part'] || '').toLowerCase()
  const name = String(tags.name || '').toLowerCase()
  if (/industrial|warehouse|factory|hangar/.test(type) || /factory|warehouse/.test(name)) return 'industrial'
  if (/office|commercial|retail|supermarket|mall|hotel/.test(type) || /mall|hotel|office/.test(name)) return 'commercial'
  if (/house|detached|residential|apartments|terrace|bungalow|semidetached_house/.test(type)) return 'house'
  if (height > 4.7 || Math.max(width, depth) > 5.6 || /tower|skyscraper/.test(type + name)) return 'tower'
  return 'building'
}

function longestFootprintYaw(points: VecXZ[]) {
  let bestLength = 0
  let bestYaw = 0
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!
    const b = points[(i + 1) % points.length]!
    const dx = b.x - a.x
    const dz = b.z - a.z
    const len = Math.hypot(dx, dz)
    if (len > bestLength) {
      bestLength = len
      bestYaw = Math.atan2(dz, dx)
    }
  }
  return bestYaw
}

function isClosed(feature: OsmFeature) {
  if (feature.geometry.length < 3) return false
  const a = feature.geometry[0]!
  const b = feature.geometry[feature.geometry.length - 1]!
  return Math.abs(a.lng - b.lng) < 1e-7 && Math.abs(a.lat - b.lat) < 1e-7
}

export class WorldRenderer {
  private readonly options: WorldRendererOptions
  private readonly palette: WorldPalette
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(38, 1, 0.75, 380)
  private readonly renderer: THREE.WebGLRenderer
  private readonly labelRenderer = new CSS2DRenderer()
  private readonly controls: OrbitControls
  private readonly composer: EffectComposer
  private readonly root = new THREE.Group()
  private readonly labels: CSS2DObject[] = []
  private antialiasPass: ShaderPass
  private visualModeController: VisualModeController | null = null
  private composerFailed = false
  private visualRenderFailed = false
  private atmosphere: DioramaAtmosphere | null = null
  private readonly disposeList: Array<{ dispose: () => void }> = []
  private readonly clock = new THREE.Clock()
  private readonly random: () => number
  private readonly noise2D: ReturnType<typeof createNoise2D>
  private readonly toonGradient: THREE.DataTexture
  private readonly cameraTarget = new THREE.Vector3(0, 3, 0)
  private followCameraNeedsSync = true
  private renderQuality: 'SHARP' | 'BALANCED' = 'SHARP'
  private frame = 0
  private alive = true
  private routeCurve: THREE.CatmullRomCurve3 | null = null
  private routeProgressLine: THREE.Line | null = null
  private routeProgressPointCount = 0
  private vehicle: THREE.Group | null = null
  private vehicleController: VehicleController | null = null
  private journeyPlayback: JourneyPlaybackController | null = null
  private readonly memoryCards: HTMLElement[] = []
  private readonly stopLandmarks: THREE.Group[] = []
  private autoTour: gsap.core.Timeline | null = null
  private introTween: gsap.core.Tween | null = null
  private resizeObserver: ResizeObserver | null = null
  private readonly waterAreas: PolygonArea[] = []
  private readonly waterCorridors: CorridorMask[] = []
  private readonly roadCorridors: RoadCorridor[] = []
  private readonly bridgeDecks: Array<{ points: Array<VecXZ & { y: number }>; halfWidth: number }> = []
  private readonly occupiedBuildings: VecXZ[] = []
  private readonly assetLibrary = new CartoonAssetLibrary()
  private readonly assetUpgrades: AssetUpgradeSlot[] = []
  private readonly pressedKeys = new Set<string>()
  private readonly worldOrbitCenter = new THREE.Vector3(0, 2, 0)
  private pointerInside = false
  private freeLookActive = false
  private middleOrbitActive = false
  private freeYaw = 0
  private freePitch = -0.32
  private lookTargetYaw = 0
  private lookTargetPitch = -0.32
  // Free-flight velocity and wheel momentum are integrated with frame-time-independent damping.
  private readonly flightVelocity = new THREE.Vector3()
  private wheelVelocity = 0
  private cameraSpeedMultiplier = 1.8
  private pointerX = 0
  private pointerY = 0
  private enterManualCamera() {
    this.journeyPlayback?.setCameraMode('FREE')
  }
  private readonly onPointerEnter = () => { this.pointerInside = true }
  private readonly onPointerLeave = () => {
    this.pointerInside = false
    this.pressedKeys.clear()
    if (!this.freeLookActive && !this.middleOrbitActive) return
  }
  private readonly onPointerDown = (event: PointerEvent) => {
    this.renderer.domElement.focus({ preventScroll: true })
    this.introTween?.kill()
    this.introTween = null
    this.autoTour?.kill()
    this.autoTour = null
    this.enterManualCamera()
    if (event.button === 0) {
      event.preventDefault()
      this.freeLookActive = true
      this.pointerX = event.clientX
      this.pointerY = event.clientY
      this.syncFreeLookFromCamera()
      this.lookTargetYaw = this.freeYaw
      this.lookTargetPitch = this.freePitch
      this.renderer.domElement.setPointerCapture?.(event.pointerId)
    } else if (event.button === 1) {
      event.preventDefault()
      // Middle button is the *only* world-orbit interaction. It always rotates
      // around the original diorama center, regardless of keyboard/free-flight movement.
      this.middleOrbitActive = true
      this.controls.target.copy(this.worldOrbitCenter)
      this.controls.update()
    }
  }
  private readonly onPointerMove = (event: PointerEvent) => {
    if (!this.freeLookActive) return
    event.preventDefault()
    const dx = event.clientX - this.pointerX
    const dy = event.clientY - this.pointerY
    this.pointerX = event.clientX
    this.pointerY = event.clientY
    this.lookTargetYaw -= dx * 0.0032
    this.lookTargetPitch = THREE.MathUtils.clamp(this.lookTargetPitch - dy * 0.0030, THREE.MathUtils.degToRad(-84), THREE.MathUtils.degToRad(84))
  }
  private readonly onPointerUp = (event: PointerEvent) => {
    if (event.button === 0 && this.freeLookActive) {
      this.freeLookActive = false
      try { this.renderer.domElement.releasePointerCapture?.(event.pointerId) } catch {}
    }
    if (event.button === 1 && this.middleOrbitActive) {
      this.middleOrbitActive = false
      this.syncFreeLookFromCamera()
      this.lookTargetYaw = this.freeYaw
      this.lookTargetPitch = this.freePitch
    }
  }
  private readonly onWheel = (event: WheelEvent) => {
    if (!this.pointerInside) return
    event.preventDefault()
    this.introTween?.kill()
    this.introTween = null
    this.autoTour?.kill()
    this.autoTour = null
    this.enterManualCamera()
    // A short inertial dolly, rather than a teleport on every mousewheel event.
    const impulse = THREE.MathUtils.clamp(Math.abs(event.deltaY) * 0.60, 24, 120)
    this.wheelVelocity = THREE.MathUtils.clamp(this.wheelVelocity + (event.deltaY > 0 ? -impulse : impulse), -140, 140)
  }
  private readonly onContextMenu = (event: MouseEvent) => event.preventDefault()
  private readonly onKeyDown = (event: KeyboardEvent) => {
    const moveKeys = new Set(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','ShiftLeft','ShiftRight','KeyR'])
    if (!moveKeys.has(event.code)) return
    const target = event.target as HTMLElement | null
    if (target && ['INPUT','TEXTAREA','SELECT'].includes(target.tagName)) return
    if (!this.pointerInside && document.activeElement !== this.renderer.domElement) return
    event.preventDefault()
    if (event.code === 'KeyR') {
      this.resetCamera(true)
      return
    }
    this.introTween?.kill()
    this.introTween = null
    this.autoTour?.kill()
    this.autoTour = null
    this.enterManualCamera()
    this.pressedKeys.add(event.code)
  }
  private readonly onKeyUp = (event: KeyboardEvent) => {
    if (this.pressedKeys.has(event.code)) event.preventDefault()
    this.pressedKeys.delete(event.code)
  }

  constructor(options: WorldRendererOptions) {
    this.options = options
    this.palette = getWorldPalette(options.style)
    this.random = seededRandom(stringSeed(`${options.travelId}-${options.style}-${options.bounds.southWestLng.toFixed(4)}`))
    this.noise2D = createNoise2D(this.random)
    this.toonGradient = this.createToonGradient()

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = options.style === 'NIGHT' ? 0.88 : 0.90
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.domElement.className = 'cartoon-world-canvas'
    this.renderer.domElement.tabIndex = 0
    this.renderer.domElement.setAttribute('aria-label', '3D 卡通世界：方向键移动，左键自由观察，中键环绕世界中心，空格上升，Shift下降')
    options.container.appendChild(this.renderer.domElement)
    this.renderer.domElement.addEventListener('pointerenter', this.onPointerEnter)
    this.renderer.domElement.addEventListener('pointerleave', this.onPointerLeave)
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown)
    this.renderer.domElement.addEventListener('pointermove', this.onPointerMove)
    window.addEventListener('pointerup', this.onPointerUp)
    this.renderer.domElement.addEventListener('wheel', this.onWheel, { passive: false })
    this.renderer.domElement.addEventListener('contextmenu', this.onContextMenu)
    window.addEventListener('keydown', this.onKeyDown, { passive: false })
    window.addEventListener('keyup', this.onKeyUp, { passive: false })

    this.labelRenderer.domElement.className = 'cartoon-world-labels'
    this.labelRenderer.domElement.style.position = 'absolute'
    this.labelRenderer.domElement.style.inset = '0'
    this.labelRenderer.domElement.style.pointerEvents = 'none'
    options.container.appendChild(this.labelRenderer.domElement)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.12
    this.controls.enablePan = false
    this.controls.enableZoom = false
    this.controls.enableRotate = true
    // Left button is reserved for first-person/free-look. Middle button alone
    // activates OrbitControls around the immutable worldOrbitCenter.
    this.controls.mouseButtons.LEFT = -1 as any
    this.controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE
    this.controls.mouseButtons.RIGHT = -1 as any
    this.controls.minDistance = 12
    this.controls.maxDistance = 220
    this.controls.minPolarAngle = THREE.MathUtils.degToRad(8)
    this.controls.maxPolarAngle = THREE.MathUtils.degToRad(88)
    this.controls.target.copy(this.worldOrbitCenter)

    // Composer 默认离屏缓冲不会继承 canvas antialias，显式启用 MSAA。
    const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType})
    target.samples=Math.min(4,this.renderer.capabilities.maxSamples)
    this.composer = new EffectComposer(this.renderer,target)
    const skyPass=new ShaderPass({
      uniforms:{tDiffuse:{value:null},top:{value:new THREE.Color(this.palette.skyTop)},bottom:{value:new THREE.Color(this.palette.skyBottom)},
        filmSky:{value:0}, sunScreen:{value:new THREE.Vector2(-10,-10)}},
      vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`varying vec2 vUv;uniform vec3 top;uniform vec3 bottom;uniform float filmSky;uniform vec2 sunScreen;
        void main(){
          vec3 color=mix(bottom,top,smoothstep(.12,1.,vUv.y));
          vec2 offset=(vUv-sunScreen)*vec2(1.0,1.45);
          float r=length(offset);
          float halo=exp(-r*8.0);
          float rays=pow(max(cos(atan(offset.y,offset.x)*7.0),0.0),14.0)*exp(-r*4.0);
          color+=vec3(1.0,.85,.72)*filmSky*(halo*.19+rays*.034);
          gl_FragColor=vec4(color,1.0);
        }`})
    this.composer.addPass(skyPass)
    const scenePass=new RenderPass(this.scene,this.camera);scenePass.clear=false;scenePass.clearDepth=true
    this.composer.addPass(scenePass)
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), options.style === 'NIGHT' ? 0.16 : 0.018, 0.30, 0.94)
    this.composer.addPass(bloom)
    const grade = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        saturation: { value: options.style === 'PAPER' ? 0.98 : 1.04 },
        warmth: { value: options.style === 'NIGHT' ? -0.015 : 0.012 },
        vignette: { value: 0.16 }
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform float saturation; uniform float warmth; uniform float vignette; varying vec2 vUv;
        void main(){
          vec4 c=texture2D(tDiffuse,vUv);
          float l=dot(c.rgb,vec3(.299,.587,.114));
          c.rgb=mix(vec3(l),c.rgb,saturation);
          c.r+=warmth; c.b-=warmth*.55;
          float d=distance(vUv,vec2(.5));
          c.rgb*=1.0-smoothstep(.34,.78,d)*vignette;
          gl_FragColor=c;
        }`
    })
    this.composer.addPass(grade)
    // Edge filtering belongs in linear render space, before final color output.
    this.antialiasPass = new ShaderPass(FXAAShader)
    this.composer.addPass(this.antialiasPass)
    this.composer.addPass(new OutputPass())

    try {
    this.scene.add(this.root)
    const lights = this.setupScene()
    this.buildWorld()
    this.visualModeController = new VisualModeController({
      scene: this.scene, root: this.root, renderer: this.renderer, camera: this.camera,
      skyPass, bloomPass: bloom, gradePass: grade, lights,
      palette: this.palette, style: this.options.style, lod: this.options.quality.id
    })
    void this.upgradeWithAssetModels()
    this.resetCamera(false)
    this.resize()
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(options.container)
    this.animate = this.animate.bind(this)
    this.frame = requestAnimationFrame(this.animate)
    this.playIntro()
    }catch(error){this.destroy();throw error}
  }

  private createToonGradient() {
    const data = new Uint8Array([48, 105, 170, 220, 255])
    const texture = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat)
    texture.minFilter = THREE.NearestFilter
    texture.magFilter = THREE.NearestFilter
    texture.needsUpdate = true
    this.disposeList.push(texture)
    return texture
  }

  private toonMaterial(color: string, extra: Partial<THREE.MeshToonMaterialParameters> = {}) {
    const material = new THREE.MeshToonMaterial({ color, gradientMap: this.toonGradient, ...extra })
    this.disposeList.push(material)
    return material
  }

  private standardMaterial(color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) {
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, ...extra })
    this.disposeList.push(material)
    return material
  }

  private rememberGeometry<T extends THREE.BufferGeometry>(geometry: T): T {
    this.disposeList.push(geometry)
    return geometry
  }

  private setupScene(): { sun: THREE.DirectionalLight; hemi: THREE.HemisphereLight; rim: THREE.DirectionalLight } {
    const top = this.palette.skyTop
    const bottom = this.palette.skyBottom
    this.options.container.style.background = `linear-gradient(180deg, ${top} 0%, ${bottom} 68%, ${bottom} 100%)`
    this.scene.background=null
    const fogDensity = this.options.quality.id === 'REGION' ? 0.0012 : this.options.quality.id === 'DISTRICT' ? 0.0014 : 0.0016
    this.scene.fog = new THREE.FogExp2(this.palette.skyBottom, this.options.style === 'NIGHT' ? fogDensity * 1.35 : fogDensity)

    const hemi = new THREE.HemisphereLight(this.palette.ambient, this.palette.groundSide, this.options.style === 'NIGHT' ? 0.96 : 0.92)
    this.scene.add(hemi)

    const sun = new THREE.DirectionalLight(this.palette.light, this.options.style === 'NIGHT' ? 1.85 : 2.2)
    sun.position.set(-28, 62, 34)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.camera.left = -74
    sun.shadow.camera.right = 74
    sun.shadow.camera.top = 54
    sun.shadow.camera.bottom = -54
    sun.shadow.camera.near = 1
    sun.shadow.camera.far = 160
    sun.shadow.bias = -0.0004
    sun.shadow.normalBias = 0.06
    this.scene.add(sun)

    const rim = new THREE.DirectionalLight(this.options.style === 'NIGHT' ? '#9cc6ff' : '#fff0f8', this.options.style === 'NIGHT' ? 0.62 : 0.34)
    rim.position.set(56, 28, -42)
    this.scene.add(rim)
    return { sun, hemi, rim }
  }

  private baseTerrainHeight(x: number, z: number) {
    const edge = Math.max(Math.abs(x) / (WORLD_WIDTH * 0.5), Math.abs(z) / (WORLD_DEPTH * 0.5))
    const edgeFade = THREE.MathUtils.smoothstep(edge, 0.76, 0.988)

    if (this.options.dem) {
      // Real DEM is already normalized into a miniature-friendly vertical range.
      // Fade only the outer rim to zero so the terrain seals cleanly into the diorama slab.
      return this.options.dem.sampleWorld(x, z) * (1 - edgeFade)
    }

    const n1 = this.noise2D(x * 0.035, z * 0.035)
    const n2 = this.noise2D(x * 0.085 + 9.2, z * 0.085 - 4.1)
    const interior = n1 * 0.62 + n2 * 0.18
    return interior * (1 - edgeFade)
  }

  private terrainHeight(x: number, z: number) {
    const base = this.baseTerrainHeight(x, z)
    // Sink the ground below water so the water surface never z-fights with the terrain.
    return this.isWaterAt(x, z, 0.15) ? base - 0.42 : base
  }

  private waterSurfaceHeight(x: number, z: number) {
    return this.baseTerrainHeight(x, z) - 0.08
  }

  private drapeGeometryY(geometry: THREE.BufferGeometry, heightAt: (x: number, z: number) => number) {
    const position = geometry.attributes.position as THREE.BufferAttribute | undefined
    if (!position) return
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i)
      const z = position.getZ(i)
      position.setY(i, heightAt(x, z))
    }
    position.needsUpdate = true
    geometry.computeVertexNormals()
  }

  private buildWorld() {
    const roads = this.options.osm.features.filter(f => f.kind === 'road')
    const buildings = this.options.osm.features.filter(f => f.kind === 'building')
    const waters = this.options.osm.features.filter(f => f.kind === 'water')
    const parks = this.options.osm.features.filter(f => f.kind === 'park')

    // Prepare spatial masks BEFORE generating terrain/buildings/trees.
    // This is the key fix that prevents scenery from spawning in water.
    this.prepareSpatialMasks(waters, roads)

    this.buildDioramaBase()
    this.buildTerrain()

    if (waters.length) this.buildOsmWater(waters)
    else if (this.options.osm.source === 'PROCEDURAL') this.buildProceduralRiver()
    this.buildShoreDetails()

    if (roads.length) this.buildOsmRoads(roads)
    else if (this.options.osm.source === 'PROCEDURAL') this.buildProceduralRoads()

    if (parks.length) this.buildParks(parks)
    if (buildings.length) this.buildOsmBuildings(buildings)
    this.buildProceduralBuildings(buildings.length)
    if (this.options.osm.source === 'PROCEDURAL') this.buildMountains()
    this.buildForests(parks)
    this.buildStreetDetails()
    this.buildMemoriesAndRoute()
  }

  private prepareSpatialMasks(waters: OsmFeature[], roads: OsmFeature[]) {
    this.waterAreas.length = 0
    this.waterCorridors.length = 0
    this.roadCorridors.length = 0

    // Phase 2.8 topology rule: every closed water body is first converted into
    // one common polygon topology. Overlapping lake/reservoir relations are unioned,
    // and relation inner-rings remain land islands. This is the single source of truth
    // used by terrain cutting, water meshes and scenery rejection.
    const rawWaterAreas: PolygonArea[] = []
    waters.forEach(feature => {
      const projected = projectFeature(feature, this.options.bounds)
      if (projected.length < 2) return
      if (isClosed(feature) && projected.length >= 3) {
        rawWaterAreas.push({
          outer: projected,
          holes: projectFeatureHoles(feature, this.options.bounds)
        })
      } else {
        clipPolylineToWorld(projected).forEach(points => {
          this.waterCorridors.push({ points, halfWidth: feature.tags.waterway === 'river' ? 2.2 : 1.45 })
        })
      }
    })

    const clippedWater = clipAreasToRect(
      rawWaterAreas,
      CLIP_MIN_X, CLIP_MAX_X, CLIP_MIN_Z, CLIP_MAX_Z
    )
    this.waterAreas.push(...unionAreas(clippedWater))

    if (!waters.length && this.options.osm.source === 'PROCEDURAL') {
      this.waterCorridors.push({
        halfWidth: 5.15,
        points: [
          { x: -WORLD_WIDTH * 0.55, z: -WORLD_DEPTH * 0.08 },
          { x: -34, z: -9 }, { x: -14, z: 1 }, { x: 8, z: 6 }, { x: 28, z: 2 },
          { x: WORLD_WIDTH * 0.55, z: 12 }
        ]
      })
    }

    const roadWidth: Record<string, number> = { motorway: 2.0, trunk: 1.8, primary: 1.55, secondary: 1.3, tertiary: 1.05, residential: 0.82 }
    roads.forEach(feature => {
      const projected = projectFeature(feature, this.options.bounds)
      if (projected.length < 2) return
      const highway = feature.tags.highway || 'road'
      const explicitBridge = isExplicitBridge(feature.tags)
      clipPolylineToWorld(projected).forEach(points => {
        let samples = 0
        let waterSamples = 0
        for (let i = 1; i < points.length; i += 1) {
          const a = points[i - 1]!
          const b = points[i]!
          const steps = Math.max(2, Math.min(8, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.9)))
          for (let j = 0; j <= steps; j += 1) {
            const t = j / steps
            const x = a.x + (b.x - a.x) * t
            const z = a.z + (b.z - a.z) * t
            samples += 1
            if (this.isWaterAt(x, z, 0.02)) waterSamples += 1
          }
        }
        const waterRatio = samples ? waterSamples / samples : 0
        // Missing bridge tags exist in real OSM data. A short road crossing water with
        // land on both sides is visually safer as an inferred bridge than as a broken road.
        const inferredBridge = !explicitBridge
          && waterRatio > 0.04
          && waterRatio < 0.72
          && !this.isWaterAt(points[0]!.x, points[0]!.z, 0.02)
          && !this.isWaterAt(points[points.length - 1]!.x, points[points.length - 1]!.z, 0.02)
        this.roadCorridors.push({
          points,
          halfWidth: roadWidth[highway] || 0.82,
          bridge: explicitBridge,
          inferredBridge,
          highway,
          featureId: feature.id
        })
      })
    })

    if (roads.length) this.snapRoadEndpoints(this.options.quality.id === 'LOCAL' ? 0.13 : this.options.quality.id === 'DISTRICT' ? 0.10 : 0.08)

    if (!roads.length && this.options.osm.source === 'PROCEDURAL') {
      ;[
        [{ x: -50, z: 22 }, { x: -25, z: 10 }, { x: -2, z: 8 }, { x: 23, z: 2 }, { x: 50, z: -16 }],
        [{ x: -46, z: -18 }, { x: -23, z: -12 }, { x: 3, z: -16 }, { x: 25, z: -9 }, { x: 48, z: 7 }],
        [{ x: -15, z: -33 }, { x: -10, z: -10 }, { x: -6, z: 9 }, { x: 4, z: 31 }],
        [{ x: 32, z: -30 }, { x: 24, z: -12 }, { x: 22, z: 9 }, { x: 29, z: 31 }]
      ].forEach((points, index) => this.roadCorridors.push({
        points, halfWidth: index < 2 ? 1.45 : 1.05, bridge: false, inferredBridge: false, highway: 'procedural', featureId: -100-index
      }))
    }
  }

  private snapRoadEndpoints(maxDistance: number) {
    type Cluster = { x: number; z: number; refs: VecXZ[] }
    const cellSize = maxDistance
    const grid = new Map<string, Cluster[]>()
    const endpoints: VecXZ[] = []
    this.roadCorridors.forEach(corridor => {
      if (corridor.points.length < 2) return
      endpoints.push(corridor.points[0]!, corridor.points[corridor.points.length - 1]!)
    })
    const cellKey = (x: number, z: number) => `${Math.floor(x / cellSize)}:${Math.floor(z / cellSize)}`
    for (const point of endpoints) {
      const cx = Math.floor(point.x / cellSize)
      const cz = Math.floor(point.z / cellSize)
      let best: Cluster | null = null
      let bestDistance = maxDistance
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          for (const cluster of grid.get(`${cx + dx}:${cz + dz}`) || []) {
            const distance = Math.hypot(point.x - cluster.x, point.z - cluster.z)
            if (distance < bestDistance) { best = cluster; bestDistance = distance }
          }
        }
      }
      if (best) {
        best.refs.push(point)
        best.x = best.refs.reduce((sum, ref) => sum + ref.x, 0) / best.refs.length
        best.z = best.refs.reduce((sum, ref) => sum + ref.z, 0) / best.refs.length
        best.refs.forEach(ref => { ref.x = best!.x; ref.z = best!.z })
      } else {
        const cluster: Cluster = { x: point.x, z: point.z, refs: [point] }
        const key = cellKey(point.x, point.z)
        const list = grid.get(key) || []
        list.push(cluster)
        grid.set(key, list)
      }
    }
  }

  private corridorContains(point: VecXZ, corridor: CorridorMask, margin = 0) {
    for (let i = 1; i < corridor.points.length; i += 1) {
      if (distanceToSegment(point, corridor.points[i - 1]!, corridor.points[i]!) <= corridor.halfWidth + margin) return true
    }
    return false
  }

  private isClosedWaterAt(x: number, z: number) {
    const p = { x, z }
    return this.waterAreas.some(area => pointInArea(p, area))
  }

  private isWaterAt(x: number, z: number, margin = 0) {
    if (this.isClosedWaterAt(x, z)) return true
    const p = { x, z }
    return this.waterCorridors.some(corridor => this.corridorContains(p, corridor, margin))
  }

  private isRoadAt(x: number, z: number, margin = 0) {
    const p = { x, z }
    return this.roadCorridors.some(corridor => this.corridorContains(p, corridor, margin))
  }

  private canPlaceScenery(x: number, z: number, radius = 0.8) {
    if (this.isWaterAt(x, z, radius)) return false
    if (this.isRoadAt(x, z, radius * 0.6)) return false
    return Math.abs(x) < WORLD_WIDTH * 0.47 && Math.abs(z) < WORLD_DEPTH * 0.46
  }

  private buildDioramaBase() {
    // 轻薄、完整的微缩底座；不再放置会露出矩形边缘的巨大背景平面。
    const color=new THREE.Color(this.palette.groundSide).lerp(new THREE.Color(this.palette.skyBottom),.55)
    const base=new THREE.Mesh(this.rememberGeometry(new RoundedBoxGeometry(WORLD_WIDTH+4,2.5,WORLD_DEPTH+4,5,1.3)),
      this.standardMaterial('#'+color.getHexString(),{roughness:1}))
    base.position.y=-2.15;base.receiveShadow=true;base.castShadow=true;this.root.add(base)
    const cap=new THREE.Mesh(this.rememberGeometry(new RoundedBoxGeometry(WORLD_WIDTH+2.5,.35,WORLD_DEPTH+2.5,4,.6)),this.toonMaterial(this.palette.groundAccent))
    cap.position.y=-.7;cap.receiveShadow=true;this.root.add(cap)
    // A single stitched perimeter closes all four sides and corners. The old
    // independent side planes left tiny corner seams visible at steep camera angles.
    const sealGeometry = this.rememberGeometry(buildDioramaEdgeSeal({
      width: WORLD_WIDTH + 2, depth: WORLD_DEPTH + 2,
      topColor: this.palette.groundAccent, bottomColor: this.palette.groundSide,
      heightAt: (x, z) => this.baseTerrainHeight(x, z), bottomY: -0.82
    }))
    const seal = new THREE.Mesh(sealGeometry, this.standardMaterial('#ffffff', {
      vertexColors: true, side: THREE.DoubleSide, roughness: 1, metalness: 0
    }))
    seal.receiveShadow = true
    seal.name = 'stitched-diorama-perimeter'
    this.root.add(seal)
    // v3.4 already removed the opaque tabletop. This adds a small, feathered
    // pedestal shadow, terrain-aware perimeter mist, and sparse upper wisps.
    this.atmosphere = createDioramaAtmosphere({
      width: WORLD_WIDTH,
      depth: WORLD_DEPTH,
      palette: this.palette,
      night: this.options.style === 'NIGHT',
      heightAt: (x, z) => this.baseTerrainHeight(x, z)
    })
    this.root.add(this.atmosphere.group)
  }

  private buildTerrain() {
    const segX = this.options.quality.id === 'LOCAL' ? 132 : this.options.quality.id === 'DISTRICT' ? 108 : 84
    const segZ = this.options.quality.id === 'LOCAL' ? 88 : this.options.quality.id === 'DISTRICT' ? 72 : 56
    const geometry = this.rememberGeometry(new THREE.PlaneGeometry(WORLD_WIDTH + 2, WORLD_DEPTH + 2, segX, segZ))
    geometry.rotateX(-Math.PI / 2)
    const position = geometry.attributes.position as THREE.BufferAttribute
    const colors: number[] = []
    const base = new THREE.Color(this.palette.ground)
    const accent = new THREE.Color(this.palette.groundAccent)
    const cool = new THREE.Color(this.palette.treeLight)
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i)
      const z = position.getZ(i)
      const baseY = this.baseTerrainHeight(x, z)
      const y = this.isWaterAt(x, z, 0.0) ? baseY - 0.46 : baseY
      position.setY(i, y)
      const patch = (this.noise2D(x * 0.045 + 12.7, z * 0.045 - 4.3) + 1) * 0.5
      const c = base.clone().lerp(patch > 0.63 ? cool : accent, patch > 0.63 ? 0.16 : 0.10)
      if (this.options.dem && this.options.dem.verticalRange > 0.01) {
        const h = THREE.MathUtils.clamp(y / this.options.dem.verticalRange, 0, 1)
        const high = new THREE.Color(this.palette.mountainLight)
        const ridge = THREE.MathUtils.smoothstep(h, 0.42, 0.92) * 0.32 * this.options.quality.terrainEmphasis
        c.lerp(high, ridge)
      }
      colors.push(c.r, c.g, c.b)
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))

    // Phase 2.8: the land surface and water no longer overlap. The terrain grid is
    // physically cut underneath the exact unified water topology. This removes the
    // "two stickers fighting for the same pixels" look at coastlines and reservoirs.
    const index = geometry.index
    if (index && (this.waterAreas.length || this.waterCorridors.length)) {
      const kept: number[] = []
      for (let i = 0; i < index.count; i += 3) {
        const ia = index.getX(i)
        const ib = index.getX(i + 1)
        const ic = index.getX(i + 2)
        const ax = position.getX(ia), az = position.getZ(ia)
        const bx = position.getX(ib), bz = position.getZ(ib)
        const cx = position.getX(ic), cz = position.getZ(ic)
        const mx = (ax + bx + cx) / 3
        const mz = (az + bz + cz) / 3
        if (this.isWaterAt(mx, mz, 0.0)) continue
        kept.push(ia, ib, ic)
      }
      geometry.setIndex(kept)
    }

    geometry.computeVertexNormals()
    const material = this.toonMaterial('#ffffff', { vertexColors: true })
    const terrain = new THREE.Mesh(geometry, material)
    terrain.receiveShadow = true
    terrain.castShadow = false
    this.root.add(terrain)
  }

  private buildOsmWater(features: OsmFeature[]) {
    const waterMaterial = this.standardMaterial(this.palette.water, {
      transparent: true,
      opacity: 0.975,
      roughness: 0.28,
      metalness: 0.01,
      depthWrite: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      emissive: new THREE.Color(this.palette.waterDeep),
      emissiveIntensity: this.options.style === 'NIGHT' ? 0.22 : 0.025
    })
    const shoreMaterial = this.toonMaterial(this.palette.groundAccent)
    waterMaterial.name = 'tm-world-water'
    const waterOutlineMaterial = new THREE.LineBasicMaterial({ color: this.palette.waterDeep, transparent: true, opacity: 0.46 })
    this.disposeList.push(waterOutlineMaterial)

    // Closed lakes/reservoirs are rendered from the exact same *unioned* topology
    // used to cut the land surface. Holes remain dry land islands.
    this.waterAreas.forEach(area => {
      const shape = new THREE.Shape()
      shape.moveTo(area.outer[0]!.x, -area.outer[0]!.z)
      area.outer.slice(1).forEach(p => shape.lineTo(p.x, -p.z))
      area.holes.forEach(hole => {
        const path = new THREE.Path()
        path.moveTo(hole[0]!.x, -hole[0]!.z)
        hole.slice(1).forEach(p => path.lineTo(p.x, -p.z))
        shape.holes.push(path)
      })

      const geometry = this.rememberGeometry(new THREE.ShapeGeometry(shape))
      geometry.rotateX(-Math.PI / 2)
      const heights = area.outer
        .filter((_, i) => i % Math.max(1, Math.floor(area.outer.length / 18)) === 0)
        .map(p => this.baseTerrainHeight(p.x, p.z))
        .sort((a, b) => a - b)
      const median = heights.length ? heights[Math.floor(heights.length * 0.5)]! : this.baseTerrainHeight(area.outer[0]!.x, area.outer[0]!.z)
      const waterLevel = median - 0.10
      this.drapeGeometryY(geometry, () => waterLevel)
      const mesh = new THREE.Mesh(geometry, waterMaterial)
      mesh.userData.tmShoreArea = area
      mesh.userData.tmWaterLevel = waterLevel
      // Signed polygon area minus holes determines the dominant reflective lake.
      mesh.userData.tmWaterArea = Math.max(0,
        Math.abs(THREE.ShapeUtils.area(area.outer.map(p => new THREE.Vector2(p.x, p.z)))) -
        area.holes.reduce((sum, hole) => sum + Math.abs(THREE.ShapeUtils.area(hole.map(p => new THREE.Vector2(p.x, p.z)))), 0))
      mesh.receiveShadow = true
      mesh.renderOrder = 2
      this.root.add(mesh)

      if (roadRenderPolicy(this.options.quality.id).showWaterOutlines) [area.outer, ...area.holes].forEach(ring => {
        const lineGeometry = this.rememberGeometry(new THREE.BufferGeometry().setFromPoints(
          ring.map(p => new THREE.Vector3(p.x, waterLevel + 0.045, p.z))
        ))
        const outline = new THREE.LineLoop(lineGeometry, waterOutlineMaterial)
        outline.renderOrder = 3
        this.root.add(outline)
      })
    })

    // Open waterways remain ribbons, but the terrain below them has already been cut.
    features.filter(feature => !isClosed(feature)).slice(0, this.options.quality.waterLimit).forEach(feature => {
      const projected = projectFeature(feature, this.options.bounds)
      if (projected.length < 2) return
      clipPolylineToWorld(projected).forEach(pts => {
        const dense = this.densifyRoad(pts, 0.46)
        const visibleRuns: VecXZ[][] = []
        let current: VecXZ[] = []
        dense.forEach(point => {
          if (this.isClosedWaterAt(point.x, point.z)) {
            if (current.length >= 2) visibleRuns.push(current)
            current = []
          } else {
            current.push(point)
          }
        })
        if (current.length >= 2) visibleRuns.push(current)

        visibleRuns.forEach(samples => {
          const waterHalf = feature.tags.waterway === 'river' ? 2.15 : 1.38
          const shore = new THREE.Mesh(
            this.createRibbon(samples, waterHalf + 0.30, (x, z) => this.waterSurfaceHeight(x, z) - 0.13),
            shoreMaterial
          )
          const ribbon = this.createRibbon(samples, waterHalf, (x, z) => this.waterSurfaceHeight(x, z))
          const mesh = new THREE.Mesh(ribbon, waterMaterial)
          mesh.renderOrder = 2
          this.root.add(shore, mesh)
        })
      })
    })
  }

  private buildProceduralRiver() {
    const points = [
      new THREE.Vector3(-WORLD_WIDTH * 0.55, 0.08, -WORLD_DEPTH * 0.08),
      new THREE.Vector3(-34, 0.08, -9),
      new THREE.Vector3(-14, 0.08, 1),
      new THREE.Vector3(8, 0.08, 6),
      new THREE.Vector3(28, 0.08, 2),
      new THREE.Vector3(WORLD_WIDTH * 0.55, 0.08, 12)
    ]
    const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.32)
    const geometry = this.createRibbon(curve.getPoints(100).map(p => ({ x: p.x, y: p.y, z: p.z })), 4.6, (x, z) => this.waterSurfaceHeight(x, z))
    const river = new THREE.Mesh(geometry, this.standardMaterial(this.palette.water, {
      roughness: 0.38,
      metalness: 0.03,
      transparent: true,
      opacity: 0.94,
      emissive: new THREE.Color(this.palette.waterDeep),
      emissiveIntensity: 0.08
    }))
    river.receiveShadow = true
    // Procedural preview water participates in the same reversible film shader.
    ;(river.material as THREE.Material).name = 'tm-world-water'
    this.root.add(river)

    const sandGeometry = this.createRibbon(curve.getPoints(100).map(p => ({ x: p.x, y: p.y, z: p.z })), 5.8, (x, z) => this.waterSurfaceHeight(x, z) - 0.11)
    const sand = new THREE.Mesh(sandGeometry, this.toonMaterial(this.palette.groundAccent))
    sand.renderOrder = -1
    this.root.add(sand)
  }

  private densifyRoad(points: VecXZ[], spacing = 0.52) {
    const result: VecXZ[] = []
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1]!
      const b = points[i]!
      const distance = Math.hypot(b.x - a.x, b.z - a.z)
      const steps = Math.max(1, Math.ceil(distance / spacing))
      if (!result.length) result.push({ ...a })
      for (let j = 1; j <= steps; j += 1) {
        const t = j / steps
        result.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })
      }
    }
    return result
  }

  private splitRoadByWater(corridor: RoadCorridor) {
    const dense = this.densifyRoad(corridor.points)
    if (dense.length < 2) return [] as Array<{ bridge: boolean; points: VecXZ[] }>
    const water = dense.map(p => this.isWaterAt(p.x, p.z, 0.02))

    if (corridor.bridge) return [{ bridge: true, points: dense }]

    // Inferred bridge: preserve continuity only when the water crossing is bounded by land.
    // A way that starts/ends in water is treated as bad/partial data and the submerged tail
    // is omitted instead of drawing a road across an entire lake.
    const bridgeMask = new Array(dense.length).fill(false)
    if (corridor.inferredBridge) {
      for (let i = 0; i < water.length; i += 1) {
        if (!water[i]) continue
        bridgeMask[i] = true
        if (i > 0) bridgeMask[i - 1] = true
        if (i + 1 < water.length) bridgeMask[i + 1] = true
      }
    }

    const spans: Array<{ bridge: boolean; points: VecXZ[] }> = []
    let current: { bridge: boolean; points: VecXZ[] } | null = null
    for (let i = 0; i < dense.length; i += 1) {
      const submergedInvalid = water[i] && !bridgeMask[i]
      if (submergedInvalid) {
        if (current && current.points.length >= 2) spans.push(current)
        current = null
        continue
      }
      const mode = bridgeMask[i]
      if (!current || current.bridge !== mode) {
        if (current && current.points.length >= 2) spans.push(current)
        current = { bridge: mode, points: [] }
        if (i > 0 && !submergedInvalid && dense[i - 1]) current.points.push({ ...dense[i - 1]! })
      }
      current.points.push({ ...dense[i]! })
    }
    if (current && current.points.length >= 2) spans.push(current)
    return spans
  }

  private elevateBridge(points: VecXZ[]) {
    if (points.length < 2) return [] as Array<VecXZ & { y: number }>
    const startGround = this.baseTerrainHeight(points[0]!.x, points[0]!.z) + 0.32
    const endGround = this.baseTerrainHeight(points[points.length - 1]!.x, points[points.length - 1]!.z) + 0.32
    const waterClearance = points.reduce((max, p) => Math.max(max, this.waterSurfaceHeight(p.x, p.z) + 0.78), -Infinity)
    const deck = Math.max(startGround, endGround, waterClearance)
    return points.map((p, index) => {
      const t = points.length <= 1 ? 0 : index / (points.length - 1)
      const ramp = Math.min(1, Math.min(t, 1 - t) / 0.18)
      const ground = THREE.MathUtils.lerp(startGround, endGround, t)
      return { ...p, y: THREE.MathUtils.lerp(ground, deck, THREE.MathUtils.smoothstep(ramp, 0, 1)) }
    })
  }

  private addBridgePiers(points: Array<VecXZ & { y: number }>) {
    if (points.length < 4) return
    const pierMaterial = this.toonMaterial(this.palette.groundSide)
    const pierGeometry = this.rememberGeometry(new RoundedBoxGeometry(0.24, 1, 0.24, 2, 0.05))
    const every = Math.max(3, Math.floor(points.length / 5))
    for (let i = every; i < points.length - every / 2; i += every) {
      const p = points[i]!
      if (!this.isWaterAt(p.x, p.z, 0.06)) continue
      const water = this.waterSurfaceHeight(p.x, p.z)
      const height = Math.max(0.35, p.y - water)
      const pier = new THREE.Mesh(pierGeometry, pierMaterial)
      pier.scale.y = height
      pier.position.set(p.x, water + height * 0.5, p.z)
      pier.castShadow = true
      pier.receiveShadow = true
      this.root.add(pier)
    }
  }

  /** 将布尔合并后的道路拓扑铺到 DEM 上；细分长三角形避免穿地。 */
  private addRoadSurface(areas:PolygonArea[],height:number,material:THREE.Material){
    const policy = roadRenderPolicy(this.options.quality.id)
    let skipped = 0
    for(const area of areas){
      try {
      const shape=new THREE.Shape(area.outer.map(p=>new THREE.Vector2(p.x,-p.z)))
      area.holes.forEach(r=>shape.holes.push(new THREE.Path(r.map(p=>new THREE.Vector2(p.x,-p.z)))))
      const flat=new THREE.ShapeGeometry(shape);flat.rotateX(-Math.PI/2)
      const attr=flat.getAttribute('position'),index=flat.index
      const vertices:number[]=[]
      const emit=(a:VecXZ,b:VecXZ,c:VecXZ,depth:number)=>{
        const longest=Math.max(Math.hypot(a.x-b.x,a.z-b.z),Math.hypot(b.x-c.x,b.z-c.z),Math.hypot(c.x-a.x,c.z-a.z))
        if(longest>policy.maximumTriangleEdge&&depth<8&&vertices.length<policy.maximumVerticesPerArea){
          const ab={x:(a.x+b.x)/2,z:(a.z+b.z)/2},bc={x:(b.x+c.x)/2,z:(b.z+c.z)/2},ca={x:(c.x+a.x)/2,z:(c.z+a.z)/2}
          emit(a,ab,ca,depth+1);emit(ab,b,bc,depth+1);emit(ca,bc,c,depth+1);emit(ab,bc,ca,depth+1);return
        }
        for(const p of [a,b,c])vertices.push(p.x,this.baseTerrainHeight(p.x,p.z)+height,p.z)
      }
      const count=index?.count || attr.count
      for(let i=0;i<count;i+=3){const ids=[0,1,2].map(k=>index?index.getX(i+k):i+k);const pts=ids.map(n=>({x:attr.getX(n),z:attr.getZ(n)}));emit(pts[0]!,pts[1]!,pts[2]!,0)}
      flat.dispose()
      if(vertices.length<9) continue
      const geometry=this.rememberGeometry(new THREE.BufferGeometry());geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals()
      const mesh=new THREE.Mesh(geometry,material);mesh.receiveShadow=false;mesh.renderOrder=height>.25?5:4;this.root.add(mesh)
      } catch (error) {
        // One malformed OSM surface must not prevent the rest of the diorama loading.
        skipped++
      }
    }
    if(skipped) console.warn(`[Travel Memory] Skipped ${skipped} malformed road surface polygons.`)
  }

  private buildOsmRoads(_features: OsmFeature[]) {
    const roadMaterial=this.standardMaterial(this.palette.road,{roughness:1,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2})
    const edgeMaterial=this.standardMaterial(this.palette.roadEdge,{roughness:1,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1})
    const bridgeMaterial=this.standardMaterial(this.options.style==='NIGHT'?'#d7dce8':'#f4eee3',{polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3})
    const ground:SurfaceRoad[]=[]
    this.roadCorridors.slice(0,this.options.quality.roadLimit).forEach(corridor=>{
      this.splitRoadByWater(corridor).forEach(span=>{
        if(span.points.length<2)return
        if(span.bridge){
          const elevated=this.elevateBridge(span.points)
          if (elevated.length >= 2) this.bridgeDecks.push({ points: elevated, halfWidth: corridor.halfWidth })
          const edge=new THREE.Mesh(this.createRibbon(elevated.map(p=>({...p,y:p.y-.10})),corridor.halfWidth+.18,()=>0),edgeMaterial)
          const road=new THREE.Mesh(this.createRibbon(elevated,corridor.halfWidth,()=>0),bridgeMaterial)
          edge.renderOrder=5;road.renderOrder=6;road.castShadow=true;this.root.add(edge,road);this.addBridgePiers(elevated)
        }else ground.push({points:span.points,halfWidth:corridor.halfWidth})
      })
    })
    // Far distance: only draw major-road shoulders to prevent high-frequency shimmer.
    const policy = roadRenderPolicy(this.options.quality.id)
    const shoulderRoads = ground.filter(road => road.halfWidth >= policy.minimumShoulderWidth)
    if (shoulderRoads.length) {
      try { this.addRoadSurface(buildRoadSurface(shoulderRoads, .16), .18, edgeMaterial) }
      catch (error) { console.warn('[Travel Memory] Shoulder detail omitted; road graph remains available.', error) }
    }
    try {
      this.addRoadSurface(buildRoadSurface(ground), .32, roadMaterial)
    } catch (error) {
      // If a rare sweep-line case survives polygon-clipping's local recovery,
      // preserve the road graph, route playback and the remaining terrain.
      console.warn('[Travel Memory] Road mesh union failed; keeping road corridors for navigation.', error)
      for (const corridor of ground.slice(0, 120)) {
        try {
          const samples = this.densifyRoad(corridor.points, 0.8)
          const fallback = new THREE.Mesh(this.createRibbon(samples, corridor.halfWidth,
            (x, z) => this.baseTerrainHeight(x, z) + 0.32), roadMaterial)
          fallback.renderOrder = 5
          this.root.add(fallback)
        } catch { /* Local incomplete data: preserve the rest of the world. */ }
      }
    }
  }

  private buildProceduralRoads() {
    const roadMaterial = this.toonMaterial(this.palette.road)
    const edgeMaterial = this.toonMaterial(this.palette.roadEdge)
    const routes: VecXZ[][] = [
      [{ x: -50, z: 22 }, { x: -25, z: 10 }, { x: -2, z: 8 }, { x: 23, z: 2 }, { x: 50, z: -16 }],
      [{ x: -46, z: -18 }, { x: -23, z: -12 }, { x: 3, z: -16 }, { x: 25, z: -9 }, { x: 48, z: 7 }],
      [{ x: -15, z: -33 }, { x: -10, z: -10 }, { x: -6, z: 9 }, { x: 4, z: 31 }],
      [{ x: 32, z: -30 }, { x: 24, z: -12 }, { x: 22, z: 9 }, { x: 29, z: 31 }]
    ]
    routes.forEach((pts, index) => {
      const curve = this.curveFromXZ(pts, 0)
      if (!curve) return
      const samples = curve.getPoints(72)
      const width = index < 2 ? 1.05 : 0.72
      this.root.add(
        new THREE.Mesh(this.createRibbon(samples, width + 0.24, (x, z) => this.terrainHeight(x, z) + 0.18), edgeMaterial),
        new THREE.Mesh(this.createRibbon(samples, width, (x, z) => this.terrainHeight(x, z) + 0.23), roadMaterial)
      )
    })
  }

  /** Project a journey point onto the actual elevated bridge deck, including ramps. */
  private bridgeRoadHeight(x: number, z: number): number | null {
    let best = Infinity
    let height: number | null = null
    for (const deck of this.bridgeDecks) {
      for (let i = 1; i < deck.points.length; i++) {
        const a = deck.points[i - 1]!
        const b = deck.points[i]!
        const dx = b.x - a.x
        const dz = b.z - a.z
        const len2 = dx * dx + dz * dz
        if (len2 < 1e-8) continue
        const t = THREE.MathUtils.clamp(((x - a.x) * dx + (z - a.z) * dz) / len2, 0, 1)
        const d2 = (x - a.x - dx * t) ** 2 + (z - a.z - dz * t) ** 2
        if (d2 <= (deck.halfWidth + 0.45) ** 2 && d2 < best) {
          best = d2
          height = THREE.MathUtils.lerp(a.y, b.y, t)
        }
      }
    }
    return height
  }

  private buildShoreDetails() {
    const shorePoints: VecXZ[] = []
    const pushShore = (x: number, z: number) => {
      if (shorePoints.length >= 84) return
      if (Math.abs(x) > WORLD_WIDTH * 0.49 || Math.abs(z) > WORLD_DEPTH * 0.48) return
      if (this.isWaterAt(x, z, 0.02) || this.isRoadAt(x, z, 0.15)) return
      if (shorePoints.some(p => Math.hypot(p.x - x, p.z - z) < 1.25)) return
      shorePoints.push({ x, z })
    }

    this.waterCorridors.forEach(corridor => {
      corridor.points.forEach((a, i) => {
        if (i === 0 || i % 2 === 0) return
        const b = corridor.points[i - 1]!
        const dx = a.x - b.x
        const dz = a.z - b.z
        const len = Math.hypot(dx, dz) || 1
        const nx = -dz / len
        const nz = dx / len
        const mx = (a.x + b.x) * 0.5
        const mz = (a.z + b.z) * 0.5
        const offset = corridor.halfWidth + 0.42 + this.random() * 0.42
        pushShore(mx + nx * offset, mz + nz * offset)
        pushShore(mx - nx * offset, mz - nz * offset)
      })
    })

    this.waterAreas.forEach(area => {
      ;[area.outer, ...area.holes].forEach(poly => {
        for (let i = 0; i < poly.length && shorePoints.length < 84; i += Math.max(1, Math.floor(poly.length / 18))) {
          const a = poly[i]!
          const b = poly[(i + 1) % poly.length]!
          const dx = b.x - a.x
          const dz = b.z - a.z
          const len = Math.hypot(dx, dz) || 1
          const nx = -dz / len
          const nz = dx / len
          const mx = (a.x + b.x) * 0.5
          const mz = (a.z + b.z) * 0.5
          const d = 0.52
          const c1 = { x: mx + nx * d, z: mz + nz * d }
          const c2 = { x: mx - nx * d, z: mz - nz * d }
          pushShore(this.isWaterAt(c1.x, c1.z) ? c2.x : c1.x, this.isWaterAt(c1.x, c1.z) ? c2.z : c1.z)
        }
      })
    })

    if (!shorePoints.length) return
    const rockGeo = this.rememberGeometry(new THREE.DodecahedronGeometry(0.28, 0))
    const rock = new THREE.InstancedMesh(rockGeo, this.toonMaterial(this.palette.rock), shorePoints.length)
    const reedGeo = this.rememberGeometry(new THREE.CylinderGeometry(0.035, 0.055, 0.72, 5))
    const reed = new THREE.InstancedMesh(reedGeo, this.toonMaterial(this.palette.treeDark), shorePoints.length)
    const dummy = new THREE.Object3D()
    shorePoints.forEach((p, i) => {
      const y = this.terrainHeight(p.x, p.z)
      const scale = 0.65 + this.random() * 0.8
      dummy.position.set(p.x, y + 0.2, p.z)
      dummy.rotation.set(this.random() * 0.25, this.random() * Math.PI, this.random() * 0.25)
      dummy.scale.set(scale * 1.35, scale * 0.7, scale)
      dummy.updateMatrix(); rock.setMatrixAt(i, dummy.matrix)
      dummy.position.set(p.x + 0.22, y + 0.38, p.z - 0.14)
      dummy.rotation.set(0, this.random() * Math.PI, (this.random() - 0.5) * 0.18)
      dummy.scale.setScalar(0.7 + this.random() * 0.7)
      dummy.updateMatrix(); reed.setMatrixAt(i, dummy.matrix)
    })
    rock.castShadow = true
    rock.receiveShadow = true
    reed.castShadow = true
    rock.instanceMatrix.needsUpdate = true
    reed.instanceMatrix.needsUpdate = true
    this.root.add(rock, reed)
  }

  private buildStreetDetails() {
    if (!this.options.quality.streetFurniture) return
    type StreetPoint = { x: number; z: number; angle: number }
    const lamps: StreetPoint[] = []
    const benches: StreetPoint[] = []
    const shrubs: StreetPoint[] = []
    const roadTrees: StreetPoint[] = []

    const occupiedNearby = (x: number, z: number, radius: number) =>
      this.occupiedBuildings.some(p => Math.hypot(p.x - x, p.z - z) < radius)

    for (const corridor of this.roadCorridors) {
      if (corridor.points.length < 2) continue
      for (let i = 1; i < corridor.points.length; i += 1) {
        const a = corridor.points[i - 1]!
        const b = corridor.points[i]!
        const dx = b.x - a.x
        const dz = b.z - a.z
        const len = Math.hypot(dx, dz) || 1
        if (len < 1.7) continue
        const nx = -dz / len
        const nz = dx / len
        const angle = Math.atan2(dx, dz)
        const segments = Math.max(1, Math.min(4, Math.floor(len / 4.2)))

        for (let seg = 0; seg < segments; seg += 1) {
          const t = (seg + 0.5) / segments
          const mx = a.x + dx * t
          const mz = a.z + dz * t
          const side = ((i + seg + lamps.length) % 2 === 0 ? 1 : -1)
          const baseOffset = corridor.halfWidth + 0.60

          if (lamps.length < 64 && (i + seg) % 2 === 0) {
            const x = mx + nx * baseOffset * side
            const z = mz + nz * baseOffset * side
            if (!this.isWaterAt(x, z, 0.24) && !occupiedNearby(x, z, 0.48) && Math.abs(x) < WORLD_WIDTH * 0.47 && Math.abs(z) < WORLD_DEPTH * 0.46) {
              lamps.push({ x, z, angle })
            }
          }

          if (benches.length < 30 && (i + seg) % 5 === 0) {
            const offset = corridor.halfWidth + 1.05
            const x = mx - nx * offset * side
            const z = mz - nz * offset * side
            if (this.canPlaceScenery(x, z, 0.42) && !occupiedNearby(x, z, 0.72)) benches.push({ x, z, angle })
          }

          if (shrubs.length < 82 && (i + seg) % 3 === 0) {
            const offset = corridor.halfWidth + 1.25 + this.random() * 0.55
            const x = mx + nx * offset * side
            const z = mz + nz * offset * side
            if (this.canPlaceScenery(x, z, 0.30) && !occupiedNearby(x, z, 0.56)) shrubs.push({ x, z, angle })
          }

          if (roadTrees.length < 54 && (i + seg) % 7 === 0) {
            const offset = corridor.halfWidth + 1.65 + this.random() * 0.55
            const x = mx - nx * offset * side
            const z = mz - nz * offset * side
            if (this.canPlaceScenery(x, z, 0.52) && !occupiedNearby(x, z, 1.05)) roadTrees.push({ x, z, angle })
          }
        }
      }
    }

    const dummy = new THREE.Object3D()
    if (lamps.length) {
      const poleGeo = this.rememberGeometry(new THREE.CylinderGeometry(0.045, 0.07, 1.55, 6))
      const globeGeo = this.rememberGeometry(new THREE.SphereGeometry(0.16, 8, 6))
      const poles = new THREE.InstancedMesh(poleGeo, this.toonMaterial(this.options.style === 'NIGHT' ? '#3c4655' : '#856f6a'), lamps.length)
      const globes = new THREE.InstancedMesh(globeGeo, this.standardMaterial(this.options.style === 'NIGHT' ? '#ffd783' : '#fff5dd', {
        emissive: new THREE.Color(this.options.style === 'NIGHT' ? '#ffc760' : '#fff0c8'),
        emissiveIntensity: this.options.style === 'NIGHT' ? 1.8 : 0.12,
        roughness: 0.32
      }), lamps.length)
      lamps.forEach((p, i) => {
        const y = this.terrainHeight(p.x, p.z)
        dummy.position.set(p.x, y + 0.78, p.z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); poles.setMatrixAt(i, dummy.matrix)
        dummy.position.set(p.x, y + 1.62, p.z); dummy.updateMatrix(); globes.setMatrixAt(i, dummy.matrix)
      })
      poles.castShadow = true; globes.castShadow = true
      poles.instanceMatrix.needsUpdate = true; globes.instanceMatrix.needsUpdate = true
      this.root.add(poles, globes)
    }

    if (benches.length) {
      const seatGeo = this.rememberGeometry(new RoundedBoxGeometry(1.15, 0.12, 0.38, 2, 0.04))
      const backGeo = this.rememberGeometry(new RoundedBoxGeometry(1.15, 0.48, 0.10, 2, 0.035))
      const legGeo = this.rememberGeometry(new RoundedBoxGeometry(0.10, 0.36, 0.10, 1, 0.025))
      const wood = this.toonMaterial(this.options.style === 'NIGHT' ? '#8b746c' : '#b78b65')
      const metal = this.toonMaterial(this.options.style === 'NIGHT' ? '#48515f' : '#756d69')
      const seats = new THREE.InstancedMesh(seatGeo, wood, benches.length)
      const backs = new THREE.InstancedMesh(backGeo, wood, benches.length)
      const legs = new THREE.InstancedMesh(legGeo, metal, benches.length * 2)
      benches.forEach((p, i) => {
        const y = this.terrainHeight(p.x, p.z)
        const angle = p.angle + Math.PI * 0.5
        const forwardX = Math.sin(angle)
        const forwardZ = Math.cos(angle)
        const sideX = Math.cos(angle)
        const sideZ = -Math.sin(angle)
        dummy.rotation.set(0, angle, 0); dummy.scale.setScalar(1)
        dummy.position.set(p.x, y + 0.48, p.z); dummy.updateMatrix(); seats.setMatrixAt(i, dummy.matrix)
        dummy.position.set(p.x - forwardX * 0.16, y + 0.72, p.z - forwardZ * 0.16); dummy.updateMatrix(); backs.setMatrixAt(i, dummy.matrix)
        for (let leg = 0; leg < 2; leg += 1) {
          const sign = leg ? 1 : -1
          dummy.position.set(p.x + sideX * 0.39 * sign, y + 0.23, p.z + sideZ * 0.39 * sign)
          dummy.updateMatrix(); legs.setMatrixAt(i * 2 + leg, dummy.matrix)
        }
      })
      seats.castShadow = backs.castShadow = legs.castShadow = true
      seats.instanceMatrix.needsUpdate = backs.instanceMatrix.needsUpdate = legs.instanceMatrix.needsUpdate = true
      this.root.add(seats, backs, legs)
    }

    if (shrubs.length) {
      const shrubGeo = this.rememberGeometry(new THREE.IcosahedronGeometry(0.32, 1))
      const shrub = new THREE.InstancedMesh(shrubGeo, this.toonMaterial(this.palette.treeLight), shrubs.length)
      shrubs.forEach((p, i) => {
        const y = this.terrainHeight(p.x, p.z)
        const scale = 0.72 + this.random() * 0.55
        dummy.position.set(p.x, y + 0.25 * scale, p.z)
        dummy.rotation.set(this.random() * 0.18, this.random() * Math.PI, this.random() * 0.18)
        dummy.scale.set(scale * 1.20, scale * 0.72, scale)
        dummy.updateMatrix(); shrub.setMatrixAt(i, dummy.matrix)
      })
      shrub.castShadow = true; shrub.receiveShadow = true; shrub.instanceMatrix.needsUpdate = true
      this.root.add(shrub)
    }

    if (roadTrees.length) {
      const trunkGeo = this.rememberGeometry(new THREE.CylinderGeometry(0.11, 0.16, 0.92, 7))
      const crownGeo = this.rememberGeometry(new THREE.IcosahedronGeometry(0.66, 1))
      const trunks = new THREE.InstancedMesh(trunkGeo, this.toonMaterial(this.palette.trunk), roadTrees.length)
      const crowns = new THREE.InstancedMesh(crownGeo, this.toonMaterial(this.palette.treeLight), roadTrees.length)
      roadTrees.forEach((p, i) => {
        const y = this.terrainHeight(p.x, p.z)
        const scale = 0.78 + this.random() * 0.56
        dummy.rotation.set(0, this.random() * Math.PI, 0)
        dummy.scale.set(scale, scale, scale)
        dummy.position.set(p.x, y + 0.48 * scale, p.z); dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix)
        dummy.position.set(p.x, y + 1.28 * scale, p.z); dummy.rotation.set(this.random() * 0.15, this.random() * Math.PI, this.random() * 0.15); dummy.scale.set(scale, scale * 0.90, scale); dummy.updateMatrix(); crowns.setMatrixAt(i, dummy.matrix)
      })
      trunks.castShadow = crowns.castShadow = true
      trunks.instanceMatrix.needsUpdate = crowns.instanceMatrix.needsUpdate = true
      this.root.add(trunks, crowns)
    }
  }

  private buildParks(features: OsmFeature[]) {
    const material = this.toonMaterial(this.palette.treeLight, { transparent: true, opacity: 0.34 })
    features.filter(isClosed).slice(0, this.options.quality.parkLimit).forEach(feature => {
      const pts = clipPolygonToWorld(projectFeature(feature, this.options.bounds))
      if (pts.length < 3) return
      const shape = new THREE.Shape()
      shape.moveTo(pts[0]!.x, -pts[0]!.z)
      pts.slice(1).forEach(p => shape.lineTo(p.x, -p.z))
      const geometry = this.rememberGeometry(new THREE.ShapeGeometry(shape))
      geometry.rotateX(-Math.PI / 2)
      this.drapeGeometryY(geometry, (x, z) => this.terrainHeight(x, z) + 0.10)
      const mesh = new THREE.Mesh(geometry, material)
      this.root.add(mesh)
    })
  }

  private buildOsmBuildings(features: OsmFeature[]) {
    const materials = [
      this.toonMaterial(this.palette.buildingA),
      this.toonMaterial(this.palette.buildingB),
      this.toonMaterial(this.palette.buildingC)
    ]
    const roofMaterials = [this.toonMaterial(this.palette.roofA), this.toonMaterial(this.palette.roofB)]
    // Film materials use semantic names; GEO retains the original toon look.
    roofMaterials.forEach((material, index) => { material.name = index === 0 ? 'tm-roof-ceramic' : 'tm-roof-slate' })
    // Consistent typology colour language: preserve the palette while making usage readable.
    const typologyMaterial: Record<BuildingKind, THREE.Material> = {
      HOME: materials[0]!, APARTMENT: this.toonMaterial('#d2baac'),
      OFFICE: this.standardMaterial('#8caaae', { roughness: 0.48, metalness: 0.03 }),
      RETAIL: this.toonMaterial('#e6c0a5'), INDUSTRIAL: this.toonMaterial('#b7bdb1'),
      SCHOOL: this.toonMaterial('#ddb59c'), HOSPITAL: this.toonMaterial('#d3ded5'),
      PUBLIC: this.toonMaterial('#c4c4b1'), LANDMARK: this.toonMaterial('#dfc99b')
    }
    // Tags are assigned to original materials, not meshes, so InstancedMesh
    // and asset fallback behavior remain unchanged when changing visual modes.
    Object.entries(typologyMaterial).forEach(([kind, material]) => {
      material.name = `tm-building-${kind.toLowerCase()}`
    })
    const outlineMaterial = new THREE.LineBasicMaterial({ color: this.options.style === 'NIGHT' ? '#29364a' : '#8f817b', transparent: true, opacity: 0.24 })
    this.disposeList.push(outlineMaterial)

    type FacadeInstance = { x: number; y: number; z: number; angle: number; width: number; height: number }
    const windows: FacadeInstance[] = []
    const doors: FacadeInstance[] = []
    const awnings: FacadeInstance[] = []
    const balconies: FacadeInstance[] = []

    const closed = curateBuildings(features.filter(isClosed),this.options.bounds,this.options.quality.buildingLimit)
    closed.forEach((feature, index) => {
      const clipped = clipPolygonToWorld(projectFeature(feature, this.options.bounds))
      let pts = sanitizePolygon(clipped)
      if(pts.length<3)return
      const pivot=polygonCentroid(pts)
      const scale=classifyBuilding(feature.tags)==='LANDMARK'?.94:.82
      pts=pts.map(p=>({x:pivot.x+(p.x-pivot.x)*scale,z:pivot.z+(p.z-pivot.z)*scale}))
      if (pts.length < 3 || Math.abs(polygonSignedArea(pts)) < 0.025) return

      const center = polygonCentroid(pts)
      if (this.isWaterAt(center.x, center.z, 0.35) || pts.some(p => this.isWaterAt(p.x, p.z, 0.12))) return

      const xs = pts.map(p => p.x)
      const zs = pts.map(p => p.z)
      const width = Math.max(...xs) - Math.min(...xs)
      const depth = Math.max(...zs) - Math.min(...zs)
      const footprintAreaHint = Math.max(0.01, width * depth)
      if (footprintAreaHint < 0.08 || width > WORLD_WIDTH * 0.48 || depth > WORLD_DEPTH * 0.48) return

      const shape = new THREE.Shape()
      shape.moveTo(pts[0]!.x, -pts[0]!.z)
      pts.slice(1).forEach(p => shape.lineTo(p.x, -p.z))
      shape.closePath()

      const kind=classifyBuilding(feature.tags)
      const height=Math.min(getBuildingHeight(feature.tags,this.random)*.72,Math.max(.95,Math.min(width,depth)*1.9))
      const sampledBase = pts.reduce((sum, p) => sum + this.terrainHeight(p.x, p.z), this.terrainHeight(center.x, center.z)) / (pts.length + 1)
      const baseY = sampledBase + 0.13
      const type = String(feature.tags.building || feature.tags['building:part'] || '').toLowerCase()
      const commercial = kind==='OFFICE'||kind==='RETAIL'
      const industrial = kind==='INDUSTRIAL'
      const residential = kind==='HOME'||kind==='APARTMENT'
      const bodyMaterial = kind === 'HOME' && index % 3 ? materials[index % materials.length]! : typologyMaterial[kind]

      // Bevelled extrusion is the main source of folded/jagged walls on concave OSM
      // footprints. Keep complex real footprints crisp and stable; use only a tiny bevel
      // on simple convex footprints where it is geometrically safe.
      const complexFootprint = polygonIsConcave(pts) || pts.length > 7
      const foundationGeometry = this.rememberGeometry(new THREE.ExtrudeGeometry(shape, {
        depth: 0.13,
        bevelEnabled: false,
        curveSegments: 1,
        steps: 1
      }))
      foundationGeometry.rotateX(-Math.PI / 2)
      const foundation = new THREE.Mesh(foundationGeometry, this.toonMaterial(this.palette.plaza))
      foundation.position.y = baseY - 0.09
      foundation.receiveShadow = true
      this.root.add(foundation)

      const geometry = this.rememberGeometry(new THREE.ExtrudeGeometry(shape, {
        depth: height,
        bevelEnabled: !complexFootprint,
        bevelSize: complexFootprint ? 0 : Math.min(0.045, height * 0.012),
        bevelThickness: complexFootprint ? 0 : Math.min(0.045, height * 0.012),
        bevelSegments: complexFootprint ? 0 : 1,
        curveSegments: 1,
        steps: 1
      }))
      geometry.rotateX(-Math.PI / 2)
      geometry.computeVertexNormals()
      const mesh = new THREE.Mesh(geometry, bodyMaterial)
      mesh.position.y = baseY
      mesh.castShadow = true
      mesh.receiveShadow = true
      this.root.add(mesh)
      this.occupiedBuildings.push(center)

      const roofGeometry = this.rememberGeometry(new THREE.ShapeGeometry(shape))
      roofGeometry.rotateX(-Math.PI / 2)
      const roof = new THREE.Mesh(roofGeometry, roofMaterials[(index + (commercial ? 1 : 0)) % roofMaterials.length]!)
      roof.position.y = baseY + height + 0.045
      roof.receiveShadow = true
      roof.castShadow = true
      this.root.add(roof)
      const architecturalDetails:THREE.Object3D[]=[]
      // 特征轮廓：低层住宅坡屋顶，办公玻璃核心，商业雨棚，公共建筑标识。
      if(kind==='HOME'&&!complexFootprint&&pts.length===4&&width>1&&depth>1){
        const pitched=new THREE.Mesh(this.createGableRoofGeometry(width*.91,depth*.91,Math.min(.55,height*.35)),roofMaterials[index%2]!)
        pitched.position.set(center.x,baseY+height,center.z);pitched.castShadow=true;this.root.add(pitched);architecturalDetails.push(pitched)
      }
      if(kind==='OFFICE'&&width>1&&depth>1){
        const crown=new THREE.Mesh(this.rememberGeometry(new RoundedBoxGeometry(width*.64,.32,depth*.64,2,.05)),this.standardMaterial(this.palette.glass,{roughness:.4}))
        crown.position.set(center.x,baseY+height+.18,center.z);this.root.add(crown);architecturalDetails.push(crown)
      }
      if((kind==='HOSPITAL'||kind==='SCHOOL'||kind==='PUBLIC')&&width>1){
        const badge=new THREE.Mesh(this.rememberGeometry(new THREE.BoxGeometry(width*.35,.18,.07)),this.toonMaterial(kind==='HOSPITAL'?'#bc6571':'#5d8792'))
        badge.position.set(center.x,baseY+Math.min(height-.2,.9),center.z+depth*.5+.04);this.root.add(badge);architecturalDetails.push(badge)
      }

      // Silhouette-focused architecture: only LOCAL/DISTRICT buildings get small
      // type-specific ornaments; REGION deliberately avoids decorative geometry.
      if (index < (this.options.quality.id === 'LOCAL' ? 72 : 30) && width > 1.15 && depth > 1.0) {
        const detail = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
          const part = new THREE.Mesh(this.rememberGeometry(geo), mat)
          part.position.set(x, y, z)
          part.castShadow = true
          this.root.add(part)
          architecturalDetails.push(part)
          return part
        }
        if (kind === 'APARTMENT' && height > 1.8) {
          // Recessed rooftop penthouse visually separates apartments from villas.
          detail(new RoundedBoxGeometry(width * .48, .30, depth * .45, 2, .045), roofMaterials[index % 2]!, center.x, baseY + height + .17, center.z)
        } else if (kind === 'RETAIL') {
          // Continuous shopfront and canopy, oriented to the dominant footprint axis.
          detail(new RoundedBoxGeometry(width * .72, .34, .13, 2, .04), this.standardMaterial(this.palette.glass, { roughness: .31 }), center.x, baseY + .63, Math.max(...zs) + .025)
          detail(new RoundedBoxGeometry(width * .85, .13, .45, 2, .04), roofMaterials[index % 2]!, center.x, baseY + 1.03, Math.max(...zs) + .17)
        } else if (kind === 'OFFICE' && height > 2.0) {
          // A vertical glazed core and mechanical cap create a recognisable office silhouette.
          detail(new RoundedBoxGeometry(width * .23, height * .82, .12, 2, .03), this.standardMaterial(this.palette.glass, { roughness: .26 }), center.x, baseY + height * .54, Math.max(...zs) + .03)
        } else if (kind === 'INDUSTRIAL') {
          for (let n = -1; n <= 1; n++) {
            detail(new RoundedBoxGeometry(width * .72, .10, depth * .12, 1, .025), this.standardMaterial('#9aaeb0', { roughness: .40 }), center.x, baseY + height + .12, center.z + n * depth * .24)
          }
        } else if (kind === 'HOSPITAL') {
          const sign = this.toonMaterial('#c15c66')
          detail(new THREE.BoxGeometry(.17, .63, .11), sign, center.x, baseY + Math.min(height * .62, 1.8), Math.max(...zs) + .07)
          detail(new THREE.BoxGeometry(.60, .17, .11), sign, center.x, baseY + Math.min(height * .62, 1.8), Math.max(...zs) + .07)
        } else if (kind === 'SCHOOL') {
          detail(new RoundedBoxGeometry(width * .58, .15, depth * .40, 2, .03), roofMaterials[index % 2]!, center.x, baseY + height + .11, center.z)
        } else if (kind === 'LANDMARK') {
          detail(new THREE.ConeGeometry(Math.min(width, depth) * .19, Math.min(1.4, height * .33), 5), roofMaterials[index % 2]!, center.x, baseY + height + Math.min(.7, height * .165), center.z)
        }
      }

      // Phase 2.6: only a curated subset of real footprints is eligible for a
      // high-detail GLB/glTF replacement. The GIS extrusion stays visible until
      // the external model has loaded successfully, so missing assets never leave
      // holes in the city.
      const assetEligible = !['SCHOOL','HOSPITAL','PUBLIC','LANDMARK','INDUSTRIAL'].includes(kind) && this.assetUpgrades.length < this.options.quality.assetUpgradeLimit
        && index % 3 === 0
        && width > 0.85
        && depth > 0.72
        && footprintAreaHint > 0.85
        && width < 10.5
        && depth < 10.5
      let assetSlot: AssetUpgradeSlot | null = null
      if (assetEligible) {
        assetSlot = {
          seed: `${index}-${center.x.toFixed(3)}-${center.z.toFixed(3)}-${type || 'building'}`,
          category: chooseBuildingAssetCategory(feature.tags, height, width, depth),
          x: center.x,
          y: baseY,
          z: center.z,
          yaw: longestFootprintYaw(pts),
          width: Math.max(0.72, width * 0.94),
          depth: Math.max(0.72, depth * 0.94),
          height: Math.max(0.9, height * 1.04),
          fallbackObjects: [foundation, mesh, roof,...architecturalDetails]
        }
        this.assetUpgrades.push(assetSlot)
      }

      // Keep silhouette outlines, but avoid aggressive edge rendering on highly concave
      // footprints because triangulation diagonals can read as broken walls.
      if (index < 24 && !complexFootprint && commercial) {
        const edges = new THREE.LineSegments(this.rememberGeometry(new THREE.EdgesGeometry(geometry, 42)), outlineMaterial)
        edges.position.y = baseY
        this.root.add(edges)
        assetSlot?.fallbackObjects.push(edges)
      }

      // Real buildings get façade rhythm from their actual footprint edges. The two
      // longest street-facing edges receive windows; this preserves real geometry while
      // making the result read as a cartoon city instead of raw GIS blocks.
      if (!assetSlot && index < this.options.quality.facadeBuildingLimit && !industrial && height > 1.05) {
        const edges = pts.map((a, edgeIndex) => {
          const b = pts[(edgeIndex + 1) % pts.length]!
          return { a, b, ...outwardNormalForEdge(a, b, pts) }
        }).filter(edge => edge.len > 0.85).sort((a, b) => b.len - a.len).slice(0, 2)

        const floors = clamp(Math.round(height / 0.88), 1, 5)
        edges.forEach((edge, edgeIndex) => {
          const cols = clamp(Math.floor(edge.len / 0.72), 1, 5)
          const windowW = clamp(edge.len / (cols * 2.1), 0.20, 0.38)
          const windowH = clamp(height / (floors * 3.0), 0.22, 0.38)
          for (let floor = 0; floor < floors && windows.length < 1400; floor += 1) {
            const y = baseY + Math.min(height - 0.35, 0.55 + floor * Math.max(0.58, (height - 0.85) / Math.max(1, floors)))
            for (let col = 0; col < cols && windows.length < 1400; col += 1) {
              const t = (col + 1) / (cols + 1)
              const x = edge.a.x + (edge.b.x - edge.a.x) * t + edge.nx * 0.055
              const z = edge.a.z + (edge.b.z - edge.a.z) * t + edge.nz * 0.055
              windows.push({ x, y, z, angle: edge.angle, width: windowW, height: windowH })
            }
          }

          if (edgeIndex === 0 && doors.length < 180 && edge.len > 1.2) {
            doors.push({
              x: edge.mid.x + edge.nx * 0.065,
              y: baseY + 0.43,
              z: edge.mid.z + edge.nz * 0.065,
              angle: edge.angle,
              width: clamp(edge.len * 0.17, 0.34, 0.62),
              height: 0.78
            })
          }
          if (commercial && edgeIndex === 0 && awnings.length < 100 && edge.len > 1.5) {
            awnings.push({
              x: edge.mid.x + edge.nx * 0.28,
              y: baseY + 1.12,
              z: edge.mid.z + edge.nz * 0.28,
              angle: edge.angle,
              width: clamp(edge.len * 0.62, 0.85, 2.3),
              height: 0.34
            })
          }
          if (residential && height > 2.1 && edgeIndex === 0 && balconies.length < 90 && edge.len > 1.6) {
            balconies.push({
              x: edge.mid.x + edge.nx * 0.24,
              y: baseY + Math.min(height - 0.58, 1.55),
              z: edge.mid.z + edge.nz * 0.24,
              angle: edge.angle,
              width: clamp(edge.len * 0.46, 0.72, 1.8),
              height: 0.42
            })
          }
        })
      }

      // Rooftop details break up long, monotonous blocks without changing the real
      // footprint. Industrial/commercial footprints receive skylights; taller buildings
      // receive a compact mechanical core.
      if (this.options.quality.detailedRoofs && height > 3.0 && width > 1.0 && depth > 1.0) {
        const core = new THREE.Mesh(
          this.rememberGeometry(new RoundedBoxGeometry(clamp(width * 0.28, 0.48, 1.55), 0.36, clamp(depth * 0.28, 0.48, 1.55), 2, 0.06)),
          roofMaterials[index % roofMaterials.length]!
        )
        core.position.set(center.x, baseY + height + 0.22, center.z)
        core.castShadow = true
        this.root.add(core)
        assetSlot?.fallbackObjects.push(core)
      } else if (industrial && width > 2.2 && depth > 1.5) {
        const skylight = new THREE.Mesh(
          this.rememberGeometry(new RoundedBoxGeometry(clamp(width * 0.46, 0.8, 2.8), 0.12, clamp(depth * 0.20, 0.4, 1.1), 2, 0.035)),
          this.standardMaterial(this.palette.glass, { roughness: 0.34, metalness: 0.02 })
        )
        skylight.position.set(center.x, baseY + height + 0.13, center.z)
        skylight.castShadow = true
        this.root.add(skylight)
        assetSlot?.fallbackObjects.push(skylight)
      }
    })

    const applyInstances = (items: FacadeInstance[], geometry: THREE.BufferGeometry, material: THREE.Material, depthScale = 1) => {
      if (!items.length) return
      const mesh = new THREE.InstancedMesh(geometry, material, items.length)
      const dummy = new THREE.Object3D()
      items.forEach((item, i) => {
        dummy.position.set(item.x, item.y, item.z)
        dummy.rotation.set(0, item.angle, 0)
        dummy.scale.set(item.width, item.height, depthScale)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
      })
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.instanceMatrix.needsUpdate = true
      this.root.add(mesh)
    }

    const paneGeometry = this.rememberGeometry(new RoundedBoxGeometry(1, 1, 0.08, 1, 0.025))
    const doorGeometry = this.rememberGeometry(new RoundedBoxGeometry(1, 1, 0.10, 1, 0.03))
    const awningGeometry = this.rememberGeometry(new RoundedBoxGeometry(1, 0.18, 0.72, 2, 0.05))
    const balconyGeometry = this.rememberGeometry(new RoundedBoxGeometry(1, 0.12, 0.64, 2, 0.04))
    applyInstances(windows, paneGeometry, this.standardMaterial(this.palette.glass, {
      roughness: 0.30,
      emissive: new THREE.Color(this.options.style === 'NIGHT' ? '#ffc968' : this.palette.glass),
      emissiveIntensity: this.options.style === 'NIGHT' ? 0.58 : 0.035
    }))
    applyInstances(doors, doorGeometry, this.toonMaterial(this.palette.roofB))
    applyInstances(awnings, awningGeometry, this.toonMaterial(this.palette.flower))
    applyInstances(balconies, balconyGeometry, this.toonMaterial(this.palette.facadeTrim))
  }

  private createGableRoofGeometry(width: number, depth: number, height: number) {
    const hw = width * 0.5
    const hd = depth * 0.5
    const positions = new Float32Array([
      -hw, 0, -hd,   hw, 0, -hd,   0, height, -hd,
      -hw, 0,  hd,   hw, 0,  hd,   0, height,  hd
    ])
    const indices = [
      0, 1, 2,  3, 5, 4,
      0, 2, 5,  0, 5, 3,
      1, 4, 5,  1, 5, 2,
      0, 3, 4,  0, 4, 1
    ]
    const geometry = this.rememberGeometry(new THREE.BufferGeometry())
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()
    return geometry
  }

  private nearestRoadFrame(x: number, z: number): RoadFrame | null {
    let best: RoadFrame | null = null
    for (const corridor of this.roadCorridors) {
      for (let i = 1; i < corridor.points.length; i += 1) {
        const a = corridor.points[i - 1]!
        const b = corridor.points[i]!
        const vx = b.x - a.x
        const vz = b.z - a.z
        const denom = vx * vx + vz * vz
        if (denom <= 1e-8) continue
        const t = clamp(((x - a.x) * vx + (z - a.z) * vz) / denom, 0, 1)
        const px = a.x + vx * t
        const pz = a.z + vz * t
        const distance = Math.hypot(x - px, z - pz)
        if (!best || distance < best.distance) best = { x: px, z: pz, angle: Math.atan2(vx, vz), halfWidth: corridor.halfWidth, distance }
      }
    }
    return best
  }

  private sampleRoadsideLot(): { x: number; z: number; rotation: number } | null {
    if (!this.roadCorridors.length) return null
    for (let attempt = 0; attempt < 18; attempt += 1) {
      const corridor = this.roadCorridors[Math.floor(this.random() * this.roadCorridors.length)]!
      if (corridor.points.length < 2) continue
      const i = 1 + Math.floor(this.random() * (corridor.points.length - 1))
      const a = corridor.points[i - 1]!
      const b = corridor.points[i]!
      const t = 0.16 + this.random() * 0.68
      const px = a.x + (b.x - a.x) * t
      const pz = a.z + (b.z - a.z) * t
      const dx = b.x - a.x
      const dz = b.z - a.z
      const len = Math.hypot(dx, dz) || 1
      const nx = -dz / len
      const nz = dx / len
      const side = this.random() < 0.5 ? -1 : 1
      const offset = corridor.halfWidth + 2.1 + this.random() * 2.6
      const x = px + nx * offset * side
      const z = pz + nz * offset * side
      if (!this.canPlaceScenery(x, z, 1.25)) continue
      return { x, z, rotation: Math.atan2(dx, dz) + (side < 0 ? Math.PI : 0) }
    }
    return null
  }

  private addWindow(group: THREE.Group, x: number, y: number, z: number, width = 0.36, height = 0.44, side: 'front' | 'back' = 'front') {
    const pane = new THREE.Mesh(
      this.rememberGeometry(new RoundedBoxGeometry(width, height, 0.07, 1, 0.03)),
      this.standardMaterial(this.palette.glass, {
        roughness: 0.32,
        emissive: new THREE.Color(this.options.style === 'NIGHT' ? '#ffc968' : this.palette.glass),
        emissiveIntensity: this.options.style === 'NIGHT' ? 0.52 : 0.06
      })
    )
    pane.position.set(x, y, side === 'front' ? z : -z)
    if (side === 'back') pane.rotation.y = Math.PI
    group.add(pane)
  }

  private addStylizedBuilding(x: number, z: number, width: number, depth: number, height: number, rotation: number, variant: number) {
    const baseY = this.terrainHeight(x, z)
    const group = new THREE.Group()
    group.position.set(x, baseY + 0.17, z)
    group.rotation.y = rotation

    const archetype = variant % 4
    const bodyColors = [this.palette.buildingA, this.palette.buildingB, this.palette.buildingC]
    const roofColors = [this.palette.roofA, this.palette.roofB]
    const trim = this.toonMaterial(this.palette.facadeTrim)
    const bodyMat = this.toonMaterial(bodyColors[variant % bodyColors.length]!)
    const roofMat = this.toonMaterial(roofColors[variant % roofColors.length]!)

    const foundation = new THREE.Mesh(
      this.rememberGeometry(new RoundedBoxGeometry(width * 1.12, 0.22, depth * 1.12, 2, 0.08)),
      this.toonMaterial(this.palette.plaza)
    )
    foundation.position.y = 0.04
    foundation.receiveShadow = true
    group.add(foundation)

    if (archetype === 0) {
      // Cozy cottage: short body, readable gable roof, chimney and flower bed.
      const h = Math.min(height, 3.25)
      const body = new THREE.Mesh(this.rememberGeometry(new RoundedBoxGeometry(width, h, depth, 3, 0.16)), bodyMat)
      body.position.y = h * 0.5
      const roof = new THREE.Mesh(this.createGableRoofGeometry(width * 1.18, depth * 1.2, 0.88), roofMat)
      roof.position.y = h + 0.02
      const chimney = new THREE.Mesh(this.rememberGeometry(new RoundedBoxGeometry(0.28, 0.92, 0.32, 1, 0.05)), trim)
      chimney.position.set(width * 0.24, h + 0.55, -depth * 0.12)
      group.add(body, roof, chimney)
      this.addWindow(group, -width * 0.22, 1.15, depth * 0.5 + 0.04, 0.38, 0.48)
      this.addWindow(group, width * 0.22, 1.15, depth * 0.5 + 0.04, 0.38, 0.48)
      const door = new THREE.Mesh(this.rememberGeometry(new RoundedBoxGeometry(0.46, 0.82, 0.08, 1, 0.04)), this.toonMaterial(this.palette.roofB))
      door.position.set(0, 0.46, depth * 0.5 + 0.05)
      group.add(door)
      const flowerGeo = this.rememberGeometry(new THREE.SphereGeometry(0.13, 7, 5))
      for (let i = 0; i < 5; i += 1) {
        const flower = new THREE.Mesh(flowerGeo, this.toonMaterial(i % 2 ? this.palette.flower : this.palette.treeLight))
        flower.position.set(-width * 0.35 + i * width * 0.17, 0.22, depth * 0.62)
        group.add(flower)
      }
    } else if (archetype === 1) {
      // Town house: floor bands, balcony and many windows.
      const body = new THREE.Mesh(this.rememberGeometry(new RoundedBoxGeometry(width, height, depth, 3, 0.14)), bodyMat)
      body.position.y = height * 0.5
      group.add(body)
      const floors = Math.max(2, Math.min(5, Math.round(height / 1.25)))
      for (let floor = 1; floor < floors; floor += 1) {
        const band = new THREE.Mesh(this.rememberGeometry(new RoundedBoxGeometry(width * 1.035, 0.09, depth * 1.035, 1, 0.02)), trim)
        band.position.y = floor * (height / floors)
        group.add(band)
      }
      const cols = width > 2.5 ? 3 : 2
      for (let floor = 0; floor < floors; floor += 1) {
        const y = 0.78 + floor * Math.max(0.86, (height - 0.95) / floors)
        for (let col = 0; col < cols; col += 1) {
          const wx = (col - (cols - 1) / 2) * (width * 0.58 / Math.max(1, cols - 1))
          this.addWindow(group, wx, y, depth * 0.5 + 0.04, 0.30, 0.36)
        }
      }
      const balcony = new THREE.Mesh(this.rememberGeometry(new RoundedBoxGeometry(width * 0.62, 0.12, 0.65, 2, 0.05)), trim)
      balcony.position.set(0, Math.min(height - 0.7, 2.0), depth * 0.5 + 0.34)
      group.add(balcony)
      const roof = new THREE.Mesh(this.rememberGeometry(new RoundedBoxGeometry(width * 0.82, 0.32, depth * 0.82, 2, 0.08)), roofMat)
      roof.position.y = height + 0.14
      group.add(roof)
    } else if (archetype === 2) {
      // Soft high-rise: stepped massing instead of a plain tower block.
      const lowerH = height * 0.58
      const upperH = height * 0.42
      const lower = new THREE.Mesh(this.rememberGeometry(new RoundedBoxGeometry(width, lowerH, depth, 4, 0.18)), bodyMat)
      lower.position.y = lowerH * 0.5
      const upper = new THREE.Mesh(this.rememberGeometry(new RoundedBoxGeometry(width * 0.72, upperH, depth * 0.72, 4, 0.16)), this.toonMaterial(bodyColors[(variant + 1) % bodyColors.length]!))
      upper.position.y = lowerH + upperH * 0.5 - 0.03
      const crown = new THREE.Mesh(this.rememberGeometry(new RoundedBoxGeometry(width * 0.48, 0.42, depth * 0.48, 3, 0.10)), roofMat)
      crown.position.y = height + 0.14
      group.add(lower, upper, crown)
      const rows = Math.max(3, Math.min(7, Math.floor(height / 1.1)))
      for (let row = 0; row < rows; row += 1) {
        const y = 0.8 + row * (height - 1.1) / Math.max(1, rows - 1)
        this.addWindow(group, -width * 0.22, y, depth * 0.5 + 0.045, 0.30, 0.34)
        this.addWindow(group, width * 0.22, y, depth * 0.5 + 0.045, 0.30, 0.34)
      }
    } else {
      // Small shop/cafe: awning and large display windows.
      const h = Math.min(height, 3.0)
      const body = new THREE.Mesh(this.rememberGeometry(new RoundedBoxGeometry(width, h, depth, 3, 0.17)), bodyMat)
      body.position.y = h * 0.5
      const roof = new THREE.Mesh(this.createGableRoofGeometry(width * 1.12, depth * 1.15, 0.62), roofMat)
      roof.position.y = h
      group.add(body, roof)
      const awning = new THREE.Mesh(this.rememberGeometry(new RoundedBoxGeometry(width * 0.72, 0.14, 0.72, 2, 0.05)), this.toonMaterial(this.palette.flower))
      awning.position.set(0, 1.35, depth * 0.5 + 0.35)
      awning.rotation.x = -0.12
      group.add(awning)
      this.addWindow(group, -width * 0.22, 0.82, depth * 0.5 + 0.05, 0.52, 0.72)
      this.addWindow(group, width * 0.22, 0.82, depth * 0.5 + 0.05, 0.52, 0.72)
      const sign = new THREE.Mesh(this.rememberGeometry(new RoundedBoxGeometry(width * 0.48, 0.28, 0.08, 1, 0.03)), trim)
      sign.position.set(0, 1.78, depth * 0.5 + 0.06)
      group.add(sign)
    }

    group.traverse(object => {
      if (object instanceof THREE.Mesh) { object.castShadow = true; object.receiveShadow = true }
    })
    this.root.add(group)
    this.occupiedBuildings.push({ x, z })
  }

  private buildProceduralBuildings(_existingCount: number) {
    const desired = this.options.osm.source === 'OSM' ? 0 : 68
    if (!desired) return

    let created = 0
    let attempts = 0
    while (created < desired && attempts < desired * 34) {
      attempts += 1
      const lot = this.sampleRoadsideLot()
      const fallbackX = (this.random() - 0.5) * WORLD_WIDTH * 0.74
      const fallbackZ = (this.random() - 0.5) * WORLD_DEPTH * 0.68
      const x = lot?.x ?? fallbackX
      const z = lot?.z ?? fallbackZ
      const width = 1.35 + this.random() * 2.15
      const depth = 1.18 + this.random() * 1.75
      const variant = created + Math.floor(this.random() * 11)
      const highRise = variant % 7 === 2
      const height = highRise ? 4.8 + this.random() * 3.9 : 1.8 + Math.pow(this.random(), 1.45) * 3.2
      const footprintRadius = Math.max(width, depth) * 0.68
      if (!this.canPlaceScenery(x, z, footprintRadius)) continue
      if (this.occupiedBuildings.some(p => Math.hypot(p.x - x, p.z - z) < footprintRadius + 0.9)) continue
      const road = this.nearestRoadFrame(x, z)
      const rotation = lot?.rotation ?? (road ? road.angle : Math.round(this.random() * 4) * Math.PI / 2)
      this.addStylizedBuilding(x, z, width, depth, height, rotation, variant)
      created += 1
    }
  }

  private buildMountains() {
    const geometry = this.rememberGeometry(new THREE.ConeGeometry(1, 1, 7, 1, false))
    const material = this.toonMaterial(this.palette.mountain)
    const lightMaterial = this.toonMaterial(this.palette.mountainLight)
    const mountains = new THREE.InstancedMesh(geometry, material, 28)
    const highlights = new THREE.InstancedMesh(geometry, lightMaterial, 14)
    mountains.castShadow = true
    mountains.receiveShadow = true
    highlights.castShadow = true
    const dummy = new THREE.Object3D()
    let hi = 0
    for (let i = 0; i < 28; i += 1) {
      const side = i % 2 === 0 ? -1 : 1
      const x = side * (WORLD_WIDTH * (0.37 + this.random() * 0.12))
      const z = -WORLD_DEPTH * 0.36 + this.random() * WORLD_DEPTH * 0.72
      const radius = 2.2 + this.random() * 4.6
      const height = 5.5 + this.random() * 10.5
      if (this.isWaterAt(x, z, radius * 0.45)) continue
      const y = this.terrainHeight(x, z)
      dummy.position.set(x, y + height * 0.5 - 0.1, z)
      dummy.rotation.set(0, this.random() * Math.PI, 0)
      dummy.scale.set(radius, height, radius)
      dummy.updateMatrix()
      mountains.setMatrixAt(i, dummy.matrix)
      if (i % 2 === 0 && hi < 14) {
        dummy.position.set(x - radius * 0.13, y + height * 0.58, z + radius * 0.05)
        dummy.scale.set(radius * 0.46, height * 0.28, radius * 0.46)
        dummy.updateMatrix()
        highlights.setMatrixAt(hi, dummy.matrix)
        hi += 1
      }
    }
    highlights.count = hi
    mountains.instanceMatrix.needsUpdate = true
    highlights.instanceMatrix.needsUpdate = true
    this.root.add(mountains, highlights)
  }

  private buildForests(parks: OsmFeature[]) {
    const treePositions: Array<VecXZ & { kind: 0 | 1 }> = []
    const target = this.options.osm.source === 'OSM' ? (parks.length ? this.options.quality.treeTarget : 0) : Math.min(165, this.options.quality.treeTarget)

    parks.filter(isClosed).slice(0, 18).forEach(feature => {
      const polygon = clipPolygonToWorld(projectFeature(feature, this.options.bounds))
      if (polygon.length < 3) return
      const xs = polygon.map(p => p.x), zs = polygon.map(p => p.z)
      const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs)
      let made = 0
      let attempts = 0
      while (made < 22 && attempts < 150) {
        attempts += 1
        const p = { x: minX + this.random() * (maxX - minX), z: minZ + this.random() * (maxZ - minZ) }
        if (!pointInPolygon(p, polygon) || !this.canPlaceScenery(p.x, p.z, 0.46)) continue
        treePositions.push({ ...p, kind: this.random() < 0.48 ? 0 : 1 })
        made += 1
      }
    })

    // In REAL GEO mode do not sprinkle random trees across unrelated parcels.
    // Trees are generated only inside real OSM park/forest polygons. Random fill is
    // reserved for explicit PROCEDURAL preview mode.
    if (this.options.osm.source === 'PROCEDURAL') {
      let attempts = 0
      while (treePositions.length < target && attempts < target * 24) {
        attempts += 1
        const edgeBiased = this.random() < 0.42
        const x = edgeBiased
          ? (this.random() < 0.5 ? -1 : 1) * (WORLD_WIDTH * (0.30 + this.random() * 0.17))
          : (this.random() - 0.5) * WORLD_WIDTH * 0.82
        const z = (this.random() - 0.5) * WORLD_DEPTH * (edgeBiased ? 0.84 : 0.72)
        if (!this.canPlaceScenery(x, z, 0.48)) continue
        if (this.occupiedBuildings.some(p => Math.hypot(p.x - x, p.z - z) < 1.28)) continue
        treePositions.push({ x, z, kind: this.random() < 0.56 ? 0 : 1 })
      }
    }

    const conifers = treePositions.filter(p => p.kind === 0)
    const rounds = treePositions.filter(p => p.kind === 1)
    const trunkGeo = this.rememberGeometry(new THREE.CylinderGeometry(0.13, 0.19, 1, 7))
    const trunkMat = this.toonMaterial(this.palette.trunk)
    trunkMat.name = 'tm-vegetation-bark'
    const dummy = new THREE.Object3D()

    const trunk = new THREE.InstancedMesh(trunkGeo, trunkMat, treePositions.length)
    treePositions.forEach((p, i) => {
      const scale = 0.62 + this.random() * 0.55
      const y = this.terrainHeight(p.x, p.z)
      dummy.position.set(p.x, y + 0.55 * scale, p.z)
      dummy.rotation.set(0, this.random() * Math.PI, 0)
      dummy.scale.set(scale, scale, scale)
      dummy.updateMatrix(); trunk.setMatrixAt(i, dummy.matrix)
    })
    trunk.castShadow = true
    trunk.instanceMatrix.needsUpdate = true
    this.root.add(trunk)

    if (conifers.length) {
      const crownGeo = this.rememberGeometry(new THREE.ConeGeometry(0.82, 1.62, 8))
      const darkNeedles = this.toonMaterial(this.palette.treeDark)
      const lightNeedles = this.toonMaterial(this.palette.treeLight)
      darkNeedles.name = lightNeedles.name = 'tm-vegetation-needles'
      const crownA = new THREE.InstancedMesh(crownGeo, darkNeedles, conifers.length)
      const crownB = new THREE.InstancedMesh(crownGeo, lightNeedles, conifers.length)
      conifers.forEach((p, i) => {
        const scale = 0.65 + this.random() * 0.55
        const y = this.terrainHeight(p.x, p.z)
        dummy.position.set(p.x, y + 1.55 * scale, p.z); dummy.rotation.set(0, this.random() * Math.PI, 0); dummy.scale.set(scale, scale, scale); dummy.updateMatrix(); crownA.setMatrixAt(i, dummy.matrix)
        dummy.position.set(p.x + 0.06 * scale, y + 2.12 * scale, p.z - 0.03); dummy.scale.setScalar(scale * 0.68); dummy.updateMatrix(); crownB.setMatrixAt(i, dummy.matrix)
      })
      crownA.castShadow = crownB.castShadow = true
      crownA.instanceMatrix.needsUpdate = crownB.instanceMatrix.needsUpdate = true
      this.root.add(crownA, crownB)
    }

    if (rounds.length) {
      const crownGeo = this.rememberGeometry(new THREE.IcosahedronGeometry(0.78, 1))
      const lightLeaves = this.toonMaterial(this.palette.treeLight)
      const darkLeaves = this.toonMaterial(this.palette.treeDark)
      lightLeaves.name = darkLeaves.name = 'tm-vegetation-leaves'
      const crownA = new THREE.InstancedMesh(crownGeo, lightLeaves, rounds.length)
      const crownB = new THREE.InstancedMesh(crownGeo, darkLeaves, rounds.length)
      rounds.forEach((p, i) => {
        const scale = 0.65 + this.random() * 0.55
        const y = this.terrainHeight(p.x, p.z)
        dummy.position.set(p.x - 0.18 * scale, y + 1.65 * scale, p.z); dummy.rotation.set(this.random(), this.random() * Math.PI, this.random()); dummy.scale.set(scale, scale * 0.92, scale); dummy.updateMatrix(); crownA.setMatrixAt(i, dummy.matrix)
        dummy.position.set(p.x + 0.26 * scale, y + 1.78 * scale, p.z + 0.08); dummy.scale.set(scale * 0.72, scale * 0.78, scale * 0.72); dummy.updateMatrix(); crownB.setMatrixAt(i, dummy.matrix)
      })
      crownA.castShadow = crownB.castShadow = true
      crownA.instanceMatrix.needsUpdate = crownB.instanceMatrix.needsUpdate = true
      this.root.add(crownA, crownB)
    }
  }

  private buildMemoriesAndRoute() {
    const ordered = [...this.options.points]
      .filter(point => Number.isFinite(point.longitude) && Number.isFinite(point.latitude))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)

    const projectedStops = ordered.map(point => {
      const world = projectLngLat(point.longitude, point.latitude, this.options.bounds)
      return { id: point.id, x: world.x, z: world.z }
    })

    ordered.forEach((point, index) => {
      const world = projectedStops[index]!
      const y = this.baseTerrainHeight(world.x, world.z)
      this.buildLandmark(world.x, world.z, y, index)
      this.buildMemoryLabel(point, world.x, y + 5.5, world.z, index)
    })

    if (projectedStops.length < 2) {
      this.options.onJourneyState?.({
        ready: false,
        status: 'IDLE',
        progress: 0,
        currentStopIndex: 0,
        nextStopIndex: 0,
        totalStops: projectedStops.length,
        cameraMode: 'FREE',
        routeMode: 'DIRECT',
        roadCoverage: 0,
        speedMultiplier: 1
      })
      return
    }

    const built = this.options.sharedRoute
      ? projectSharedJourneyRoute(this.options.sharedRoute, projectedStops, this.options.bounds)
      : buildJourneyRoute(
      projectedStops,
      this.roadCorridors.map(corridor => ({
        points: corridor.points,
        highway: corridor.highway,
        bridge: corridor.bridge || corridor.inferredBridge
      })),
      {
        nearestRoadMaxDistance: this.options.quality.id === 'LOCAL' ? 10 : this.options.quality.id === 'DISTRICT' ? 13 : 16,
        isWaterAt: (x, z) => this.isWaterAt(x, z, 0.06)
      }
    )

    // The journey pose is the *road deck*, not the centre of the car. The original
    // +0.48 route height plus VehicleController's +0.72 made the tyres hover.
    const route3d = built.points.map(point => {
      // A point near a bridge should use the SAME ramp/deck elevation used by its mesh.
      const bridgeHeight = this.bridgeDecks.length ? this.bridgeRoadHeight(point.x, point.z) : null
      const roadY = bridgeHeight ?? (this.isWaterAt(point.x, point.z, 0.03)
        ? this.waterSurfaceHeight(point.x, point.z) + 0.78
        : this.baseTerrainHeight(point.x, point.z) + (this.isRoadAt(point.x, point.z, 0.30) ? 0.32 : 0.10))
      return new THREE.Vector3(point.x, roadY, point.z)
    })
    if (route3d.length < 2) return

    // Keep a camera-only smooth curve for the optional cinematic preview. The visible
    // route and the vehicle use the exact road graph polyline, so they never cut corners
    // through lakes/buildings just to look smooth.
    this.routeCurve = new THREE.CatmullRomCurve3(route3d, false, 'centripetal', 0.18)

    const tubularSegments = Math.max(80, Math.min(900, route3d.length * 4))
    const routePolicy = roadRenderPolicy(this.options.quality.id)
    // Lift only the *visual overlay*; the vehicle and route graph remain on the road deck.
    // The old thick tube penetrated the road mesh and caused moving-camera shimmer.
    const lineGeometryPath = new THREE.CurvePath<THREE.Vector3>()
    for (let i = 1; i < route3d.length; i += 1) {
      const a = route3d[i - 1]!.clone(); a.y += 0.15
      const b = route3d[i]!.clone(); b.y += 0.15
      lineGeometryPath.add(new THREE.LineCurve3(a, b))
    }
    const baseGeometry = this.rememberGeometry(new THREE.TubeGeometry(lineGeometryPath, tubularSegments, routePolicy.routeTubeRadius, 7, false))
    const glowGeometry = this.rememberGeometry(new THREE.TubeGeometry(lineGeometryPath, tubularSegments, routePolicy.routeGlowRadius, 7, false))
    const base = new THREE.Mesh(baseGeometry, this.toonMaterial(this.palette.route, {
      transparent: true,
      opacity: 0.34,
      emissive: new THREE.Color(this.palette.route),
      emissiveIntensity: this.options.style === 'NIGHT' ? 0.34 : 0.08
    }))
    const glow = new THREE.Mesh(glowGeometry, this.standardMaterial(this.palette.routeGlow, {
      transparent: true,
      opacity: 0.12,
      emissive: new THREE.Color(this.palette.routeGlow),
      emissiveIntensity: 0.18,
      depthWrite: false
    }))
    base.renderOrder = 9
    glow.renderOrder = 8
    this.root.add(glow, base)

    const progressGeometry = this.rememberGeometry(new THREE.BufferGeometry().setFromPoints(
      route3d.map(point => new THREE.Vector3(point.x, point.y + 0.28, point.z))
    ))
    progressGeometry.setDrawRange(0, 1)
    this.routeProgressPointCount = route3d.length
    const progressMaterial = new THREE.LineBasicMaterial({
      color: this.palette.route,
      transparent: true,
      opacity: 0.98,
      depthTest: true
    })
    this.disposeList.push(progressMaterial)
    this.routeProgressLine = new THREE.Line(progressGeometry, progressMaterial)
    this.routeProgressLine.renderOrder = 12
    this.root.add(this.routeProgressLine)

    this.vehicle = this.createVehicle()
    this.vehicleController = new VehicleController(this.vehicle)
    this.root.add(this.vehicle)

    this.journeyPlayback = new JourneyPlaybackController(
      route3d,
      built.stopPointIndices,
      built.mode,
      built.roadCoverage,
      snapshot => {
        this.options.onJourneyState?.(snapshot)
        // HUD receives throttled distance updates. The route line itself is
        // updated per frame from cumulative metres, not vertex count * percent.
      },
      stopIndex => this.setActiveStop(stopIndex)
    )
    this.journeyPlayback.setCameraMode('FOLLOW')
    this.journeyPlayback.restart(false)
  }

  private buildLandmark(x: number, z: number, baseY: number, index: number) {
    const group = new THREE.Group()
    group.position.set(x, baseY + 0.2, z)
    const base = new THREE.Mesh(this.rememberGeometry(new THREE.CylinderGeometry(1.45, 1.75, 0.45, 18)), this.toonMaterial(this.palette.groundAccent))
    base.position.y = 0.23
    base.receiveShadow = true
    group.add(base)

    if (index % 3 === 0) {
      const body = new THREE.Mesh(this.rememberGeometry(new THREE.CylinderGeometry(0.66, 0.84, 3.3, 8)), this.toonMaterial(this.palette.buildingA))
      body.position.y = 2.0
      const roof = new THREE.Mesh(this.rememberGeometry(new THREE.ConeGeometry(1.5, 0.75, 4)), this.toonMaterial(this.palette.roofA))
      roof.rotation.y = Math.PI / 4
      roof.position.y = 3.95
      group.add(body, roof)
    } else if (index % 3 === 1) {
      const body = new THREE.Mesh(this.rememberGeometry(new RoundedBoxGeometry(2.3, 2.7, 1.7, 3, 0.18)), this.toonMaterial(this.palette.buildingB))
      body.position.y = 1.55
      const roof = new THREE.Mesh(this.rememberGeometry(new THREE.ConeGeometry(1.75, 0.9, 4)), this.toonMaterial(this.palette.roofB))
      roof.rotation.y = Math.PI / 4
      roof.position.y = 3.28
      group.add(body, roof)
    } else {
      const arch = new THREE.Mesh(this.rememberGeometry(new THREE.TorusGeometry(1.15, 0.28, 8, 18, Math.PI)), this.toonMaterial(this.palette.roofA))
      arch.rotation.z = Math.PI
      arch.rotation.x = Math.PI / 2
      arch.position.y = 2.2
      const pillarGeo = this.rememberGeometry(new THREE.BoxGeometry(0.38, 2.3, 0.42))
      const pillarA = new THREE.Mesh(pillarGeo, this.toonMaterial(this.palette.buildingC))
      const pillarB = new THREE.Mesh(pillarGeo, this.toonMaterial(this.palette.buildingC))
      pillarA.position.set(-1.15, 1.2, 0)
      pillarB.position.set(1.15, 1.2, 0)
      group.add(arch, pillarA, pillarB)
    }

    group.traverse(object => {
      if (object instanceof THREE.Mesh) { object.castShadow = true; object.receiveShadow = true }
    })
    this.stopLandmarks.push(group)
    this.root.add(group)
  }

  private buildMemoryLabel(point: RealMapPoint, x: number, y: number, z: number, index: number) {
    const element = document.createElement('article')
    element.className = 'world-memory-card'
    const url = point.mediaId == null ? '' : this.options.photoUrls[point.mediaId] || ''
    element.innerHTML = `${url ? `<img src="${url}" alt="">` : '<div class="world-memory-card__placeholder">✦</div>'}<div><b>${this.escapeHtml(point.title || `旅行第 ${index + 1} 站`)}</b><small>${this.escapeHtml(point.locationName || '旅行记忆点')}</small></div>`
    element.dataset.stopIndex = String(index)
    this.memoryCards.push(element)
    const label = new CSS2DObject(element)
    label.position.set(x, y, z)
    label.center.set(0.5, 1)
    this.labels.push(label)
    this.root.add(label)
  }

  private setActiveStop(index: number) {
    this.memoryCards.forEach((card, cardIndex) => {
      card.classList.toggle('is-active', cardIndex === index)
      card.classList.toggle('is-past', cardIndex < index)
    })
    this.stopLandmarks.forEach((landmark, landmarkIndex) => {
      const targetScale = landmarkIndex === index ? 1.16 : landmarkIndex < index ? 0.94 : 1
      gsap.to(landmark.scale, { x: targetScale, y: targetScale, z: targetScale, duration: 0.35, ease: 'back.out(1.7)' })
    })
  }

  private createVehicle() {
    const group = new THREE.Group()
    const body = new THREE.Mesh(this.rememberGeometry(new RoundedBoxGeometry(1.45, 0.66, 2.35, 3, 0.18)), this.toonMaterial(this.palette.buildingA))
    body.position.y = 0.62
    body.castShadow = true
    const cabin = new THREE.Mesh(this.rememberGeometry(new RoundedBoxGeometry(1.25, 0.6, 1.05, 3, 0.16)), this.toonMaterial(this.palette.buildingB))
    cabin.position.set(0, 1.05, -0.2)
    cabin.castShadow = true
    group.add(body, cabin)
    const wheelGeo = this.rememberGeometry(new THREE.CylinderGeometry(0.24, 0.24, 0.16, 10))
    const wheelMat = this.standardMaterial('#4a4750')
    ;[-0.73, 0.73].forEach(x => [-0.75, 0.75].forEach(z => {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat)
      wheel.rotation.z = Math.PI / 2
      wheel.position.set(x, 0.3, z)
      group.add(wheel)
    }))
    group.scale.setScalar(0.55)
    return group
  }


  private createRibbon(points: Array<{ x: number; z: number; y?: number }>, width: number, heightAt: (x: number, z: number) => number) {
    const positions: number[] = []
    const indices: number[] = []
    for (let i = 0; i < points.length; i += 1) {
      const p = points[i]!
      const prev = points[Math.max(0, i - 1)]!
      const next = points[Math.min(points.length - 1, i + 1)]!
      const dx = next.x - prev.x
      const dz = next.z - prev.z
      const len = Math.hypot(dx, dz) || 1
      const nx = -dz / len
      const nz = dx / len
      const y = p.y ?? heightAt(p.x, p.z)
      positions.push(p.x + nx * width, y, p.z + nz * width)
      positions.push(p.x - nx * width, y, p.z - nz * width)
      if (i < points.length - 1) {
        const a = i * 2
        indices.push(a, a + 2, a + 1, a + 2, a + 3, a + 1)
      }
    }
    const geometry = this.rememberGeometry(new THREE.BufferGeometry())
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()
    return geometry
  }

  private curveFromXZ(points: VecXZ[], y: number) {
    if (points.length < 2) return null
    return new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p.x, y, p.z)), false, 'catmullrom', 0.24)
  }

  private escapeHtml(value: string) {
    return value.replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char] || char)
  }

  private orientedCameraPosition(x: number, y: number, z: number) {
    const angle = THREE.MathUtils.degToRad(this.options.preferredAzimuthDeg || 0)
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    return {
      x: x * cos + z * sin,
      y,
      z: -x * sin + z * cos
    }
  }

  /** 根据实际容器宽高与安全区计算镜头；方向、位置、固定中心仍独立。 */
  private recommendedCamera() {
    const relief=this.options.dem?.verticalRange || 0
    const target=new THREE.Vector3(0,1.8+relief*.18,0)
    const oriented=this.orientedCameraPosition(-8,58,102)
    const direction=new THREE.Vector3(oriented.x,oriented.y,oriented.z).normalize()
    const right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),direction).normalize()
    const up=new THREE.Vector3().crossVectors(direction,right).normalize()
    const width=this.options.container.clientWidth || 960
    const height=this.options.container.clientHeight || 600
    const tanV=Math.tan(THREE.MathUtils.degToRad(this.camera.fov)*.5)
    const tanH=tanV*(width/height)
    let distance=60
    for(const x of [-WORLD_WIDTH*.51,WORLD_WIDTH*.51]) for(const z of [-WORLD_DEPTH*.51,WORLD_DEPTH*.51])
      for(const y of [-5,relief+14]) {
        const relative=new THREE.Vector3(x,y,z).sub(target)
        const depth=relative.dot(direction)
        distance=Math.max(distance,depth+Math.abs(relative.dot(right))/(tanH*.84),
          depth+Math.abs(relative.dot(up))/(tanV*.62))
      }
    return {position:target.clone().addScaledVector(direction,distance+3),target}
  }

  private playIntro() {
    const fit=this.recommendedCamera()
    const introStart=fit.target.clone().add(fit.position.clone().sub(fit.target).multiplyScalar(1.14))
    this.camera.position.copy(introStart)
    this.worldOrbitCenter.copy(fit.target)
    this.controls.target.copy(this.worldOrbitCenter)
    this.introTween?.kill()
    this.introTween=gsap.to(this.camera.position,{
      x:fit.position.x,y:fit.position.y,z:fit.position.z,duration:2.2,ease:'power3.out',
      onUpdate:()=>this.camera.lookAt(this.worldOrbitCenter),
      onComplete:()=>{this.introTween=null;this.syncFreeLookFromCamera()}
    })
  }

  resetCamera(animate = true) {
    // R/首次取景需要保持全览，不能在下一帧被跟车镜头拉走。
    this.journeyPlayback?.setCameraMode('FREE')
    this.introTween?.kill();this.introTween=null
    this.autoTour?.kill();this.autoTour=null
    this.pressedKeys.clear()
    this.flightVelocity.set(0, 0, 0)
    this.wheelVelocity = 0
    this.followCameraNeedsSync = true
    const fit=this.recommendedCamera()
    this.worldOrbitCenter.copy(fit.target)
    this.controls.target.copy(this.worldOrbitCenter)
    if(!animate){this.camera.position.copy(fit.position);this.camera.lookAt(this.worldOrbitCenter);this.syncFreeLookFromCamera();return}
    this.introTween = gsap.to(this.camera.position,{
      x:fit.position.x,y:fit.position.y,z:fit.position.z,duration:1.1,ease:'power2.inOut',
      onUpdate:()=>this.camera.lookAt(this.worldOrbitCenter),
      onComplete:()=>{this.introTween=null;this.syncFreeLookFromCamera()}
    })
  }

  /** Repeatable waterfront QA view. Does not change the immutable middle-orbit center. */
  previewWaterfront(): boolean {
    let center: VecXZ | null = null
    if (this.waterAreas.length) {
      const area = [...this.waterAreas].sort((a, b) => {
        const size = (ring: VecXZ[]) => Math.abs(ring.reduce((sum, p, i) => {
          const next = ring[(i + 1) % ring.length]!
          return sum + p.x * next.z - next.x * p.z
        }, 0))
        return size(b.outer) - size(a.outer)
      })[0]!
      const points = area.outer
      if (points.length) center = {
        x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
        z: points.reduce((sum, p) => sum + p.z, 0) / points.length
      }
    } else if (this.waterCorridors.length) {
      const corridor = [...this.waterCorridors].sort((a, b) => {
        const len = (p: VecXZ[]) => p.slice(1).reduce((sum, item, i) => sum + Math.hypot(item.x - p[i]!.x, item.z - p[i]!.z), 0)
        return len(b.points) - len(a.points)
      })[0]!
      if (corridor.points.length) center = corridor.points[Math.floor(corridor.points.length / 2)]!
    }
    if (!center) return false
    const point = center
    this.journeyPlayback?.setCameraMode('FREE')
    this.autoTour?.kill(); this.autoTour = null
    this.introTween?.kill(); this.introTween = null
    this.pressedKeys.clear()
    this.flightVelocity.set(0, 0, 0)
    this.wheelVelocity = 0
    const targetY = this.waterSurfaceHeight(point.x, point.z)
    const target = new THREE.Vector3(point.x, targetY + 0.2, point.z)
    const cameraPoint = new THREE.Vector3(
      THREE.MathUtils.clamp(point.x + 18, -WORLD_WIDTH * 0.80, WORLD_WIDTH * 0.80),
      targetY + 15,
      THREE.MathUtils.clamp(point.z + 24, -WORLD_DEPTH * 0.80, WORLD_DEPTH * 0.80)
    )
    const focus = { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z,
      tx: target.x, ty: target.y, tz: target.z }
    this.introTween = gsap.to(focus, {
      x: cameraPoint.x, y: cameraPoint.y, z: cameraPoint.z,
      duration: 2.0, ease: 'power2.inOut',
      onUpdate: () => {
        this.camera.position.set(focus.x, focus.y, focus.z)
        this.camera.lookAt(focus.tx, focus.ty, focus.tz)
      },
      onComplete: () => { this.introTween = null; this.syncFreeLookFromCamera() }
    })
    return true
  }

  playJourney() {
    this.autoTour?.kill()
    this.autoTour = null
    this.introTween?.kill()
    this.introTween = null
    if (this.journeyPlayback?.getCameraMode() === 'FREE') this.journeyPlayback.setCameraMode('FOLLOW')
    this.journeyPlayback?.play()
  }

  setJourneySpeed(value: number) {
    this.journeyPlayback?.setSpeedMultiplier(value)
  }

  pauseJourney() {
    this.journeyPlayback?.pause()
  }

  toggleJourney() {
    this.autoTour?.kill()
    this.autoTour = null
    this.introTween?.kill()
    this.introTween = null
    this.journeyPlayback?.toggle()
  }

  restartJourney() {
    this.autoTour?.kill()
    this.autoTour = null
    this.journeyPlayback?.restart(true)
  }

  nextJourneyStop() {
    this.journeyPlayback?.nextStop()
  }

  previousJourneyStop() {
    this.journeyPlayback?.previousStop()
  }

  setJourneyCameraMode(mode: JourneyCameraMode) {
    const before = this.journeyPlayback?.getCameraMode()
    this.journeyPlayback?.setCameraMode(mode)
    if (before !== mode) {
      this.flightVelocity.set(0, 0, 0)
      this.wheelVelocity = 0
      this.followCameraNeedsSync = true
    }
    if (mode === 'FREE') this.syncFreeLookFromCamera()
  }

  playTour() {
    this.journeyPlayback?.pause()
    this.journeyPlayback?.setCameraMode('FREE')
    this.introTween?.kill()
    this.introTween = null
    this.autoTour?.kill()
    const points = this.routeCurve?.getPoints(5) || [new THREE.Vector3(0, 0, 0)]
    const tl = gsap.timeline({
      onComplete: () => {
        this.autoTour = null
        this.worldOrbitCenter.set(0, 1.8 + (this.options.dem?.verticalRange || 0) * 0.18, 0)
        this.controls.target.copy(this.worldOrbitCenter)
        this.syncFreeLookFromCamera()
      }
    })
    const start = points[0] || new THREE.Vector3(0, 0, 0)
    tl.to(this.camera.position, { x: start.x - 15, y: 32, z: start.z + 38, duration: 1.8, ease: 'power2.inOut' }, 0)
    tl.to(this.controls.target, { x: start.x, y: start.y + 2, z: start.z, duration: 1.8, ease: 'power2.inOut' }, 0)
    points.slice(1).forEach((p, i) => {
      const sign = i % 2 === 0 ? 1 : -1
      tl.to(this.camera.position, { x: p.x + 18 * sign, y: 26 + (i % 3) * 4, z: p.z + 28, duration: 2.4, ease: 'sine.inOut' })
      tl.to(this.controls.target, { x: p.x, y: p.y + 2.5, z: p.z, duration: 2.4, ease: 'sine.inOut' }, '<')
    })
    const relief = this.options.dem?.verticalRange || 0
    tl.to(this.camera.position, { x: -8, y: 62 + relief * 0.34, z: 94 + relief * 0.20, duration: 2.4, ease: 'power2.inOut' })
    tl.to(this.controls.target, { x: 0, y: 1.8 + relief * 0.18, z: 0, duration: 2.4, ease: 'power2.inOut' }, '<')
    this.autoTour = tl
  }

  private updateJourneyCamera(pose: { position: THREE.Vector3; tangent: THREE.Vector3 }, delta: number) {
    const mode = this.journeyPlayback?.getCameraMode()
    if (!mode || mode === 'FREE' || this.freeLookActive || this.middleOrbitActive || this.autoTour || this.introTween) return

    const tangent = pose.tangent.clone()
    tangent.y = 0
    if (tangent.lengthSq() < 1e-6) tangent.set(0, 0, -1)
    tangent.normalize()
    const right = new THREE.Vector3().crossVectors(tangent, this.camera.up).normalize()
    const target = pose.position.clone().addScaledVector(tangent, mode === 'FOLLOW' ? 4.8 : 1.6)
    target.y += mode === 'FOLLOW' ? 1.5 : 0.8

    const desired = pose.position.clone()
    if (mode === 'FOLLOW') {
      desired.addScaledVector(tangent, -11.5)
      desired.addScaledVector(right, 4.2)
      desired.y += 7.2
    } else {
      desired.addScaledVector(tangent, -4.5)
      desired.addScaledVector(right, 5.5)
      desired.y += 27
    }

    const alpha = cinematicDamping(delta, mode === 'FOLLOW' ? 3.5 : 2.5)
    if (this.followCameraNeedsSync) {
      this.cameraTarget.copy(target)
      this.followCameraNeedsSync = false
    } else this.cameraTarget.lerp(target, cinematicDamping(delta, 5.0))
    this.camera.position.lerp(desired, alpha)
    this.camera.lookAt(this.cameraTarget)
    this.syncFreeLookFromCamera()
  }

  resize() {
    const width = Math.max(1, this.options.container.clientWidth)
    const height = Math.max(1, this.options.container.clientHeight)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
    this.labelRenderer.setSize(width, height)
    this.composer.setSize(width, height)
    const ratio=this.renderer.getPixelRatio()
    this.antialiasPass.uniforms['resolution']!.value.set(1/(width*ratio),1/(height*ratio))
  }

  private async upgradeWithAssetModels() {
    if (!this.assetUpgrades.length || this.options.quality.assetUpgradeLimit <= 0) {
      this.options.onAssetProgress?.(0, 0)
      return
    }
    const available = await this.assetLibrary.loadManifest()
    if (!available || !this.alive) {
      this.options.onAssetProgress?.(-1, 0)
      return
    }

    const slots = this.assetUpgrades.slice(0, this.options.quality.assetUpgradeLimit)
    let completed = 0
    let succeeded = 0
    this.options.onAssetProgress?.(0, slots.length)
    for (const slot of slots) {
      if (!this.alive) return
      const model = await this.assetLibrary.instantiate(slot.category, slot.seed, {
        width: slot.width,
        depth: slot.depth,
        height: slot.height,
        preserveHorizontalAspect: true,
        preserveProportions: true
      })
      if (model && this.alive) {
        const localYOffset = model.position.y
        model.position.set(slot.x, slot.y + localYOffset, slot.z)
        model.rotation.y += slot.yaw
        model.traverse(object => {
          const mesh = object as THREE.Mesh
          if (!mesh.isMesh) return
          mesh.castShadow = true
          mesh.receiveShadow = true
        })
        this.root.add(model)
        this.visualModeController?.refreshMaterials()
        slot.fallbackObjects.forEach(object => { object.visible = false })
        succeeded+=1
      }
      completed += 1
      this.options.onAssetProgress?.(succeeded, slots.length)
      await new Promise<void>(resolve => window.setTimeout(resolve, 0))
    }
  }

  /** Switch independently of scene data and camera/vehicle state; no OSM or DEM rebuild. */
  setVisualMode(mode: WorldVisualMode) {
    this.visualModeController?.setMode(mode)
    this.options.container.dataset.visualMode = mode
  }

  /** UI quality switch: changes render resolution without recreating Three.js or the journey. */
  setRenderQuality(mode: 'SHARP' | 'BALANCED') {
    this.renderQuality = mode
    const requestedRatio = mode === 'SHARP' ? 1.8 : 1.15
    const ratio = Math.max(1, Math.min(window.devicePixelRatio || 1, requestedRatio))
    this.renderer.setPixelRatio(ratio)
    this.composer.setPixelRatio(ratio)
    this.resize()
  }

  /** Camera-speed control; does not change vehicle playback speed. */
  setCameraSpeedMultiplier(value: number) {
    this.cameraSpeedMultiplier = THREE.MathUtils.clamp(Number.isFinite(value) ? value : 1.8, 0.75, 3.5)
  }

  private updateSmoothedLook(delta: number) {
    if (this.middleOrbitActive || this.autoTour || this.introTween ||
        (this.journeyPlayback && this.journeyPlayback.getCameraMode() !== 'FREE')) return
    const alpha = 1 - Math.exp(-Math.min(delta, 0.05) * 14)
    const turn = Math.atan2(Math.sin(this.lookTargetYaw - this.freeYaw), Math.cos(this.lookTargetYaw - this.freeYaw))
    this.freeYaw += turn * alpha
    this.freePitch += (this.lookTargetPitch - this.freePitch) * alpha
    if (Math.abs(turn) > 0.00001 || Math.abs(this.freePitch - this.lookTargetPitch) > 0.00001) this.applyFreeLook()
  }

  private syncFreeLookFromCamera() {
    const euler = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ')
    this.freePitch = THREE.MathUtils.clamp(euler.x, THREE.MathUtils.degToRad(-84), THREE.MathUtils.degToRad(84))
    this.freeYaw = euler.y
    this.lookTargetYaw = this.freeYaw
    this.lookTargetPitch = this.freePitch
  }

  private applyFreeLook() {
    this.camera.rotation.order = 'YXZ'
    this.camera.rotation.set(this.freePitch, this.freeYaw, 0, 'YXZ')
  }

  private keepCameraAboveWorld() {
    const x = THREE.MathUtils.clamp(this.camera.position.x, -WORLD_WIDTH * 0.9, WORLD_WIDTH * 0.9)
    const z = THREE.MathUtils.clamp(this.camera.position.z, -WORLD_DEPTH * 0.9, WORLD_DEPTH * 0.9)
    const floor = Math.max(1.4, this.baseTerrainHeight(x, z) + 1.0)
    if (this.camera.position.y < floor) this.camera.position.y = floor
  }

  /** Smoothed keyboard flight + inertial wheel dolly, both independent of FPS. */
  private updateFreeCamera(delta: number) {
    const dt = Math.min(Math.max(delta, 0), 0.05)
    if (this.middleOrbitActive || this.autoTour || this.introTween ||
      (this.journeyPlayback && this.journeyPlayback.getCameraMode() !== 'FREE')) {
      this.flightVelocity.set(0, 0, 0)
      this.wheelVelocity = 0
      return
    }
    const forward = new THREE.Vector3()
    this.camera.getWorldDirection(forward)
    const horizontalForward = new THREE.Vector3(forward.x, 0, forward.z)
    if (horizontalForward.lengthSq() < 1e-6) horizontalForward.set(0, 0, -1)
    horizontalForward.normalize()
    const right = new THREE.Vector3().crossVectors(horizontalForward, this.camera.up).normalize()
    const desired = new THREE.Vector3()
    if (this.pressedKeys.has('ArrowUp')) desired.add(horizontalForward)
    if (this.pressedKeys.has('ArrowDown')) desired.sub(horizontalForward)
    if (this.pressedKeys.has('ArrowRight')) desired.add(right)
    if (this.pressedKeys.has('ArrowLeft')) desired.sub(right)
    if (this.pressedKeys.has('Space')) desired.y += 1
    if (this.pressedKeys.has('ShiftLeft') || this.pressedKeys.has('ShiftRight')) desired.y -= 1
    const distanceFactor = THREE.MathUtils.clamp(this.camera.position.distanceTo(this.worldOrbitCenter) / 80, 0.8, 2.1)
    if (desired.lengthSq() > 0) desired.normalize().multiplyScalar(this.options.quality.cameraMoveSpeed * this.cameraSpeedMultiplier * distanceFactor)
    // Strong acceleration, gentler braking: cinematic but responsive, without post-release drifting.
    const response = desired.lengthSq() ? 12 : 16
    this.flightVelocity.lerp(desired, 1 - Math.exp(-dt * response))
    if (this.flightVelocity.lengthSq() < 0.001) this.flightVelocity.set(0, 0, 0)
    this.camera.position.addScaledVector(this.flightVelocity, dt)

    if (Math.abs(this.wheelVelocity) > 0.05) {
      const viewForward = new THREE.Vector3()
      this.camera.getWorldDirection(viewForward).normalize()
      this.camera.position.addScaledVector(viewForward, this.wheelVelocity * dt * this.cameraSpeedMultiplier)
      this.wheelVelocity *= Math.exp(-dt * 12)
    } else this.wheelVelocity = 0
    if (this.flightVelocity.lengthSq() > 0 || this.wheelVelocity !== 0) this.keepCameraAboveWorld()
  }

  private animate() {
    if (!this.alive) return
    const delta = this.clock.getDelta()
    const elapsed = this.clock.elapsedTime
    if (this.middleOrbitActive) this.controls.update()
    this.updateSmoothedLook(delta)
    this.updateFreeCamera(delta)
    if (this.autoTour || this.introTween) {
      this.camera.lookAt(this.controls.target)
    }

    if (this.journeyPlayback && this.vehicleController) {
      const pose = this.journeyPlayback.update(delta)
      this.vehicleController.update(pose, delta)
      if (this.routeProgressLine) {
        this.routeProgressLine.geometry.setDrawRange(0,
          visibleJourneyVertices(this.journeyPlayback.cumulative, pose.distance))
      }
      this.updateJourneyCamera(pose, delta)
    }

    this.atmosphere?.update(elapsed)
    try {
      this.visualModeController?.update(delta)
      this.visualModeController?.updateReflection()
    } catch (error) {
      console.error('[TM-CW] Cinema animation/reflection error:', error)
      try {
        this.visualModeController?.setMode('GEO')
        this.options.container.dataset.visualMode = 'GEO'
        this.options.onRenderWarning?.('电影水面更新失败，已自动退回地理探索模式。', 'GEO')
      } catch (fallbackError) {
        console.error('[TM-CW] Cinema state restore failed:', fallbackError)
      }
    }

    // Never discard a successfully constructed geographic world just because
    // an optional postprocessing pass or CINEMA shader fails on one GPU.
    try {
      if (this.composerFailed) this.renderer.render(this.scene, this.camera)
      else this.composer.render()
    } catch (error) {
      console.error('[TM-CW] Scene render error (full stack):', error)
      if (!this.composerFailed) {
        this.composerFailed = true
        this.options.onRenderWarning?.('后期渲染异常，已自动尝试基础渲染；请检查 F12 Console 日志。')
      }
      try {
        this.renderer.render(this.scene, this.camera)
      } catch (directError) {
        console.error('[TM-CW] Direct WebGL fallback failed:', directError)
        if (!this.visualRenderFailed) {
          this.visualRenderFailed = true
          try {
            this.visualModeController?.setMode('GEO')
            this.options.container.dataset.visualMode = 'GEO'
            this.renderer.render(this.scene, this.camera)
            this.options.onRenderWarning?.('电影材质在当前环境渲染失败，已自动切换到地理探索兼容模式。', 'GEO')
          } catch (geoError) {
            console.error('[TM-CW] Geographic render fallback failed:', geoError)
            this.options.onRenderError?.(geoError instanceof Error ? geoError.message : String(geoError))
            return
          }
        } else {
          this.options.onRenderError?.(directError instanceof Error ? directError.message : String(directError))
          return
        }
      }
    }
    try {
      this.labelRenderer.render(this.scene, this.camera)
    } catch (error) {
      // 3D scene and animation remain usable if the optional DOM labels fail.
      console.error('[TM-CW] Label renderer issue:', error)
    }
    this.frame = requestAnimationFrame(this.animate)
  }

  destroy() {
    this.alive = false
    cancelAnimationFrame(this.frame)
    this.resizeObserver?.disconnect()
    this.autoTour?.kill()
    this.introTween?.kill()
    this.renderer.domElement.removeEventListener('pointerenter', this.onPointerEnter)
    this.renderer.domElement.removeEventListener('pointerleave', this.onPointerLeave)
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown)
    this.renderer.domElement.removeEventListener('pointermove', this.onPointerMove)
    window.removeEventListener('pointerup', this.onPointerUp)
    this.renderer.domElement.removeEventListener('wheel', this.onWheel)
    this.renderer.domElement.removeEventListener('contextmenu', this.onContextMenu)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    this.pressedKeys.clear()
    this.controls.dispose()
    this.assetLibrary.dispose()
    this.atmosphere?.dispose()
    this.atmosphere = null
    this.visualModeController?.dispose()
    this.visualModeController = null
    this.labels.forEach(label => label.element.remove())
    this.disposeList.forEach(item => item.dispose())
    this.composer.passes.forEach(pass=>pass.dispose())
    this.composer.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
    this.labelRenderer.domElement.remove()
    this.root.clear()
  }
}
