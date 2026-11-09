import type { TravelRoute } from '@/utils/travelRoute'
import { projectLngLat, type GeoBounds } from '../geo'
import type { JourneyRouteResult, RouteStop } from './JourneyRouteBuilder'

/** 只投影/加密共享路径，不重新寻路，不用样条平滑拐角。 */
export function projectSharedJourneyRoute(route: TravelRoute, stops: RouteStop[], bounds: GeoBounds): JourneyRouteResult {
  if (route.coordinateSystem !== 'WGS84') throw new Error('3D 路线必须先转换为 WGS84')
  if (route.geometry.length < 2 || route.geometry.length > 100000 || route.stopPointIndices.length !== stops.length
    || route.stopPointIndices[0] !== 0 || route.stopPointIndices[stops.length-1] !== route.geometry.length-1
    || route.stopPointIndices.some((idx,i) => !Number.isInteger(idx) || idx < 0 || idx >= route.geometry.length
      || (i>0 && idx < route.stopPointIndices[i-1]!))
    || route.geometry.some(p => !Number.isFinite(p.lng) || !Number.isFinite(p.lat)))
    throw new Error('共享路线坐标或到站索引无效，请重新规划路线')
  if (stops.length !== route.stopIds.length || stops.some((s,i)=>s.id !== route.stopIds[i]))
    throw new Error('共享路线与旅行站点顺序不一致')
  const projected = route.geometry.map(p=>projectLngLat(p.lng,p.lat,bounds))
  const total = projected.reduce((sum,p,i) => i ? sum + Math.hypot(p.x-projected[i-1]!.x,p.z-projected[i-1]!.z) : 0,0)
  // Adapt spacing on long routes to avoid millions of generated vertices.
  const spacing = Math.max(0.48, total / 24000)
  const points: Array<{x:number;z:number}> = []
  const indexMap: number[]=[]
  for(let i=0;i<projected.length;i++) {
    const p=projected[i]!
    if(i===0) points.push(p)
    else {
      const a=projected[i-1]!
      const steps=Math.max(1,Math.ceil(Math.hypot(p.x-a.x,p.z-a.z)/spacing))
      for(let j=1;j<=steps;j++) points.push({x:a.x+(p.x-a.x)*j/steps,z:a.z+(p.z-a.z)*j/steps})
    }
    indexMap.push(points.length-1)
  }
  return {points,stopPointIndices:route.stopPointIndices.map(i=>{
    const mapped=indexMap[i]
    if(mapped==null) throw new Error('共享路线缺少到站坐标')
    return mapped
  }),mode:'ROAD',roadCoverage:1}
}
