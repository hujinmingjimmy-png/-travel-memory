import type { GeoBounds } from './geo'
import type { OsmQueryDetail } from './quality'

export type OsmKind = 'road' | 'building' | 'water' | 'park'

export interface OsmFeature {
  id: number
  kind: OsmKind
  tags: Record<string, string>
  geometry: Array<{ lng: number; lat: number }>
  // Multipolygon relations (large lakes, reservoirs, parks, complex buildings)
  // may contain inner rings. Keeping the holes prevents islands/courtyards from
  // being painted as water/building surface in the 3D world.
  holes?: Array<Array<{ lng: number; lat: number }>>
}

export interface OsmWorldData {
  features: OsmFeature[]
  source: 'OSM' | 'PROCEDURAL'
  message: string
  cache: 'NETWORK' | 'CACHE' | 'STALE_CACHE' | 'NONE'
  detail: OsmQueryDetail
  loadedTiles: number
  totalTiles: number
}

export interface OsmLoadProgress {
  stage: 'CACHE' | 'REQUEST' | 'PARSE' | 'DONE'
  completed: number
  total: number
  message: string
}

export interface OsmLoadOptions {
  detail?: OsmQueryDetail
  onProgress?: (progress: OsmLoadProgress) => void
  cacheMaxAgeMs?: number
}

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.nchc.org.tw/api/interpreter'
]
const CACHE_DB = 'travel-memory-geo-cache-v3-topology'
const CACHE_STORE = 'osm'
const CACHE_VERSION = 1
const DEFAULT_CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000

type LngLat = { lng: number; lat: number }
type CacheRecord = {
  key: string
  savedAt: number
  data: OsmWorldData
}

function delay(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = window.setTimeout(resolve, ms)
    const abort = () => {
      window.clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', abort, { once: true })
  })
}

function cacheKey(bounds: GeoBounds, detail: OsmQueryDetail) {
  const v = [bounds.southWestLng, bounds.southWestLat, bounds.northEastLng, bounds.northEastLat]
    .map(n => Number(n).toFixed(5))
    .join(':')
  return `topology-v2:${detail}:${v}`
}

