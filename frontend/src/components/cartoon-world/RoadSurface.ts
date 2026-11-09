import polygonClipping from 'polygon-clipping'
import { cleanRing, signedArea, type PolygonArea, type VecXZ } from './topology'

type PcPoint = [number, number]
type PcRing = PcPoint[]
type PcPolygon = PcRing[]
type PcMulti = PcPolygon[]

export interface SurfaceRoad {
  points: VecXZ[]
  halfWidth: number
}

// 12 world units divides cleanRing's 0.012-unit snap grid exactly. Adjacent
// tiles therefore share the same vertices instead of developing tiny cracks.
const TILE_SIZE = 12
const MAX_TILES_PER_SHAPE = 64
const MIN_AREA = 0.0005
const SNAP = 0.012

function finitePoint(point: VecXZ): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.z)
}

function ringPolygon(points: VecXZ[]): PcPolygon | null {
  if (!points.every(finitePoint)) return null
  const cleaned = cleanRing(points, SNAP)
  if (cleaned.length < 3 || Math.abs(signedArea(cleaned)) < MIN_AREA) return null
  const ring = cleaned.map((p): PcPoint => [p.x, p.z])
  ring.push([...ring[0]!] as PcPoint)
  return [ring]
}

function snapPolygon(polygon: PcPolygon, snap: number): PcPolygon | null {
  const rings: PcRing[] = []
  for (const ring of polygon) {
    const cleaned = cleanRing(ring.map(([x, z]) => ({ x, z })), snap)
    if (cleaned.length < 3 || Math.abs(signedArea(cleaned)) < MIN_AREA) {
      if (rings.length === 0) return null
      continue // Invalid holes can be dropped, but never invent a new exterior.
    }
    const output = cleaned.map((p): PcPoint => [p.x, p.z])
    output.push([...output[0]!] as PcPoint)
    rings.push(output)
  }
  return rings.length ? rings : null
}

function snapMulti(polygons: PcMulti, snap: number): PcMulti {
  return polygons.map(p => snapPolygon(p, snap)).filter((p): p is PcPolygon => p !== null)
}

/** A failed local boolean operation must never abort the entire 3D world. */
function safeUnion(left: PcMulti, right: PcMulti, onFallback: () => void): PcMulti {
  if (!left.length) return right
  if (!right.length) return left
  try {
    return polygonClipping.union(left, right) as PcMulti
  } catch {
    // Polygon-clipping can fail when two road edges almost coincide. Retry at
    // coarser precision, preserving the original operands if that also fails.
    try {
      const a = snapMulti(left, 0.06)
      const b = snapMulti(right, 0.06)
      if (!a.length || !b.length) throw new Error('Coarse snap removed an operand')
      return polygonClipping.union(a, b) as PcMulti
    } catch {
      onFallback()
      // Local overlap may remain in this exceptional tile, but a malformed
      // OSM intersection no longer prevents other roads/terrain from loading.
      return [...left, ...right]
    }
  }
}

function mergePolygons(polygons: PcPolygon[], onFallback: () => void): PcMulti {
  // Balanced merging bounds sweep-line complexity, and it can recover from
  // individual failing pairs instead of retrying a huge broken city union.
  let level: PcMulti[] = polygons.map(p => [p])
  while (level.length > 1) {
    const next: PcMulti[] = []
    for (let i = 0; i < level.length; i += 2) {
      next.push(i + 1 < level.length
        ? safeUnion(level[i]!, level[i + 1]!, onFallback)
        : level[i]!)
    }
    level = next
  }
  return level[0] || []
}

// Clip one convex capsule piece to a tile using Sutherland-Hodgman. This avoids
// invoking polygon-clipping just to intersect thousands of simple rectangles.
function clipRingToTile(ring: PcRing, x0: number, x1: number, z0: number, z1: number): PcPolygon | null {
  let points = ring.slice(0, -1).map(([x, z]) => ({ x, z }))
  const edges: Array<{ inside: (p: VecXZ) => boolean; cross: (a: VecXZ, b: VecXZ) => VecXZ }> = [
    { inside: p => p.x >= x0, cross: (a, b) => ({ x: x0, z: a.z + (b.z - a.z) * ((x0 - a.x) / (b.x - a.x)) }) },
    { inside: p => p.x <= x1, cross: (a, b) => ({ x: x1, z: a.z + (b.z - a.z) * ((x1 - a.x) / (b.x - a.x)) }) },
    { inside: p => p.z >= z0, cross: (a, b) => ({ z: z0, x: a.x + (b.x - a.x) * ((z0 - a.z) / (b.z - a.z)) }) },
    { inside: p => p.z <= z1, cross: (a, b) => ({ z: z1, x: a.x + (b.x - a.x) * ((z1 - a.z) / (b.z - a.z)) }) }
  ]
  for (const edge of edges) {
    const next: VecXZ[] = []
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i]!
      const b = points[(i + 1) % points.length]!
      const ai = edge.inside(a), bi = edge.inside(b)
      if (ai && bi) next.push(b)
      else if (ai) next.push(edge.cross(a, b))
      else if (bi) next.push(edge.cross(a, b), b)
    }
    points = next
    if (points.length < 3) return null
  }
  return ringPolygon(points)
}

