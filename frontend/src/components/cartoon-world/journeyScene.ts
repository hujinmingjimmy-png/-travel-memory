import type { CartoonMapStyle, TravelMapSceneConfig } from '@/api/travelMapScene'
import type { RealMapPoint } from '@/api/travelRealMap'
import type { TravelRoute } from '@/utils/travelRoute'
import { validJourneyPoints } from '@/utils/travelRoute'
import { WORLD_WIDTH, WORLD_DEPTH } from './geo'

export type JourneySceneLod = 'LOCAL' | 'DISTRICT' | 'REGION'

export interface JourneyScenePlan {
  config: TravelMapSceneConfig
  widthKm: number
  heightKm: number
  areaKm2: number
  maxSpanKm: number
  marginPercent: number
  lod: JourneySceneLod
  lodLabel: string
  directionLabel: string
  cameraAzimuthDeg: number
  pointCount: number
  routeDistanceKm: number
}

const METERS_PER_LAT_DEG = 110_574

function metersPerLngDegree(latitude: number) {
  return Math.max(1, 111_320 * Math.cos(latitude * Math.PI / 180))
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function normalizeAngle(value: number) {
  let angle = value
  while (angle > 180) angle -= 360
  while (angle <= -180) angle += 360
  return angle
}

function principalAxis(samples: Array<{ lng: number; lat: number }>, widthLng: number, heightLat: number) {
  // PCA 在最终沙盘比例下计算；密集的道路采样不能改变主方向权重。
  if (samples.length < 2) return 0
  const projected = samples.map(p => ({x:p.lng/widthLng*WORLD_WIDTH,y:p.lat/heightLat*WORLD_DEPTH}))
  const meanX = projected.reduce((sum,p)=>sum+p.x,0)/projected.length
  const meanY = projected.reduce((sum,p)=>sum+p.y,0)/projected.length
  let xx=0, yy=0, xy=0
  for(const p of projected) { const x=p.x-meanX,y=p.y-meanY; xx+=x*x;yy+=y*y;xy+=x*y }
  return .5*Math.atan2(2*xy,xx-yy)
}

function directionLabel(axisRad: number) {
  const deg = ((axisRad * 180 / Math.PI) % 180 + 180) % 180
  if (deg < 22.5 || deg >= 157.5) return '东西向'
  if (deg < 67.5) return '西南 ↔ 东北'
  if (deg < 112.5) return '南北向'
  return '西北 ↔ 东南'
}

function chooseLod(widthKm: number, heightKm: number): { id: JourneySceneLod; label: string } {
  const maxSpan = Math.max(widthKm, heightKm)
  const area = widthKm * heightKm
  if (maxSpan <= 4.8 && area <= 20) return { id: 'LOCAL', label: '精细街区' }
  if (maxSpan <= 17 && area <= 190) return { id: 'DISTRICT', label: '城区均衡' }
  return { id: 'REGION', label: '地形优先' }
}

/**
 * Build a 3D scene from the SAME real journey points used by the 2D map.
 * Old manually saved city/bounds are intentionally ignored.
 */
export function buildJourneyScenePlan(
  travelId: number,
  inputPoints: RealMapPoint[],
  style: CartoonMapStyle,
  route?: TravelRoute | null
): JourneyScenePlan {
  const points = validJourneyPoints(inputPoints)
  if (points.length < 2) throw new Error('至少需要 2 个真实地理记忆点才能生成 3D 旅行地图')

  // 完整 route geometry（包括绕湖/绕城的路径）参与 Bounds，不能只看站点。
  const coordinates = [...points.map(p=>({lng:p.longitude,lat:p.latitude})), ...(route?.geometry || [])]
  let minLng0=Infinity,maxLng0=-Infinity,minLat0=Infinity,maxLat0=-Infinity
  for(const p of coordinates) {
    if(!Number.isFinite(p.lng) || !Number.isFinite(p.lat)) continue
    minLng0=Math.min(minLng0,p.lng);maxLng0=Math.max(maxLng0,p.lng)
    minLat0=Math.min(minLat0,p.lat);maxLat0=Math.max(maxLat0,p.lat)
  }
  const centerLng = (minLng0 + maxLng0) / 2
  const centerLat = (minLat0 + maxLat0) / 2
  const lngMeters = metersPerLngDegree(centerLat)

  const rawWidthM = Math.max(1, (maxLng0 - minLng0) * lngMeters)
  const rawHeightM = Math.max(1, (maxLat0 - minLat0) * METERS_PER_LAT_DEG)
  const rawMaxM = Math.max(rawWidthM, rawHeightM)

  // Short trips need enough breathing room for buildings and the camera.
  // Larger trips use less relative padding so the terrain itself remains dominant.
  const marginRatio = rawMaxM <= 2_500 ? 0.25 : rawMaxM <= 12_000 ? 0.18 : 0.12
  const minimumSpanM = rawMaxM <= 4_800 ? 1_350 : 2_200
  const baseWidthM = Math.max(rawWidthM, minimumSpanM)
  const baseHeightM = Math.max(rawHeightM, minimumSpanM)
  const padXM = Math.max(baseWidthM * marginRatio, rawMaxM <= 4_800 ? 220 : 520)
  const padYM = Math.max(baseHeightM * marginRatio, rawMaxM <= 4_800 ? 220 : 520)

  const widthM = baseWidthM + padXM * 2
  const heightM = baseHeightM + padYM * 2
  const halfLng = widthM / 2 / lngMeters
  const halfLat = heightM / 2 / METERS_PER_LAT_DEG

  // 等距采样主轴，避免高德转弯处密集点将方向拉偏。
  const rawSamples = route?.geometry.length ? route.geometry : coordinates
  const axisSamples: Array<{lng:number;lat:number}> = []
  const scaleX=lngMeters,scaleY=METERS_PER_LAT_DEG
  const cumulative=[0]
  for(let i=1;i<rawSamples.length;i++) cumulative.push(cumulative[i-1]!+Math.hypot(
    (rawSamples[i]!.lng-rawSamples[i-1]!.lng)*scaleX,(rawSamples[i]!.lat-rawSamples[i-1]!.lat)*scaleY))
  const total=cumulative[cumulative.length-1] || 0
  let cursor=1
  for(let i=0;i<128 && total>0;i++) {
    const d=total*i/127
    while(cursor<cumulative.length-1 && cumulative[cursor]!<d) cursor++
    const a=rawSamples[cursor-1]!,b=rawSamples[cursor]!
    const len=cumulative[cursor]!-cumulative[cursor-1]!
    const t=len>0?(d-cumulative[cursor-1]!)/len:0
    axisSamples.push({lng:a.lng+(b.lng-a.lng)*t,lat:a.lat+(b.lat-a.lat)*t})
  }
  const axis = principalAxis(axisSamples.length ? axisSamples : rawSamples, widthM/lngMeters, heightM/METERS_PER_LAT_DEG)
  // Baseline camera looks from +Z; latitude maps to negative world Z. This azimuth makes the journey's
  // principal direction read closer to the long horizontal screen axis.
  const cameraAzimuthDeg = normalizeAngle(axis * 180 / Math.PI)

  const widthKm = widthM / 1000
  const heightKm = heightM / 1000
  const lod = chooseLod(widthKm, heightKm)
  const maxSpanKm = Math.max(widthKm, heightKm)

  const zoom = maxSpanKm <= 2 ? 15.2
    : maxSpanKm <= 5 ? 13.8
      : maxSpanKm <= 12 ? 12.4
        : maxSpanKm <= 25 ? 11.1
          : maxSpanKm <= 60 ? 9.8
            : 8.7

  return {
    config: {
      travelId,
      sourceType: 'CARTOON_REAL',
      centerLng: Number(centerLng.toFixed(6)),
      centerLat: Number(centerLat.toFixed(6)),
      zoom: Number(clamp(zoom, 3, 20).toFixed(2)),
      pitch: 55,
      rotation: Number(cameraAzimuthDeg.toFixed(2)),
      cartoonStyle: style,
      southWestLng: Math.floor((centerLng - halfLng)*1e7)/1e7,
      southWestLat: Math.floor((centerLat - halfLat)*1e7)/1e7,
      northEastLng: Math.ceil((centerLng + halfLng)*1e7)/1e7,
      northEastLat: Math.ceil((centerLat + halfLat)*1e7)/1e7
    },
    widthKm,
    heightKm,
    areaKm2: widthKm * heightKm,
    maxSpanKm,
    marginPercent: Math.round(marginRatio * 100),
    lod: lod.id,
    lodLabel: lod.label,
    directionLabel: directionLabel(axis),
    cameraAzimuthDeg,
    pointCount: points.length,
    routeDistanceKm: (route?.distanceMeters || 0)/1000
  }
}
