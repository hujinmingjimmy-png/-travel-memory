import type { GeoBounds } from './geo'

export type WorldQualityMode = 'LOCAL' | 'DISTRICT' | 'REGION'
export type OsmQueryDetail = 'FULL' | 'BALANCED' | 'LANDSCAPE'

export interface WorldQualityProfile {
  id: WorldQualityMode
  label: string
  description: string
  osmDetail: OsmQueryDetail
  widthKm: number
  heightKm: number
  areaKm2: number
  maxDimensionKm: number
  buildingLimit: number
  facadeBuildingLimit: number
  assetUpgradeLimit: number
  roadLimit: number
  waterLimit: number
  parkLimit: number
  treeTarget: number
  streetFurniture: boolean
  detailedRoofs: boolean
  cameraMoveSpeed: number
  terrainEmphasis: number
}

const EARTH_RADIUS_KM = 6371.0088

function toRad(value: number) {
  return value * Math.PI / 180
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)))
}

export function measureBounds(bounds: GeoBounds) {
  const centerLat = (bounds.southWestLat + bounds.northEastLat) * 0.5
  const centerLng = (bounds.southWestLng + bounds.northEastLng) * 0.5
  const widthKm = haversineKm(centerLat, bounds.southWestLng, centerLat, bounds.northEastLng)
  const heightKm = haversineKm(bounds.southWestLat, centerLng, bounds.northEastLat, centerLng)
  return {
    widthKm,
    heightKm,
    areaKm2: Math.max(0.01, widthKm * heightKm),
    maxDimensionKm: Math.max(widthKm, heightKm)
  }
}

export function chooseWorldQuality(bounds: GeoBounds): WorldQualityProfile {
  const size = measureBounds(bounds)

  // Small selections are where individual façades and GLB assets actually read well.
  if (size.maxDimensionKm <= 4.8 && size.areaKm2 <= 20) {
    return {
      id: 'LOCAL',
      label: '精细街区',
      description: '小范围：完整建筑、立面细节、GLB 模型和街道家具优先。',
      osmDetail: 'FULL',
      ...size,
      buildingLimit: 135,
      facadeBuildingLimit: 110,
      assetUpgradeLimit: 48,
      roadLimit: 260,
      waterLimit: 130,
      parkLimit: 42,
      treeTarget: 150,
      streetFurniture: true,
      detailedRoofs: true,
      cameraMoveSpeed: 17,
      terrainEmphasis: 0.82
    }
  }

  // Medium selections keep recognisable city structure but deliberately reduce façade noise.
  if (size.maxDimensionKm <= 17 && size.areaKm2 <= 190) {
    return {
      id: 'DISTRICT',
      label: '城区均衡',
      description: '中等范围：真实道路、水域和街区结构优先，建筑细节自动降级。',
      osmDetail: 'BALANCED',
      ...size,
      buildingLimit: 66,
      facadeBuildingLimit: 42,
      assetUpgradeLimit: 24,
      roadLimit: 190,
      waterLimit: 150,
      parkLimit: 36,
      treeTarget: 100,
      streetFurniture: true,
      detailedRoofs: false,
      cameraMoveSpeed: 23,
      terrainEmphasis: 1.0
    }
  }

  // Large selections should look like a geographic diorama, not thousands of tiny boxes.
  return {
    id: 'REGION',
    label: '地形优先',
    description: '大范围：重点渲染真实地形、水域、森林和主干路，主动弱化普通房屋。',
    osmDetail: 'LANDSCAPE',
    ...size,
    buildingLimit: 0,
    facadeBuildingLimit: 0,
    assetUpgradeLimit: 0,
    roadLimit: 120,
    waterLimit: 180,
    parkLimit: 50,
    treeTarget: 110,
    streetFurniture: false,
    detailedRoofs: false,
    cameraMoveSpeed: 30,
    terrainEmphasis: 1.25
  }
}

export function formatSelectionSize(profile: WorldQualityProfile) {
  if (profile.areaKm2 >= 100) return `${profile.widthKm.toFixed(0)} × ${profile.heightKm.toFixed(0)} km · ${profile.areaKm2.toFixed(0)} km²`
  if (profile.areaKm2 >= 10) return `${profile.widthKm.toFixed(1)} × ${profile.heightKm.toFixed(1)} km · ${profile.areaKm2.toFixed(1)} km²`
  return `${profile.widthKm.toFixed(2)} × ${profile.heightKm.toFixed(2)} km · ${profile.areaKm2.toFixed(2)} km²`
}
