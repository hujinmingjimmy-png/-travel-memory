import type { OsmFeature } from './osm'
import { projectLngLat, type GeoBounds } from './geo'
export type BuildingKind='HOME'|'APARTMENT'|'OFFICE'|'RETAIL'|'INDUSTRIAL'|'SCHOOL'|'HOSPITAL'|'PUBLIC'|'LANDMARK'
export function classifyBuilding(tags:Record<string,string>):BuildingKind{
  const type=(tags.building || tags['building:part'] || '').toLowerCase()
  if(tags.tourism==='attraction'||tags.historic||/cathedral|church|temple|castle/.test(type))return 'LANDMARK'
  if(tags.amenity==='hospital'||tags.amenity==='clinic'||type==='hospital')return 'HOSPITAL'
  if(/school|university|college|kindergarten/.test(tags.amenity||type))return 'SCHOOL'
  if(tags.industrial||tags.landuse==='industrial'||/industrial|warehouse|factory|hangar/.test(type))return 'INDUSTRIAL'
  if(tags.office||/office|skyscraper/.test(type))return 'OFFICE'
  if(tags.shop||/commercial|retail|supermarket|mall|hotel/.test(type))return 'RETAIL'
  if(/apartments|dormitory|residential/.test(type))return 'APARTMENT'
  if(tags.amenity||/civic|public|government|museum/.test(type))return 'PUBLIC'
  return 'HOME'
}
const priority:Record<BuildingKind,number>={LANDMARK:8,HOSPITAL:7,SCHOOL:6,PUBLIC:5,OFFICE:4,RETAIL:3,APARTMENT:2,INDUSTRIAL:1,HOME:0}
/** 确定性取舍：保留公共/地标、真实街区位置，限制同一片区的房屋密度。 */
export function curateBuildings(features:OsmFeature[],bounds:GeoBounds,limit:number){
  const candidates=features.map(f=>{
    const pts=f.geometry.map(p=>projectLngLat(p.lng,p.lat,bounds))
    const minX=Math.min(...pts.map(p=>p.x)),maxX=Math.max(...pts.map(p=>p.x)),minZ=Math.min(...pts.map(p=>p.z)),maxZ=Math.max(...pts.map(p=>p.z))
    return {feature:f,x:(minX+maxX)/2,z:(minZ+maxZ)/2,width:maxX-minX,depth:maxZ-minZ,kind:classifyBuilding(f.tags)}
  }).filter(c=>Number.isFinite(c.x)&&Number.isFinite(c.z)&&Math.abs(c.x)<53&&Math.abs(c.z)<33&&c.width>.28&&c.depth>.28&&c.width<35&&c.depth<25)
  candidates.sort((a,b)=>priority[b.kind]-priority[a.kind] || a.feature.id-b.feature.id)
  const selected:typeof candidates=[]
  const cells=new Map<string,number>()
  for(const c of candidates){
    if(selected.length>=limit)break
    const cell=`${Math.floor(c.x/5)}:${Math.floor(c.z/5)}`
    if((cells.get(cell)||0)>=2)continue
    if(selected.some(s=>Math.abs(c.x-s.x)<(c.width+s.width)*.38+.55 && Math.abs(c.z-s.z)<(c.depth+s.depth)*.38+.55))continue
    selected.push(c);cells.set(cell,(cells.get(cell)||0)+1)
  }
  return selected.map(c=>c.feature)
}
