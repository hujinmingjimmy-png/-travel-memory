import type { RealMapPoint } from '@/api/travelRealMap'
import { gcj02ToWgs84, type JourneyCoordinate } from './journeyCoordinates'

/** 地图先计算一次，确认页、2D、3D 车辆只消费这份结果，不独立重算。 */
export interface TravelRoute {
  travelId: number
  coordinateSystem: 'GCJ-02' | 'WGS84'
  source: 'AMAP_DRIVING'
  cacheState?: 'NETWORK' | 'CACHE' | 'STALE_CACHE' | 'SERVER'
  sourceSignature: string
  geometry: JourneyCoordinate[]
  stopIds: number[]
  stopPointIndices: number[]
  distanceMeters: number
}
export function validJourneyPoints(points: RealMapPoint[]) {
  return points.filter(p => Number.isFinite(p.longitude) && Number.isFinite(p.latitude)
    && Math.abs(p.longitude) <= 180 && Math.abs(p.latitude) <= 85)
}
/** 顺序也是输入的一部分；不要在这里再次排序。 */
export function journeyGeometrySignature(points: RealMapPoint[]) {
  return JSON.stringify(validJourneyPoints(points).map(p => [p.id, p.longitude, p.latitude]))
}
export function journeySourceHash(points: RealMapPoint[]) {
  return hashText(JSON.stringify(validJourneyPoints(points).map(p =>
    [p.id,p.longitude,p.latitude,p.mediaId,p.title,p.subtitle,p.content,p.locationName,p.travelDate])))
}
export function travelRouteRevision(route: TravelRoute | null) {
  return route ? hashText(JSON.stringify([route.geometry,route.stopPointIndices,route.coordinateSystem])) : ''
}
function hashText(text: string) {
  let hash = 2166136261
  for (let i=0; i<text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash,16777619) }
  return (hash >>> 0).toString(16).padStart(8,'0')
}
export function distanceMeters(a: JourneyCoordinate, b: JourneyCoordinate) {
  const rad = Math.PI/180
  const h = Math.sin((b.lat-a.lat)*rad/2)**2
    + Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin((b.lng-a.lng)*rad/2)**2
  return 12742017.6*Math.asin(Math.min(1,Math.sqrt(h)))
}
export function toWorldJourneyRoute(route: TravelRoute): TravelRoute {
  return { ...route, geometry: route.geometry.map(p => route.coordinateSystem === 'GCJ-02' ? gcj02ToWgs84(p) : {...p}),
    stopIds: [...route.stopIds], stopPointIndices: [...route.stopPointIndices], coordinateSystem: 'WGS84' }
}
function abortError() { return new DOMException('Aborted','AbortError') }
/** 所有外部回调有超时和取消保护，旧请求不会覆盖新旅行。 */
function requestWithTimeout<T>(run: (done: (error: Error | null, value?: T) => void) => void, signal: AbortSignal, timeoutMs: number) {
  return new Promise<T>((resolve,reject) => {
    if (signal.aborted) { reject(abortError()); return }
    let settled = false
    const finish = (error: Error | null, value?: T) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener('abort',abort)
      if (error) reject(error); else resolve(value as T)
    }
    const abort = () => finish(abortError())
    const timer = setTimeout(() => finish(new Error('高德路线服务响应超时，请重试')), timeoutMs)
    signal.addEventListener('abort',abort,{once:true})
    try { run(finish) } catch(error) { finish(error instanceof Error ? error : new Error(String(error))) }
  })
}
function readCoordinate(p: any): JourneyCoordinate | null {
  const lng = Number(p?.getLng?.() ?? p?.lng ?? p?.[0])
  const lat = Number(p?.getLat?.() ?? p?.lat ?? p?.[1])
  return Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lng)<=180 && Math.abs(lat)<=85 ? {lng,lat} : null
}
export async function buildTravelRoute(
  AMap: any, travelId: number, inputPoints: RealMapPoint[], signal: AbortSignal,
  onProgress?: (completed: number, total: number) => void
): Promise<TravelRoute> {
  const points = validJourneyPoints(inputPoints)
  if (points.length < 2) throw new Error('至少需要 2 个有效旅行地点')
  if (!AMap.Driving) await requestWithTimeout<void>(done => {
    AMap.plugin(['AMap.Driving'], () => done(AMap.Driving ? null : new Error('无法加载高德驾车路线插件')))
  },signal,12000)
  const driving = new AMap.Driving({ policy: AMap.DrivingPolicy?.LEAST_TIME ?? 0, ferry: 1, extensions: 'all' })
  const geometry: JourneyCoordinate[] = []
  const stopPointIndices: number[] = [0]
  try {
    // 每段独立请求，保留所有站点，不受单次 waypoints 上限影响。
    for (let i=1; i<points.length; i++) {
      if (signal.aborted) throw abortError()
      const from = points[i-1]!, to = points[i]!
      const a = {lng:from.longitude,lat:from.latitude}, b = {lng:to.longitude,lat:to.latitude}
      if (distanceMeters(a,b) < 1) {
        if (!geometry.length) geometry.push(a)
        stopPointIndices.push(geometry.length-1)
        onProgress?.(i,points.length-1)
        continue
      }
      const result = await requestWithTimeout<any>(done => {
        driving.search(new AMap.LngLat(a.lng,a.lat), new AMap.LngLat(b.lng,b.lat),
          (status: string, result: any) => done(status === 'complete' && result?.routes?.length ? null
            : new Error(`第 ${i} → ${i+1} 站路线不可用：${typeof result === 'string' ? result : result?.info || status}`),result))
      },signal,15000)
      const path: JourneyCoordinate[] = []
      for (const step of result.routes[0].steps || []) for (const raw of step.path || []) {
        const p = readCoordinate(raw)
        if (p && (!path.length || distanceMeters(path[path.length-1]!,p) > .05)) path.push(p)
      }
      if (path.length < 2) throw new Error(`第 ${i} 段路线没有完整道路坐标，请重试`)
      if (distanceMeters(a,path[0]!) > 500 || distanceMeters(b,path[path.length-1]!) > 500)
        throw new Error(`第 ${i} 段路线离记忆点过远，请把地点移动到附近可通行道路`)
      const last = geometry[geometry.length-1]
      if (last && distanceMeters(last,path[0]!) > 30)
        throw new Error(`第 ${i} 站前后道路不连续，请调整地点后重试`)
      for (const p of path) if (!geometry.length || distanceMeters(geometry[geometry.length-1]!,p) > .05) geometry.push(p)
      stopPointIndices.push(geometry.length-1)
      onProgress?.(i,points.length-1)
    }
  } finally { driving.clear?.() }
  let total = 0
  for(let i=1;i<geometry.length;i++) total += distanceMeters(geometry[i-1]!,geometry[i]!)
  if (total < 1 || geometry.length < 2) throw new Error('旅行地点重合，暂时没有可播放的行驶路线')
  return {travelId,coordinateSystem:'GCJ-02',source:'AMAP_DRIVING',sourceSignature:journeyGeometrySignature(points),
    geometry,stopIds:points.map(p=>p.id),stopPointIndices,distanceMeters:total}
}

