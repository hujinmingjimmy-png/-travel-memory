import * as THREE from 'three'

/**
 * Restrained physically based material treatments for the cinematic view.
 * These are authored looks, not real-world material measurements. No new
 * textures, network downloads, geometry or GPU post-processes are required.
 *
 * GEO mode keeps the original MeshToonMaterial. GLB materials already using
 * PBR are intentionally left intact by the visual-mode controller.
 */
export type CinematicMaterialProfile = Readonly<{
  roughness: number
  metalness: number
  clearcoat: number
  clearcoatRoughness: number
  envMapIntensity: number
}>

const DEFAULT_PROFILE: CinematicMaterialProfile = Object.freeze({
  roughness: 0.89, metalness: 0, clearcoat: 0, clearcoatRoughness: 0.7,
  envMapIntensity: 0.7
})

const PROFILES: Record<string, CinematicMaterialProfile> = {
  'tm-building-home': { roughness: 0.92, metalness: 0, clearcoat: 0.02, clearcoatRoughness: 0.84, envMapIntensity: 0.5 },
  'tm-building-apartment': { roughness: 0.82, metalness: 0, clearcoat: 0.10, clearcoatRoughness: 0.64, envMapIntensity: 0.72 },
  'tm-building-office': { roughness: 0.42, metalness: 0.06, clearcoat: 0.32, clearcoatRoughness: 0.27, envMapIntensity: 1.0 },
  'tm-building-retail': { roughness: 0.62, metalness: 0.02, clearcoat: 0.23, clearcoatRoughness: 0.45, envMapIntensity: 0.9 },
  'tm-building-industrial': { roughness: 0.76, metalness: 0.10, clearcoat: 0.05, clearcoatRoughness: 0.74, envMapIntensity: 0.72 },
  'tm-building-school': { roughness: 0.87, metalness: 0, clearcoat: 0.04, clearcoatRoughness: 0.72, envMapIntensity: 0.6 },
  'tm-building-hospital': { roughness: 0.67, metalness: 0.02, clearcoat: 0.20, clearcoatRoughness: 0.42, envMapIntensity: 0.84 },
  'tm-building-public': { roughness: 0.78, metalness: 0, clearcoat: 0.11, clearcoatRoughness: 0.56, envMapIntensity: 0.72 },
  'tm-building-landmark': { roughness: 0.66, metalness: 0.06, clearcoat: 0.22, clearcoatRoughness: 0.4, envMapIntensity: 0.95 },
  'tm-roof-ceramic': { roughness: 0.76, metalness: 0, clearcoat: 0.12, clearcoatRoughness: 0.65, envMapIntensity: 0.75 },
  'tm-roof-slate': { roughness: 0.86, metalness: 0, clearcoat: 0.05, clearcoatRoughness: 0.7, envMapIntensity: 0.64 },
  'tm-vegetation-bark': { roughness: 0.99, metalness: 0, clearcoat: 0, clearcoatRoughness: 1, envMapIntensity: 0.35 },
  'tm-vegetation-needles': { roughness: 0.92, metalness: 0, clearcoat: 0.03, clearcoatRoughness: 0.86, envMapIntensity: 0.5 },
  'tm-vegetation-leaves': { roughness: 0.83, metalness: 0, clearcoat: 0.09, clearcoatRoughness: 0.74, envMapIntensity: 0.63 }
}

export function cinematicMaterialProfile(name: string): CinematicMaterialProfile {
  return PROFILES[name] ?? DEFAULT_PROFILE
}

export function createCinematicPbrMaterial(source: THREE.MeshToonMaterial): THREE.MeshPhysicalMaterial {
  const profile = cinematicMaterialProfile(source.name)
  const material = new THREE.MeshPhysicalMaterial({
    color: source.color.clone(),
    map: source.map,
    alphaMap: source.alphaMap,
    vertexColors: source.vertexColors,
    transparent: source.transparent,
    opacity: source.opacity,
    alphaTest: source.alphaTest,
    side: source.side,
    depthTest: source.depthTest,
    depthWrite: source.depthWrite,
    polygonOffset: source.polygonOffset,
    polygonOffsetFactor: source.polygonOffsetFactor,
    polygonOffsetUnits: source.polygonOffsetUnits,
    roughness: profile.roughness,
    metalness: profile.metalness,
    clearcoat: profile.clearcoat,
    clearcoatRoughness: profile.clearcoatRoughness,
    envMapIntensity: profile.envMapIntensity
  })
  material.name = `${source.name || 'tm-generic'}-cinema-pbr`
  material.toneMapped = source.toneMapped
  material.visible = source.visible
  material.fog = source.fog
  return material
}