function openCache(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  return new Promise(resolve => {
    try {
      const request = indexedDB.open(CACHE_DB, CACHE_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(CACHE_STORE)) db.createObjectStore(CACHE_STORE, { keyPath: 'key' })
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

async function readCache(key: string): Promise<CacheRecord | null> {
  const db = await openCache()
  if (!db) return null
  return new Promise(resolve => {
    try {
      const tx = db.transaction(CACHE_STORE, 'readonly')
      const request = tx.objectStore(CACHE_STORE).get(key)
      request.onsuccess = () => resolve((request.result as CacheRecord | undefined) || null)
      request.onerror = () => resolve(null)
      tx.oncomplete = () => db.close()
      tx.onerror = () => db.close()
    } catch {
      db.close()
      resolve(null)
    }
  })
}

async function writeCache(record: CacheRecord) {
  const db = await openCache()
  if (!db) return
  await new Promise<void>(resolve => {
    try {
      const tx = db.transaction(CACHE_STORE, 'readwrite')
      tx.objectStore(CACHE_STORE).put(record)
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onerror = () => { db.close(); resolve() }
      tx.onabort = () => { db.close(); resolve() }
    } catch {
      db.close()
      resolve()
    }
  })
}

function detectKind(tags: Record<string, string>): OsmKind | null {
  if (tags.highway) return 'road'
  if (tags.building || tags['building:part']) return 'building'
  if (
    tags.natural === 'water'
    || tags.water
    || tags.waterway
    || tags.landuse === 'reservoir'
    || tags.landuse === 'basin'
  ) return 'water'
  if (
    tags.leisure === 'park'
    || tags.leisure === 'garden'
    || tags.landuse === 'forest'
    || tags.landuse === 'grass'
    || tags.landuse === 'meadow'
    || tags.landuse === 'recreation_ground'
    || tags.natural === 'wood'
  ) return 'park'
  return null
}

function normalizeGeometry(geometry: any[]): LngLat[] {
  return (geometry || [])
    .map((p: any) => ({ lng: Number(p?.lon), lat: Number(p?.lat) }))
    .filter((p: LngLat) => Number.isFinite(p.lng) && Number.isFinite(p.lat))
}

function samePoint(a: LngLat, b: LngLat, epsilon = 1e-6) {
  return Math.abs(a.lng - b.lng) <= epsilon && Math.abs(a.lat - b.lat) <= epsilon
}

function closeRing(points: LngLat[]) {
  if (points.length < 3) return points
  if (!samePoint(points[0]!, points[points.length - 1]!)) points.push({ ...points[0]! })
  return points
}

function joinSegments(segments: LngLat[][]): LngLat[][] {
  const pending = segments.filter(segment => segment.length >= 2).map(segment => [...segment])
  const rings: LngLat[][] = []
  while (pending.length) {
    let chain = pending.shift()!
    let changed = true
    while (changed && pending.length) {
      changed = false
      const first = chain[0]!
      const last = chain[chain.length - 1]!
      for (let i = 0; i < pending.length; i += 1) {
        const segment = pending[i]!
        const segFirst = segment[0]!
        const segLast = segment[segment.length - 1]!
        if (samePoint(last, segFirst)) chain.push(...segment.slice(1))
        else if (samePoint(last, segLast)) chain.push(...segment.slice(0, -1).reverse())
        else if (samePoint(first, segLast)) chain = [...segment.slice(0, -1), ...chain]
        else if (samePoint(first, segFirst)) chain = [...segment.slice(1).reverse(), ...chain]
        else continue
        pending.splice(i, 1)
        changed = true
        break
      }
    }
    if (chain.length >= 3) rings.push(closeRing(chain))
  }
  return rings
}

function parseWay(element: any): OsmFeature[] {
  const tags = (element?.tags || {}) as Record<string, string>
  const kind = detectKind(tags)
  if (!kind) return []
  const geometry = normalizeGeometry(element?.geometry)
  if (geometry.length < 2) return []
  return [{ id: Number(element.id) || Math.random(), kind, tags, geometry }]
}

function pointInLngLatRing(point: LngLat, ring: LngLat[]) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!
    const b = ring[j]!
    const hit = ((a.lat > point.lat) !== (b.lat > point.lat))
      && point.lng < ((b.lng - a.lng) * (point.lat - a.lat)) / ((b.lat - a.lat) || 1e-12) + a.lng
    if (hit) inside = !inside
  }
  return inside
}

function parseRelation(element: any): OsmFeature[] {
  const tags = (element?.tags || {}) as Record<string, string>
  const kind = detectKind(tags)
  if (!kind || !Array.isArray(element?.members)) return []

  const segmentsByRole = (role: 'outer' | 'inner') => element.members
    .filter((member: any) => member?.type === 'way'
      && (role === 'outer' ? member?.role !== 'inner' : member?.role === 'inner')
      && Array.isArray(member?.geometry))
    .map((member: any) => normalizeGeometry(member.geometry))
    .filter((geometry: LngLat[]) => geometry.length >= 2)

  const outerRings = joinSegments(segmentsByRole('outer')).filter(ring => ring.length >= 4)
  const innerRings = joinSegments(segmentsByRole('inner')).filter(ring => ring.length >= 4)
  if (!outerRings.length) return []

  return outerRings.map((geometry, index) => {
    const holes = innerRings.filter(inner => inner[0] && pointInLngLatRing(inner[0], geometry))
    return {
      id: (Number(element.id) || 1) * 1000 + index,
      kind,
      tags,
      geometry,
      holes
    }
  })
}

function parseElement(element: any): OsmFeature[] {
  return element?.type === 'relation' ? parseRelation(element) : parseWay(element)
}

function splitBounds(bounds: GeoBounds, detail: OsmQueryDetail): GeoBounds[] {
  const lngSpan = bounds.northEastLng - bounds.southWestLng
  const latSpan = bounds.northEastLat - bounds.southWestLat
  const targetLng = detail === 'FULL' ? 0.055 : detail === 'BALANCED' ? 0.10 : 0.18
  const targetLat = detail === 'FULL' ? 0.045 : detail === 'BALANCED' ? 0.08 : 0.14
  const maxGrid = detail === 'FULL' ? 5 : detail === 'BALANCED' ? 4 : 3
  const cols = Math.max(1, Math.min(maxGrid, Math.ceil(lngSpan / targetLng)))
  const rows = Math.max(1, Math.min(maxGrid, Math.ceil(latSpan / targetLat)))
  const result: GeoBounds[] = []
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      result.push({
        southWestLng: bounds.southWestLng + (lngSpan * col) / cols,
        northEastLng: bounds.southWestLng + (lngSpan * (col + 1)) / cols,
        southWestLat: bounds.southWestLat + (latSpan * row) / rows,
        northEastLat: bounds.southWestLat + (latSpan * (row + 1)) / rows
      })
    }
  }
  return result
}

