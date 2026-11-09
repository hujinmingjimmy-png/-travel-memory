import * as THREE from 'three'

export type RouteXZ = { x: number; z: number }

export type RouteRoad = {
  points: RouteXZ[]
  highway?: string
  bridge?: boolean
}

export type RouteStop = {
  id: number
  x: number
  z: number
}

export type JourneyRouteMode = 'ROAD' | 'MIXED' | 'DIRECT'

export interface JourneyRouteResult {
  points: RouteXZ[]
  stopPointIndices: number[]
  mode: JourneyRouteMode
  roadCoverage: number
}

type GraphNode = {
  key: string
  point: RouteXZ
  edges: Array<{ key: string; weight: number }>
}

const HIGHWAY_FACTOR: Record<string, number> = {
  motorway: 0.82,
  trunk: 0.86,
  primary: 0.90,
  secondary: 0.95,
  tertiary: 1.0,
  residential: 1.03,
  living_street: 1.05,
  service: 1.08,
  unclassified: 1.08,
  road: 1.08,
  track: 1.18,
  path: 1.24,
  footway: 1.28,
  pedestrian: 1.18
}

function distance(a: RouteXZ, b: RouteXZ) {
  return Math.hypot(b.x - a.x, b.z - a.z)
}

function quantize(point: RouteXZ, precision = 0.09) {
  return `${Math.round(point.x / precision)}:${Math.round(point.z / precision)}`
}

function highwayFactor(highway = '') {
  return HIGHWAY_FACTOR[String(highway).toLowerCase()] ?? 1.08
}

function dedupeConsecutive(points: RouteXZ[], epsilon = 0.025) {
  const result: RouteXZ[] = []
  for (const point of points) {
    const last = result[result.length - 1]
    if (!last || distance(last, point) > epsilon) result.push({ ...point })
  }
  return result
}

function densify(points: RouteXZ[], spacing = 0.54) {
  if (points.length < 2) return points.map(point => ({ ...point }))
  const result: RouteXZ[] = [{ ...points[0]! }]
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!
    const b = points[i]!
    const len = distance(a, b)
    const steps = Math.max(1, Math.ceil(len / spacing))
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps
      result.push({ x: THREE.MathUtils.lerp(a.x, b.x, t), z: THREE.MathUtils.lerp(a.z, b.z, t) })
    }
  }
  return dedupeConsecutive(result)
}

function buildGraph(roads: RouteRoad[]) {
  const nodes = new Map<string, GraphNode>()

  const ensureNode = (point: RouteXZ) => {
    const key = quantize(point)
    let node = nodes.get(key)
    if (!node) {
      node = { key, point: { ...point }, edges: [] }
      nodes.set(key, node)
    } else {
      // Average very small coordinate discrepancies from separately returned OSM ways.
      node.point.x = (node.point.x + point.x) * 0.5
      node.point.z = (node.point.z + point.z) * 0.5
    }
    return node
  }

  for (const road of roads) {
    if (road.points.length < 2) continue
    const factor = highwayFactor(road.highway)
    for (let i = 1; i < road.points.length; i += 1) {
      const a = road.points[i - 1]!
      const b = road.points[i]!
      const len = distance(a, b)
      if (!Number.isFinite(len) || len < 0.015 || len > 40) continue
      const na = ensureNode(a)
      const nb = ensureNode(b)
      const bridgeBonus = road.bridge ? 0.96 : 1
      const weight = len * factor * bridgeBonus
      na.edges.push({ key: nb.key, weight })
      nb.edges.push({ key: na.key, weight })
    }
  }

  return nodes
}

function nearestNode(nodes: Map<string, GraphNode>, point: RouteXZ) {
  let best: GraphNode | null = null
  let bestDistance = Infinity
  for (const node of nodes.values()) {
    const d = distance(node.point, point)
    if (d < bestDistance) {
      best = node
      bestDistance = d
    }
  }
  return { node: best, distance: bestDistance }
}

