export interface GeoBounds {
  southWestLng: number
  southWestLat: number
  northEastLng: number
  northEastLat: number
}

export interface WorldPoint {
  x: number
  z: number
}

export const WORLD_WIDTH = 112
export const WORLD_DEPTH = 72

export function normalizeBounds(input: Partial<GeoBounds> & { centerLng?: number | null; centerLat?: number | null }): GeoBounds {
  const centerLng = Number.isFinite(Number(input.centerLng)) ? Number(input.centerLng) : 114.3055
  const centerLat = Number.isFinite(Number(input.centerLat)) ? Number(input.centerLat) : 30.5928

  const swLng = Number(input.southWestLng)
  const swLat = Number(input.southWestLat)
  const neLng = Number(input.northEastLng)
  const neLat = Number(input.northEastLat)

  if ([swLng, swLat, neLng, neLat].every(Number.isFinite) && neLng > swLng && neLat > swLat) {
    return {
      southWestLng: swLng,
      southWestLat: swLat,
      northEastLng: neLng,
      northEastLat: neLat
    }
  }

  return {
    southWestLng: centerLng - 0.09,
    southWestLat: centerLat - 0.065,
    northEastLng: centerLng + 0.09,
    northEastLat: centerLat + 0.065
  }
}

export function projectLngLat(lng: number, lat: number, bounds: GeoBounds): WorldPoint {
  const lngSpan = Math.max(0.000001, bounds.northEastLng - bounds.southWestLng)
  const latSpan = Math.max(0.000001, bounds.northEastLat - bounds.southWestLat)
  const nx = (lng - bounds.southWestLng) / lngSpan
  const nz = (lat - bounds.southWestLat) / latSpan
  return {
    x: (nx - 0.5) * WORLD_WIDTH,
    z: (0.5 - nz) * WORLD_DEPTH
  }
}

export function unprojectWorld(x: number, z: number, bounds: GeoBounds): { lng: number; lat: number } {
  const nx = x / WORLD_WIDTH + 0.5
  const nz = 0.5 - z / WORLD_DEPTH
  return {
    lng: bounds.southWestLng + nx * (bounds.northEastLng - bounds.southWestLng),
    lat: bounds.southWestLat + nz * (bounds.northEastLat - bounds.southWestLat)
  }
}

export function isInsideBounds(lng: number, lat: number, bounds: GeoBounds, margin = 0): boolean {
  const lngMargin = (bounds.northEastLng - bounds.southWestLng) * margin
  const latMargin = (bounds.northEastLat - bounds.southWestLat) * margin
  return lng >= bounds.southWestLng - lngMargin && lng <= bounds.northEastLng + lngMargin
    && lat >= bounds.southWestLat - latMargin && lat <= bounds.northEastLat + latMargin
}

export function boundsAreaHint(bounds: GeoBounds): number {
  return Math.abs((bounds.northEastLng - bounds.southWestLng) * (bounds.northEastLat - bounds.southWestLat))
}

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state += 0x6D2B79F5
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function stringSeed(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}
