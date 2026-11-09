import polygonClipping from 'polygon-clipping'

export type VecXZ = { x: number; z: number }
export type PolygonArea = { outer: VecXZ[]; holes: VecXZ[][] }

type PcPoint = [number, number]
type PcRing = PcPoint[]
type PcPolygon = PcRing[]
type PcMultiPolygon = PcPolygon[]

const EPS = 1e-6

export function almostSamePoint(a: VecXZ, b: VecXZ, epsilon = 1e-4) {
  return Math.abs(a.x - b.x) <= epsilon && Math.abs(a.z - b.z) <= epsilon
}

export function signedArea(points: VecXZ[]) {
  let sum = 0
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!
    const b = points[(i + 1) % points.length]!
    sum += a.x * b.z - b.x * a.z
  }
  return sum * 0.5
}

export function cleanRing(points: VecXZ[], snap = 0.012) {
  if (points.length < 3) return []
  const quantize = (v: number) => Math.round(v / snap) * snap
  const deduped: VecXZ[] = []
  for (const raw of points) {
    const p = { x: quantize(raw.x), z: quantize(raw.z) }
    if (!deduped.length || !almostSamePoint(deduped[deduped.length - 1]!, p, snap * 0.45)) deduped.push(p)
  }
  if (deduped.length > 2 && almostSamePoint(deduped[0]!, deduped[deduped.length - 1]!, snap * 0.45)) deduped.pop()
  if (deduped.length < 3) return []

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
    if (lenA < snap * 0.55 || lenB < snap * 0.55) continue
    const cross = Math.abs(ax * bz - az * bx)
    const sin = cross / Math.max(EPS, lenA * lenB)
    if (sin < 0.0025 && ax * bx + az * bz > 0) continue
    cleaned.push(cur)
  }
  return cleaned.length >= 3 ? cleaned : deduped
}

export function pointInRing(point: VecXZ, ring: VecXZ[]) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!
    const b = ring[j]!
    const intersects = ((a.z > point.z) !== (b.z > point.z))
      && point.x < ((b.x - a.x) * (point.z - a.z)) / ((b.z - a.z) || EPS) + a.x
    if (intersects) inside = !inside
  }
  return inside
}

export function pointInArea(point: VecXZ, area: PolygonArea) {
  if (!pointInRing(point, area.outer)) return false
  return !area.holes.some(hole => pointInRing(point, hole))
}

function closePcRing(points: VecXZ[]): PcRing {
  const clean = cleanRing(points)
  if (clean.length < 3) return []
  const result = clean.map(p => [p.x, p.z] as PcPoint)
  const first = result[0]!
  const last = result[result.length - 1]!
  if (Math.abs(first[0] - last[0]) > EPS || Math.abs(first[1] - last[1]) > EPS) result.push([first[0], first[1]])
  return result
}

function toPcPolygon(area: PolygonArea): PcPolygon | null {
  const outer = closePcRing(area.outer)
  if (outer.length < 4) return null
  const holes = area.holes.map(closePcRing).filter(r => r.length >= 4)
  return [outer, ...holes]
}

function fromPcMultiPolygon(input: PcMultiPolygon): PolygonArea[] {
  const result: PolygonArea[] = []
  for (const polygon of input || []) {
    if (!polygon?.length) continue
    const outer = cleanRing((polygon[0] || []).map(([x, z]) => ({ x, z })))
    if (outer.length < 3) continue
    const holes = polygon.slice(1)
      .map(ring => cleanRing(ring.map(([x, z]) => ({ x, z }))))
      .filter(ring => ring.length >= 3)
    result.push({ outer, holes })
  }
  return result
}

export function unionAreas(areas: PolygonArea[]): PolygonArea[] {
  const polygons = areas.map(toPcPolygon).filter((p): p is PcPolygon => Boolean(p))
  if (!polygons.length) return []

  // Merge incrementally rather than feeding thousands of rings to one sweep-line
  // operation. Besides reducing peak work, this lets one malformed source polygon
  // fail without throwing away every other valid lake/reservoir in the selection.
  let merged: PcMultiPolygon = [polygons[0]!]
  for (let i = 1; i < polygons.length; i += 1) {
    try {
      merged = polygonClipping.union(merged, polygons[i]!) as PcMultiPolygon
    } catch {
      // Keep the previous valid result and append the isolated polygon as a separate
      // area. The renderer still avoids z-fighting; only this one overlap may remain.
      merged.push(polygons[i]!)
    }
  }
  return fromPcMultiPolygon(merged)
}

export function clipAreasToRect(areas: PolygonArea[], minX: number, maxX: number, minZ: number, maxZ: number): PolygonArea[] {
  const rect: PcPolygon = [[
    [minX, minZ],
    [maxX, minZ],
    [maxX, maxZ],
    [minX, maxZ],
    [minX, minZ]
  ]]
  const output: PolygonArea[] = []
  for (const area of areas) {
    const polygon = toPcPolygon(area)
    if (!polygon) continue
    try {
      const clipped = polygonClipping.intersection(polygon, rect) as PcMultiPolygon
      output.push(...fromPcMultiPolygon(clipped))
    } catch {
      // Leave malformed source geometry out instead of creating giant triangles across the world.
    }
  }
  return output
}

export function polygonAreaAbs(area: PolygonArea) {
  const outer = Math.abs(signedArea(area.outer))
  const holes = area.holes.reduce((sum, ring) => sum + Math.abs(signedArea(ring)), 0)
  return Math.max(0, outer - holes)
}

export function nearestSnapPoint(point: VecXZ, candidates: VecXZ[], maxDistance: number) {
  let best: VecXZ | null = null
  let bestDistance = maxDistance
  for (const candidate of candidates) {
    const d = Math.hypot(point.x - candidate.x, point.z - candidate.z)
    if (d < bestDistance) {
      best = candidate
      bestDistance = d
    }
  }
  return best
}