function shortestPath(nodes: Map<string, GraphNode>, startKey: string, endKey: string) {
  if (startKey === endKey) return [nodes.get(startKey)!.point]
  const dist = new Map<string, number>()
  const prev = new Map<string, string>()
  const visited = new Set<string>()
  const queue = new Set<string>([startKey])
  dist.set(startKey, 0)

  // The selected map areas are deliberately bounded; an O(N²) queue keeps this
  // implementation dependency-free and is fast enough for the Phase 3 road graph.
  while (queue.size) {
    let currentKey = ''
    let currentDistance = Infinity
    for (const key of queue) {
      const candidate = dist.get(key) ?? Infinity
      if (candidate < currentDistance) {
        currentKey = key
        currentDistance = candidate
      }
    }
    if (!currentKey) break
    queue.delete(currentKey)
    if (visited.has(currentKey)) continue
    visited.add(currentKey)
    if (currentKey === endKey) break
    const node = nodes.get(currentKey)
    if (!node) continue
    for (const edge of node.edges) {
      if (visited.has(edge.key)) continue
      const nextDistance = currentDistance + edge.weight
      if (nextDistance < (dist.get(edge.key) ?? Infinity)) {
        dist.set(edge.key, nextDistance)
        prev.set(edge.key, currentKey)
        queue.add(edge.key)
      }
    }
  }

  if (!dist.has(endKey)) return null
  const keys: string[] = [endKey]
  let cursor = endKey
  while (cursor !== startKey) {
    const parent = prev.get(cursor)
    if (!parent) return null
    keys.push(parent)
    cursor = parent
  }
  keys.reverse()
  return keys.map(key => ({ ...nodes.get(key)!.point }))
}

function safeDirectPath(a: RouteXZ, b: RouteXZ, isWaterAt?: (x: number, z: number) => boolean) {
  const points = densify([a, b], 0.5)
  if (!isWaterAt) return points
  // A direct fallback must never masquerade as a safe road route through a lake.
  // If it crosses water, arc gently to either side and keep the less-wet candidate.
  const wetScore = (candidate: RouteXZ[]) => candidate.reduce((sum, point) => sum + (isWaterAt(point.x, point.z) ? 1 : 0), 0)
  if (wetScore(points) === 0) return points

  const dx = b.x - a.x
  const dz = b.z - a.z
  const len = Math.hypot(dx, dz) || 1
  const nx = -dz / len
  const nz = dx / len
  const offset = Math.min(12, Math.max(3.5, len * 0.22))
  const midpoint = { x: (a.x + b.x) * 0.5, z: (a.z + b.z) * 0.5 }
  const candidates = [1, -1].map(sign => densify([
    a,
    { x: midpoint.x + nx * offset * sign, z: midpoint.z + nz * offset * sign },
    b
  ], 0.5))
  candidates.sort((left, right) => wetScore(left) - wetScore(right))
  return candidates[0]!
}

export function buildJourneyRoute(
  stops: RouteStop[],
  roads: RouteRoad[],
  options: {
    nearestRoadMaxDistance?: number
    isWaterAt?: (x: number, z: number) => boolean
  } = {}
): JourneyRouteResult {
  if (stops.length < 2) {
    return { points: stops.map(stop => ({ x: stop.x, z: stop.z })), stopPointIndices: stops.map((_, index) => index), mode: 'DIRECT', roadCoverage: 0 }
  }

  const graph = buildGraph(roads)
  const nearestLimit = options.nearestRoadMaxDistance ?? 12
  const output: RouteXZ[] = []
  const stopPointIndices: number[] = []
  let roadSegments = 0
  let totalSegments = 0
  let usedFallback = false

  const append = (points: RouteXZ[]) => {
    for (const point of points) {
      const last = output[output.length - 1]
      if (!last || distance(last, point) > 0.02) output.push({ ...point })
    }
  }

  append([{ x: stops[0]!.x, z: stops[0]!.z }])
  stopPointIndices.push(0)

  for (let index = 1; index < stops.length; index += 1) {
    const from = stops[index - 1]!
    const to = stops[index]!
    totalSegments += 1
    const nearestFrom = nearestNode(graph, from)
    const nearestTo = nearestNode(graph, to)
    let segment: RouteXZ[] | null = null

    if (nearestFrom.node && nearestTo.node && nearestFrom.distance <= nearestLimit && nearestTo.distance <= nearestLimit) {
      const roadPath = shortestPath(graph, nearestFrom.node.key, nearestTo.node.key)
      if (roadPath && roadPath.length) {
        segment = [
          { x: from.x, z: from.z },
          ...roadPath,
          { x: to.x, z: to.z }
        ]
        roadSegments += 1
      }
    }

    if (!segment) {
      usedFallback = true
      segment = safeDirectPath(from, to, options.isWaterAt)
    }

    append(densify(segment, 0.48))
    stopPointIndices.push(Math.max(0, output.length - 1))
  }

  const coverage = totalSegments ? roadSegments / totalSegments : 0
  return {
    points: output,
    stopPointIndices,
    mode: roadSegments === totalSegments ? 'ROAD' : roadSegments > 0 || usedFallback ? 'MIXED' : 'DIRECT',
    roadCoverage: coverage
  }
}
