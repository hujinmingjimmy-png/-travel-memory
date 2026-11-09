import * as THREE from 'three'
import type { PolygonArea } from './topology'

/** Approximate distance to the TRUE OSM water boundary, including island holes.
 * The texture is visual only; it never changes polygon union or land cutting.
 */
export function shoreDistanceAt(x: number, z: number, area: PolygonArea): number {
  let minimumSq = Number.POSITIVE_INFINITY
  for (const ring of [area.outer, ...area.holes]) {
    for (let i = 0; i < ring.length; i += 1) {
      const a = ring[i]!
      const b = ring[(i + 1) % ring.length]!
      const dx = b.x - a.x
      const dz = b.z - a.z
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)))
      const ex = x - (a.x + dx * t)
      const ez = z - (a.z + dz * t)
      minimumSq = Math.min(minimumSq, ex * ex + ez * ez)
    }
  }
  return Math.sqrt(minimumSq)
}

export type ShoreMask = {
  texture: THREE.DataTexture
  bounds: THREE.Vector4
}

/** Bounded CPU work: at most three lakes, up to 192x192 pixels each.
 * R channel is linear distance in 0..4 scene units (8 bit, bilinear filtered).
 */
export function createShoreMask(area: PolygonArea): ShoreMask | null {
  const points = area.outer
  if (points.length < 3 || points.length > 1800) return null
  const all = [area.outer, ...area.holes]
  const edgeCount = all.reduce((total, ring) => total + ring.length, 0)
  if (edgeCount > 800) return null // bounded main-thread raster work on very complex relations
  const minX = Math.min(...points.map(p => p.x))
  const maxX = Math.max(...points.map(p => p.x))
  const minZ = Math.min(...points.map(p => p.z))
  const maxZ = Math.max(...points.map(p => p.z))
  const spanX = maxX - minX
  const spanZ = maxZ - minZ
  if (!(spanX > 0.01 && spanZ > 0.01) || !Number.isFinite(spanX + spanZ)) return null
  const longest = Math.max(spanX, spanZ)
  // Limit cost to ~5 million edge-distance evaluations per lake.
  const limit = Math.max(48, Math.min(192, Math.floor(Math.sqrt(5_000_000 / Math.max(1, edgeCount)))))
  const width = Math.max(24, Math.round(limit * spanX / longest))
  const height = Math.max(24, Math.round(limit * spanZ / longest))
  const data = new Uint8Array(width * height)
  for (let j = 0; j < height; j++) {
    const z = minZ + ((j + 0.5) / height) * spanZ
    for (let i = 0; i < width; i++) {
      const x = minX + ((i + 0.5) / width) * spanX
      data[j * width + i] = Math.round(Math.min(1, shoreDistanceAt(x, z, area) / 4) * 255)
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RedFormat, THREE.UnsignedByteType)
  texture.colorSpace = THREE.NoColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.needsUpdate = true
  return { texture, bounds: new THREE.Vector4(minX, minZ, 1 / spanX, 1 / spanZ) }
}