function buildQuery(bounds: GeoBounds, detail: OsmQueryDetail): string {
  const s = bounds.southWestLat.toFixed(6)
  const w = bounds.southWestLng.toFixed(6)
  const n = bounds.northEastLat.toFixed(6)
  const e = bounds.northEastLng.toFixed(6)
  const bbox = `${s},${w},${n},${e}`

  const landscape = `
    way["highway"~"^(motorway|trunk|primary|secondary|tertiary)$"](${bbox});
    way["natural"="water"](${bbox});
    way["water"](${bbox});
    way["landuse"~"^(reservoir|basin)$"](${bbox});
    way["waterway"~"^(river|canal|stream)$"](${bbox});
    relation["natural"="water"](${bbox});
    relation["water"](${bbox});
    relation["landuse"~"^(reservoir|basin)$"](${bbox});
    way["leisure"~"^(park|garden)$"](${bbox});
    way["landuse"~"^(forest|grass|meadow|recreation_ground)$"](${bbox});
    way["natural"="wood"](${bbox});
    relation["leisure"~"^(park|garden)$"](${bbox});
    relation["landuse"~"^(forest|grass|meadow|recreation_ground)$"](${bbox});
    relation["natural"="wood"](${bbox});`

  const balanced = `
    way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|living_street)$"](${bbox});
    way["building"](${bbox});
    relation["building"](${bbox});`

  const full = `
    way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|living_street|service)$"](${bbox});
    way["building"](${bbox});
    way["building:part"](${bbox});
    relation["building"](${bbox});`

  const body = detail === 'LANDSCAPE'
    ? landscape
    : `${detail === 'FULL' ? full : balanced}\n${landscape}`
  const timeout = detail === 'FULL' ? 28 : detail === 'BALANCED' ? 24 : 18
  return `[out:json][timeout:${timeout}];(${body});out geom;`
}

async function requestTile(endpoint: string, bounds: GeoBounds, detail: OsmQueryDetail, parentSignal?: AbortSignal): Promise<OsmFeature[]> {
  const controller = new AbortController()
  const timeoutMs = 12000
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)
  const onAbort = () => controller.abort()
  parentSignal?.addEventListener('abort', onAbort, { once: true })
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams({ data: buildQuery(bounds, detail) }),
      signal: controller.signal,
      cache: 'no-store'
    })
    if (!response.ok) throw new Error(`Overpass ${response.status}`)
    const json = await response.json()
    return (json?.elements || []).flatMap(parseElement) as OsmFeature[]
  } finally {
    window.clearTimeout(timeout)
    parentSignal?.removeEventListener('abort', onAbort)
  }
}

function buildStats(features: OsmFeature[]) {
  const counts: Record<OsmKind, number> = { road: 0, building: 0, water: 0, park: 0 }
  features.forEach(feature => { counts[feature.kind] += 1 })
  return counts
}

async function requestTileRobust(
  tile: GeoBounds,
  detail: OsmQueryDetail,
  endpoints: string[],
  signal?: AbortSignal
) {
  let lastError: unknown = null
  // 两个实例竞争首个成功响应；取消较慢请求，最多再用一个备用实例。
  const racers=endpoints.slice(0,2).map(()=>new AbortController())
  const cancel=()=>racers.forEach(c=>c.abort())
  signal?.addEventListener('abort',cancel,{once:true})
  try{
    return await Promise.any(racers.map((controller,i)=>requestTile(endpoints[i]!,tile,detail,controller.signal)))
  }catch(error){
    if(signal?.aborted)throw new DOMException('Aborted','AbortError')
    lastError=error
  }finally{cancel();signal?.removeEventListener('abort',cancel)}
  if(endpoints[2]){
    try{return await requestTile(endpoints[2],tile,detail,signal)}catch(error){if(signal?.aborted)throw error;lastError=error}
  }
  throw lastError || new Error('All Overpass instances failed')
}

