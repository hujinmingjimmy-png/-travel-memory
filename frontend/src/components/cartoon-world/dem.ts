import type { GeoBounds } from './geo'
import { WORLD_DEPTH, WORLD_WIDTH } from './geo'

export type DemSource = 'AWS_TERRARIUM' | 'PROCEDURAL'

export interface DemTerrainData {
  source: DemSource
  message: string
  zoom: number
  width: number
  height: number
  rawMin: number
  rawMax: number
  rawRange: number
  verticalRange: number
  heights: Float32Array
  sampleWorld: (x: number, z: number) => number
}

type TilePixels = {
  width: number
  height: number
  data: Uint8ClampedArray
}

type TileCoord = { x: number; y: number }

const TERRARIUM_S3 = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
const TERRARIUM_S3_VIRTUAL = 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png'
const MAX_TILES = 12
const GRID_WIDTH = 65
const GRID_HEIGHT = 45

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function latToMercatorY(lat: number) {
  const clamped = clamp(lat, -85.05112878, 85.05112878)
  const rad = clamped * Math.PI / 180
  return (1 - Math.asinh(Math.tan(rad)) / Math.PI) / 2
}

function lngToMercatorX(lng: number) {
  return (lng + 180) / 360
}

function tileFloat(lng: number, lat: number, zoom: number) {
  const n = 2 ** zoom
  return {
    x: lngToMercatorX(lng) * n,
    y: latToMercatorY(lat) * n
  }
}

function tileCount(bounds: GeoBounds, zoom: number) {
  const nw = tileFloat(bounds.southWestLng, bounds.northEastLat, zoom)
  const se = tileFloat(bounds.northEastLng, bounds.southWestLat, zoom)
  const minX = Math.floor(Math.min(nw.x, se.x))
  const maxX = Math.floor(Math.max(nw.x, se.x))
  const minY = Math.floor(Math.min(nw.y, se.y))
  const maxY = Math.floor(Math.max(nw.y, se.y))
  return Math.max(1, maxX - minX + 1) * Math.max(1, maxY - minY + 1)
}

function chooseZoom(bounds: GeoBounds) {
  // z14 is the highest zoom reliably documented for the classic Terrarium public set.
  // Reduce zoom until the current selection can be fetched in a small number of tiles.
  for (let zoom = 14; zoom >= 8; zoom -= 1) {
    if (tileCount(bounds, zoom) <= MAX_TILES) return zoom
  }
  return 8
}

function templateUrl(template: string, zoom: number, x: number, y: number) {
  return template
    .replace('{z}', String(zoom))
    .replace('{x}', String(x))
    .replace('{y}', String(y))
}

async function decodeTile(url: string, signal?: AbortSignal): Promise<TilePixels> {
  const response = await fetch(url, { signal, mode: 'cors', cache: 'force-cache' })
  if (!response.ok) throw new Error(`DEM tile ${response.status}`)
  const blob = await response.blob()
  const bitmap = await createImageBitmap(blob)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('Canvas 2D unavailable')
    ctx.drawImage(bitmap, 0, 0)
    const image = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
    return { width: bitmap.width, height: bitmap.height, data: image.data }
  } finally {
    bitmap.close()
  }
}

function decodeElevation(tile: TilePixels, px: number, py: number) {
  const x = clamp(Math.floor(px), 0, tile.width - 1)
  const y = clamp(Math.floor(py), 0, tile.height - 1)
  const index = (y * tile.width + x) * 4
  const r = tile.data[index] || 0
  const g = tile.data[index + 1] || 0
  const b = tile.data[index + 2] || 0
  return r * 256 + g + b / 256 - 32768
}

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return 0
  const index = clamp((sorted.length - 1) * p, 0, sorted.length - 1)
  const lo = Math.floor(index)
  const hi = Math.ceil(index)
  const t = index - lo
  return sorted[lo]! * (1 - t) + sorted[hi]! * t
}

function chooseVerticalRange(rawRange: number) {
  // Phase 2.5.1: preserve real relief but reduce vertical exaggeration.
  // This keeps roads believable and prevents city blocks from looking like steep cliffs.
  if (rawRange < 4) return 0.42
  if (rawRange < 12) return 0.82
  if (rawRange < 35) return 1.55
  if (rawRange < 90) return 2.75
  if (rawRange < 220) return 4.25
  if (rawRange < 600) return 6.2
  return 8.0
}

function smoothGrid(input: Float32Array, width: number, height: number, passes = 2) {
  let current = new Float32Array(input)
  for (let pass = 0; pass < passes; pass += 1) {
    const next = new Float32Array(current.length)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let sum = 0
        let weight = 0
        for (let oy = -1; oy <= 1; oy += 1) {
          for (let ox = -1; ox <= 1; ox += 1) {
            const sx = clamp(x + ox, 0, width - 1)
            const sy = clamp(y + oy, 0, height - 1)
            const w = ox === 0 && oy === 0 ? 4 : (ox === 0 || oy === 0 ? 2 : 1)
            sum += current[sy * width + sx]! * w
            weight += w
          }
        }
        next[y * width + x] = sum / weight
      }
    }
    current = next
  }
  return current
}

