import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

export type AssetCategory =
  | 'building'
  | 'house'
  | 'commercial'
  | 'industrial'
  | 'tower'
  | 'tree'
  | 'shrub'
  | 'rock'

export interface AssetManifestEntry {
  id: string
  category: AssetCategory
  url: string
  source?: string
  license?: string
  weight?: number
  yOffset?: number
  rotationY?: number
}

interface AssetManifest {
  version?: number
  generatedAt?: string
  entries?: AssetManifestEntry[]
}

export interface AssetTargetBox {
  width: number
  depth: number
  height: number
  preserveHorizontalAspect?: boolean
  preserveProportions?: boolean
}

function hashString(value: string) {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function disposeMaterial(material: THREE.Material) {
  const candidate = material as THREE.Material & Record<string, unknown>
  Object.values(candidate).forEach(value => {
    if (value && typeof value === 'object' && 'isTexture' in value && (value as THREE.Texture).isTexture) {
      ;(value as THREE.Texture).dispose()
    }
  })
  material.dispose()
}

/**
 * Loads optional local GLB/glTF cartoon assets from /public/models/cartoon-world.
 *
 * The renderer never depends on this library to work. If the manifest is empty,
 * missing, or an asset fails to load, the existing procedural building remains.
 * That makes the asset stage safe to apply before the actual asset pack exists.
 */
export class CartoonAssetLibrary {
  private readonly loader = new GLTFLoader()
  private manifestLoaded = false
  private entries: AssetManifestEntry[] = []
  private readonly templateCache = new Map<string, Promise<THREE.Group | null>>()
  private readonly ownedTemplates = new Set<THREE.Group>()

  async loadManifest() {
    if (this.manifestLoaded) return this.entries.length > 0
    this.manifestLoaded = true

    try {
      const response = await fetch('/models/cartoon-world/manifest.json', { cache: 'no-store' })
      if (!response.ok) return false
      const manifest = await response.json() as AssetManifest
      this.entries = Array.isArray(manifest.entries)
        ? manifest.entries.filter(entry => Boolean(entry?.id && entry?.url && entry?.category)).map(entry=>({...entry,url:entry.url.replace(/\\+/g,'/')}))
        : []
      return this.entries.length > 0
    } catch (error) {
      console.info('[CartoonWorld3D] optional 3D asset manifest unavailable; using procedural fallback.', error)
      return false
    }
  }

  count(category?: AssetCategory) {
    if (!category) return this.entries.length
    return this.entries.filter(entry => entry.category === category).length
  }

  private entriesFor(category: AssetCategory) {
    const exact = this.entries.filter(entry => entry.category === category)
    if (exact.length) return exact

    // Graceful category fallback: a generic building is still preferable to a GIS box.
    if (['house', 'commercial', 'tower'].includes(category)) {
      const generic = this.entries.filter(entry => entry.category === 'building')
      if (generic.length) return generic
    }

    return []
  }

  private chooseEntry(category: AssetCategory, seed: string) {
    const candidates = this.entriesFor(category)
    if (!candidates.length) return null

    const weighted: AssetManifestEntry[] = []
    candidates.forEach(entry => {
      const repeat = clamp(Math.round(entry.weight ?? 1), 1, 6)
      for (let i = 0; i < repeat; i += 1) weighted.push(entry)
    })

    return weighted[hashString(seed) % weighted.length] ?? candidates[0] ?? null
  }

  private loadTemplate(entry: AssetManifestEntry) {
    const cached = this.templateCache.get(entry.url)
    if (cached) return cached

    const promise = this.loader.loadAsync(entry.url)
      .then(gltf => {
        const root = gltf.scene || gltf.scenes?.[0]
        if (!root) return null
        root.updateMatrixWorld(true)
        this.ownedTemplates.add(root)
        return root
      })
      .catch(error => {
        console.warn(`[CartoonWorld3D] failed to load model ${entry.url}`, error)
        return null
      })

    this.templateCache.set(entry.url, promise)
    return promise
  }

  async instantiate(category: AssetCategory, seed: string, target: AssetTargetBox) {
    if (!(await this.loadManifest())) return null
    const entry = this.chooseEntry(category, seed)
    if (!entry) return null

    const template = await this.loadTemplate(entry)
    if (!template) return null

    const clone = template.clone(true)
    clone.updateMatrixWorld(true)

    clone.traverse(object => {
      const mesh = object as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(material => {
          material.transparent = Boolean(material.transparent)
        })
      }
    })

    const box = new THREE.Box3().setFromObject(clone)
    const size = new THREE.Vector3()
    const center = new THREE.Vector3()
    box.getSize(size)
    box.getCenter(center)

    if (size.x < 1e-5 || size.y < 1e-5 || size.z < 1e-5) return null

    // Center the imported asset and place its lowest point on y=0.
    clone.position.set(-center.x, -box.min.y, -center.z)

    const wrapper = new THREE.Group()
    wrapper.name = `asset:${entry.id}`
    wrapper.add(clone)

    let scaleX = target.width / size.x
    let scaleZ = target.depth / size.z
    if (target.preserveHorizontalAspect) {
      const horizontal = Math.min(scaleX, scaleZ)
      scaleX = horizontal
      scaleZ = horizontal
    }
    let scaleY = target.height / size.y
    if(target.preserveProportions){const uniform=Math.min(scaleX,scaleY,scaleZ);scaleX=uniform;scaleY=uniform;scaleZ=uniform}

    wrapper.scale.set(
      clamp(scaleX, 0.04, 7.5),
      clamp(scaleY, 0.04, 7.5),
      clamp(scaleZ, 0.04, 7.5)
    )
    wrapper.rotation.y = entry.rotationY ?? 0
    wrapper.position.y += entry.yOffset ?? 0
    wrapper.userData.assetId = entry.id
    wrapper.userData.assetSource = entry.source || ''
    wrapper.userData.assetLicense = entry.license || ''
    return wrapper
  }

  dispose() {
    this.ownedTemplates.forEach(template => {
      template.traverse(object => {
        const mesh = object as THREE.Mesh
        if (!mesh.isMesh) return
        mesh.geometry?.dispose()
        if (Array.isArray(mesh.material)) mesh.material.forEach(disposeMaterial)
        else if (mesh.material) disposeMaterial(mesh.material)
      })
    })
    this.ownedTemplates.clear()
    this.templateCache.clear()
    this.entries = []
  }
}