export async function loadOsmWorld(bounds: GeoBounds, signal?: AbortSignal, options: OsmLoadOptions = {}): Promise<OsmWorldData> {
  const detail = options.detail || 'FULL'
  const onProgress = options.onProgress
  const key = cacheKey(bounds, detail)
  const cacheMaxAge = options.cacheMaxAgeMs ?? DEFAULT_CACHE_MAX_AGE
  onProgress?.({ stage: 'CACHE', completed: 0, total: 1, message: '检查本地真实地理缓存…' })
  const cached = await readCache(key)
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  if (cached && cacheMaxAge > 0 && Date.now() - cached.savedAt <= cacheMaxAge && cached.data.features.length) {
    const data: OsmWorldData = {
      ...cached.data,
      cache: 'CACHE',
      message: `已从本地缓存恢复真实地理 · ${cached.data.message}`
    }
    onProgress?.({ stage: 'DONE', completed: 1, total: 1, message: '真实地理缓存命中。' })
    return data
  }

  const configured = String(import.meta.env.VITE_OVERPASS_URL || '').trim()
  const endpoints = Array.from(new Set([configured, ...OVERPASS_ENDPOINTS].filter(Boolean)))
  const tiles = splitBounds(bounds, detail)
  const merged = new Map<string, OsmFeature>()
  let loadedTiles = 0
  let cursor = 0
  const concurrency = detail === 'FULL' ? 1 : 2
  let lastError: unknown = null

  onProgress?.({ stage: 'REQUEST', completed: 0, total: tiles.length, message: `读取 OSM ${tiles.length} 个分区…` })

  const startedAt=Date.now()
  const worker = async () => {
    while (true) {
      if(Date.now()-startedAt>30000)return
      const index = cursor++
      if (index >= tiles.length) return
      const tile = tiles[index]!
      try {
        const tileKey='tile:'+cacheKey(tile,detail)
        const tileCache=await readCache(tileKey)
        let features:OsmFeature[]
        if(tileCache?.data.features.length&&cacheMaxAge>0&&Date.now()-tileCache.savedAt<=cacheMaxAge)features=tileCache.data.features
        else{
          try{
            features=await requestTileRobust(tile,detail,endpoints,signal)
            if(features.length)void writeCache({key:tileKey,savedAt:Date.now(),data:{features,source:'OSM',cache:'NETWORK',detail,loadedTiles:1,totalTiles:1,message:'分区缓存'}})
          }catch(error){
            if(signal?.aborted)throw error
            if(tileCache?.data.features.length)features=tileCache.data.features
            else throw error
          }
        }
        for (const feature of features) {
          // `out geom` may return the same way/relation from adjacent request tiles.
          // Deduplicate by OSM identity, keeping the geometrically richest copy.
          // This avoids doubled water faces and duplicate road ribbons at tile seams.
          const key = `${feature.kind}:${feature.id}`
          const previous = merged.get(key)
          const score = feature.geometry.length + (feature.holes?.reduce((sum, ring) => sum + ring.length, 0) || 0)
          const previousScore = previous
            ? previous.geometry.length + (previous.holes?.reduce((sum, ring) => sum + ring.length, 0) || 0)
            : -1
          if (!previous || score > previousScore) merged.set(key, feature)
        }
        loadedTiles += 1
      } catch (error) {
        if (signal?.aborted) throw error
        lastError = error
      } finally {
        onProgress?.({
          stage: 'REQUEST',
          completed: Math.min(cursor, tiles.length),
          total: tiles.length,
          message: `真实地理分区 ${Math.min(cursor, tiles.length)}/${tiles.length} · 成功 ${loadedTiles}`
        })
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, tiles.length) }, () => worker()))
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  onProgress?.({ stage: 'PARSE', completed: loadedTiles, total: tiles.length, message: '整理道路、建筑、水域与绿地…' })
  const features = [...merged.values()]
  if (features.length) {
    const stats = buildStats(features)
    const detailText = `道路 ${stats.road} · 建筑 ${stats.building} · 水域 ${stats.water} · 绿地 ${stats.park}`
    const partial = loadedTiles < tiles.length
    if(partial&&cached?.data.features.length&&cached.data.loadedTiles===cached.data.totalTiles){
      return {...cached.data,cache:'STALE_CACHE',message:'本次更新仅取得部分分区，继续使用上次完整真实地理缓存。'}
    }
    const data: OsmWorldData = {
      features,
      source: 'OSM',
      cache: 'NETWORK',
      detail,
      loadedTiles,
      totalTiles: tiles.length,
      message: partial
        ? `真实地理部分加载 ${loadedTiles}/${tiles.length} · ${detailText}`
        : `真实地理完整加载 ${tiles.length}/${tiles.length} · ${detailText}`
    }
    void writeCache({ key, savedAt: Date.now(), data })
    onProgress?.({ stage: 'DONE', completed: tiles.length, total: tiles.length, message: data.message })
    return data
  }

  // Public Overpass servers are best-effort services. A stale successful cache is much
  // better than replacing a known real district with a random procedural city.
  if (cached?.data.features.length) {
    const stale: OsmWorldData = {
      ...cached.data,
      cache: 'STALE_CACHE',
      message: `网络读取失败，已恢复上次真实地理缓存 · ${cached.data.message}`
    }
    onProgress?.({ stage: 'DONE', completed: 1, total: 1, message: stale.message })
    return stale
  }

  return {
    features: [],
    source: 'PROCEDURAL',
    cache: 'NONE',
    detail,
    loadedTiles: 0,
    totalTiles: tiles.length,
    message: `没有取得真实 OSM 地理数据。${lastError ? '公共 Overpass 服务本次请求失败或超时。' : ''}可重试，或缩小选区以启用更精细查询。`
  }
}