const ROUTE_CACHE_PREFIX='tm-route-v33:'
/** 与点位/顺序绑定的成功结果；网络失败时仍能复用，绝不拿另一段旅行替代。 */
/** Validate route/stop alignment BEFORE passing it between 2D and Three.js.
 * No second route calculation or silently swapping another trip's coordinates.
 */
export function isTravelRouteConsistent(route: TravelRoute | null, travelId: number, points: RealMapPoint[]): boolean {
  const valid = validJourneyPoints(points)
  if (!route || route.travelId !== travelId || route.source !== 'AMAP_DRIVING'
    || route.coordinateSystem !== 'GCJ-02' || route.sourceSignature !== journeyGeometrySignature(valid)
    || !Array.isArray(route.geometry) || route.geometry.length < 2 || route.geometry.length > 100000
    || !Number.isFinite(route.distanceMeters) || route.distanceMeters <= 0
    || route.geometry.some(p => !Number.isFinite(p.lng) || !Number.isFinite(p.lat) || Math.abs(p.lng) > 180 || Math.abs(p.lat) > 85)
    || !Array.isArray(route.stopIds) || route.stopIds.length !== valid.length
    || route.stopIds.some((id, i) => id !== valid[i]?.id)
    || !Array.isArray(route.stopPointIndices) || route.stopPointIndices.length !== valid.length
    || route.stopPointIndices[0] !== 0
    || route.stopPointIndices[route.stopPointIndices.length - 1] !== route.geometry.length - 1
    || route.stopPointIndices.some((index,i) => !Number.isInteger(index) || index < 0 || index >= route.geometry.length
      || (i > 0 && index < route.stopPointIndices[i - 1]!))) return false
  return true
}

export function readCachedTravelRoute(travelId:number,points:RealMapPoint[]):TravelRoute|null{
  try{
    const record=JSON.parse(localStorage.getItem(ROUTE_CACHE_PREFIX+travelId)||'null')
    const r=record?.route as TravelRoute|undefined
    if (!isTravelRouteConsistent(r ?? null, travelId, points) || !Number.isFinite(record.savedAt)) return null
    return {...r!,cacheState:Date.now()-record.savedAt>7*86400000?'STALE_CACHE':'CACHE'}
  }catch{return null}
}
export function cacheTravelRoute(route:TravelRoute){
  try{
    localStorage.setItem(ROUTE_CACHE_PREFIX+route.travelId,JSON.stringify({savedAt:Date.now(),route}))
    const keys=Object.keys(localStorage).filter(k=>k.startsWith(ROUTE_CACHE_PREFIX))
    const others=keys.filter(k=>k!==ROUTE_CACHE_PREFIX+route.travelId)
    while(others.length>7)localStorage.removeItem(others.shift()!)
  }catch{/* 浏览器禁用缓存时不影响本次旅行。 */}
}