function makeSampler(heights: Float32Array, width: number, height: number) {
  return (x: number, z: number) => {
    const u = clamp(x / WORLD_WIDTH + 0.5, 0, 1)
    const v = clamp(z / WORLD_DEPTH + 0.5, 0, 1)
    const fx = u * (width - 1)
    // world z is positive south, and the grid is written north -> south.
    const fy = v * (height - 1)
    const x0 = Math.floor(fx)
    const y0 = Math.floor(fy)
    const x1 = Math.min(width - 1, x0 + 1)
    const y1 = Math.min(height - 1, y0 + 1)
    const tx = fx - x0
    const ty = fy - y0
    const a = heights[y0 * width + x0] || 0
    const b = heights[y0 * width + x1] || 0
    const c = heights[y1 * width + x0] || 0
    const d = heights[y1 * width + x1] || 0
    const top = a + (b - a) * tx
    const bottom = c + (d - c) * tx
    return top + (bottom - top) * ty
  }
}

export async function loadDemTerrain(bounds: GeoBounds, signal?: AbortSignal): Promise<DemTerrainData | null> {
  const zoom = chooseZoom(bounds)
  const nw = tileFloat(bounds.southWestLng, bounds.northEastLat, zoom)
  const se = tileFloat(bounds.northEastLng, bounds.southWestLat, zoom)
  const minX = Math.floor(Math.min(nw.x, se.x))
  const maxX = Math.floor(Math.max(nw.x, se.x))
  const minY = Math.floor(Math.min(nw.y, se.y))
  const maxY = Math.floor(Math.max(nw.y, se.y))

  const coords: TileCoord[] = []
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) coords.push({ x, y })
  }
  if (!coords.length || coords.length > MAX_TILES) return null

  const configured = String(import.meta.env.VITE_TERRARIUM_TILE_URL || '').trim()
  const templates = Array.from(new Set([configured, TERRARIUM_S3, TERRARIUM_S3_VIRTUAL].filter(Boolean)))
  const tiles = new Map<string, TilePixels>()

  for (const coord of coords) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    let loaded: TilePixels | null = null
    for (const template of templates) {
      try {
        loaded = await decodeTile(templateUrl(template, zoom, coord.x, coord.y), signal)
        break
      } catch (error) {
        if (signal?.aborted) throw error
      }
    }
    if (loaded) tiles.set(`${coord.x}/${coord.y}`, loaded)
  }

  if (tiles.size === 0) return null

  const raw = new Float32Array(GRID_WIDTH * GRID_HEIGHT)
  const finite: number[] = []
  for (let gy = 0; gy < GRID_HEIGHT; gy += 1) {
    const v = gy / (GRID_HEIGHT - 1)
    const lat = bounds.northEastLat + (bounds.southWestLat - bounds.northEastLat) * v
    for (let gx = 0; gx < GRID_WIDTH; gx += 1) {
      const u = gx / (GRID_WIDTH - 1)
      const lng = bounds.southWestLng + (bounds.northEastLng - bounds.southWestLng) * u
      const tf = tileFloat(lng, lat, zoom)
      const tx = Math.floor(tf.x)
      const ty = Math.floor(tf.y)
      const tile = tiles.get(`${tx}/${ty}`)
      let elevation = Number.NaN
      if (tile) {
        elevation = decodeElevation(tile, (tf.x - tx) * tile.width, (tf.y - ty) * tile.height)
      }
      raw[gy * GRID_WIDTH + gx] = elevation
      if (Number.isFinite(elevation) && elevation > -12000 && elevation < 10000) finite.push(elevation)
    }
  }

  if (finite.length < raw.length * 0.55) return null
  finite.sort((a, b) => a - b)
  const p05 = percentile(finite, 0.05)
  const p50 = percentile(finite, 0.50)
  const p95 = percentile(finite, 0.95)
  const rawRange = Math.max(0.5, p95 - p05)
  const verticalRange = chooseVerticalRange(rawRange)
  const heights = new Float32Array(raw.length)

  for (let i = 0; i < raw.length; i += 1) {
    const value = Number.isFinite(raw[i]) ? raw[i]! : p50
    const clipped = clamp(value, p05, p95)
    heights[i] = ((clipped - p05) / rawRange) * verticalRange
  }

  const smoothedHeights = smoothGrid(heights, GRID_WIDTH, GRID_HEIGHT, rawRange < 90 ? 3 : 2)

  return {
    source: 'AWS_TERRARIUM',
    message: `真实 DEM 已加载 · z${zoom} · 高程 ${Math.round(p05)}–${Math.round(p95)} m · 视觉起伏 ${verticalRange.toFixed(1)}`,
    zoom,
    width: GRID_WIDTH,
    height: GRID_HEIGHT,
    rawMin: p05,
    rawMax: p95,
    rawRange,
    verticalRange,
    heights: smoothedHeights,
    sampleWorld: makeSampler(smoothedHeights, GRID_WIDTH, GRID_HEIGHT)
  }
}