function toAreas(polygons: PcMulti): PolygonArea[] {
  const areas: PolygonArea[] = []
  for (const polygon of polygons) {
    if (!polygon.length) continue
    const outer = cleanRing(polygon[0]!.map(([x, z]) => ({ x, z })))
    if (outer.length < 3 || Math.abs(signedArea(outer)) < MIN_AREA) continue
    const holes = polygon.slice(1)
      .map(r => cleanRing(r.map(([x, z]) => ({ x, z }))))
      .filter(r => r.length >= 3 && Math.abs(signedArea(r)) >= MIN_AREA)
    areas.push({ outer, holes })
  }
  return areas
}

/**
 * Convert OSM line corridors into a watertight surface where possible.
 * A local malformed junction is isolated; it must not fail scene construction.
 */
export function buildRoadSurface(roads: SurfaceRoad[], border = 0): PolygonArea[] {
  const polygons: PcPolygon[] = []
  const add = (points: VecXZ[]) => {
    const polygon = ringPolygon(points)
    if (polygon) polygons.push(polygon)
  }

  for (const road of roads) {
    const width = road.halfWidth + border
    if (!Number.isFinite(width) || width <= 0 || width > 30) continue
    // Reject bad OSM vertices and near-duplicate points before building joints.
    const original = road.points.filter(finitePoint)
    const unique = original.filter((p, i, list) => i === 0 || Math.hypot(p.x - list[i - 1]!.x, p.z - list[i - 1]!.z) > 0.02)
    const points = unique.filter((p, i, list) => {
      if (i === 0 || i === list.length - 1) return true
      const a = list[i - 1]!, b = list[i + 1]!
      const ax = p.x - a.x, az = p.z - a.z, bx = b.x - p.x, bz = b.z - p.z
      return Math.abs(ax * bz - az * bx) > 0.008 * Math.hypot(ax, az) * Math.hypot(bx, bz) || ax * bx + az * bz < 0
    })
    if (points.length < 2) continue
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1]!, b = points[i]!
      const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz)
      if (!Number.isFinite(len) || len < 0.02) continue
      const nx = -dz / len * width, nz = dx / len * width
      add([{ x: a.x + nx, z: a.z + nz }, { x: b.x + nx, z: b.z + nz },
        { x: b.x - nx, z: b.z - nz }, { x: a.x - nx, z: a.z - nz }])
    }
    for (const p of points) {
      const ring: VecXZ[] = []
      for (let i = 0; i < 12; i += 1) {
        const a = i * Math.PI / 6
        ring.push({ x: p.x + Math.cos(a) * width, z: p.z + Math.sin(a) * width })
      }
      add(ring)
    }
  }
  if (!polygons.length) return []

  let fallbacks = 0
  const onFallback = () => { fallbacks += 1 }
  let result: PolygonArea[] = []
  if (polygons.length <= 48) {
    result = toAreas(mergePolygons(polygons, onFallback))
  } else {
    // A large city-sized union is the principal trigger for the error shown
    // in the screenshot. Spatial tiles prevent a problematic intersection
    // from poisoning unrelated roads, and avoid enormous boolean sweeps.
    const tiles = new Map<string, PcPolygon[]>()
    for (const polygon of polygons) {
      const ring = polygon[0]!
      const xs = ring.map(p => p[0]), zs = ring.map(p => p[1])
      const tx0 = Math.floor(Math.min(...xs) / TILE_SIZE)
      const tx1 = Math.floor(Math.max(...xs) / TILE_SIZE)
      const tz0 = Math.floor(Math.min(...zs) / TILE_SIZE)
      const tz1 = Math.floor(Math.max(...zs) / TILE_SIZE)
      if ((tx1 - tx0 + 1) * (tz1 - tz0 + 1) > MAX_TILES_PER_SHAPE) {
        // Malformed global way; cannot safely tile into a local road surface.
        fallbacks += 1
        continue
      }
      for (let tx = tx0; tx <= tx1; tx += 1) {
        for (let tz = tz0; tz <= tz1; tz += 1) {
          const clipped = clipRingToTile(ring, tx * TILE_SIZE, (tx + 1) * TILE_SIZE, tz * TILE_SIZE, (tz + 1) * TILE_SIZE)
          if (!clipped) continue
          const key = `${tx}:${tz}`
          if (!tiles.has(key)) tiles.set(key, [])
          tiles.get(key)!.push(clipped)
        }
      }
    }
    for (const list of tiles.values()) result.push(...toAreas(mergePolygons(list, onFallback)))
  }
  if (fallbacks) {
    console.warn(`[Travel Memory] Road topology used ${fallbacks} local fallback(s); other world geometry was preserved.`)
  }
  return result
}
