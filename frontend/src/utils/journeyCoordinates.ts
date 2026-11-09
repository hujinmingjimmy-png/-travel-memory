/** 高德页面保留 GCJ-02；OSM / DEM 世界使用 WGS84。只在 3D 边界转换。 */
export interface JourneyCoordinate { lng: number; lat: number }
const A = 6378245
const EE = 0.00669342162296594323
const PI = Math.PI
function outsideChina(p: JourneyCoordinate) {
  return p.lng < 72.004 || p.lng > 137.8347 || p.lat < 0.8293 || p.lat > 55.8271
}
function deltaLat(x: number, y: number) {
  return -100 + 2*x + 3*y + .2*y*y + .1*x*y + .2*Math.sqrt(Math.abs(x))
    + (20*Math.sin(6*x*PI) + 20*Math.sin(2*x*PI))*2/3
    + (20*Math.sin(y*PI) + 40*Math.sin(y*PI/3))*2/3
    + (160*Math.sin(y*PI/12) + 320*Math.sin(y*PI/30))*2/3
}
function deltaLng(x: number, y: number) {
  return 300 + x + 2*y + .1*x*x + .1*x*y + .1*Math.sqrt(Math.abs(x))
    + (20*Math.sin(6*x*PI) + 20*Math.sin(2*x*PI))*2/3
    + (20*Math.sin(x*PI) + 40*Math.sin(x*PI/3))*2/3
    + (150*Math.sin(x*PI/12) + 300*Math.sin(x*PI/30))*2/3
}
export function wgs84ToGcj02(p: JourneyCoordinate): JourneyCoordinate {
  if (outsideChina(p)) return { ...p }
  const rad = p.lat / 180 * PI
  const magic = 1 - EE * Math.sin(rad)**2
  const root = Math.sqrt(magic)
  return {
    lng: p.lng + deltaLng(p.lng-105, p.lat-35)*180 / (A/root*Math.cos(rad)*PI),
    lat: p.lat + deltaLat(p.lng-105, p.lat-35)*180 / (A*(1-EE)/(magic*root)*PI)
  }
}
/** 迭代反求而不是只减一次偏移；本地近似转换，不用于测绘。 */
export function gcj02ToWgs84(p: JourneyCoordinate): JourneyCoordinate {
  if (outsideChina(p)) return { ...p }
  let candidate = { ...p }
  for (let i = 0; i < 8; i++) {
    const forward = wgs84ToGcj02(candidate)
    const dx = forward.lng - p.lng, dy = forward.lat - p.lat
    candidate = { lng: candidate.lng-dx, lat: candidate.lat-dy }
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 1e-9) break
  }
  return candidate
}
