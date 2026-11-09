import { apiRequest, type ApiResult } from './request'

/**
 * 高德地图返回 GCJ-02 经纬度。
 * 与手账地图的 xRatio/yRatio 分开存储。
 */
export interface RealMapPoint {
  id: number
  travelId: number
  mediaId: number | null
  title: string
  subtitle: string | null
  content: string | null
  locationName: string | null
  travelDate: string | null
  longitude: number
  latitude: number
  sortOrder: number
  createdAt: string | null
  updatedAt: string | null
}

export type RealMapPointPayload = Omit<RealMapPoint,
  'id' | 'travelId' | 'createdAt' | 'updatedAt'>

const base = (travelId: number) => `/api/travels/${travelId}/real-map/points`

export const getRealMapPointsApi = (travelId: number): Promise<ApiResult<RealMapPoint[]>> =>
  apiRequest<RealMapPoint[]>(base(travelId))

export const createRealMapPointApi = (travelId: number, body: RealMapPointPayload): Promise<ApiResult<RealMapPoint>> =>
  apiRequest<RealMapPoint>(base(travelId), { method: 'POST', body: JSON.stringify(body) })

export const updateRealMapPointApi = (travelId: number, id: number, body: RealMapPointPayload): Promise<ApiResult<RealMapPoint>> =>
  apiRequest<RealMapPoint>(`${base(travelId)}/${id}`, { method: 'PUT', body: JSON.stringify(body) })

export const deleteRealMapPointApi = (travelId: number, id: number): Promise<ApiResult<boolean>> =>
  apiRequest<boolean>(`${base(travelId)}/${id}`, { method: 'DELETE' })

/** Link existing journal memory to exact location (no duplicate INSERT). */
export const anchorCustomMemoryApi=(travelId:number, pointId:number, longitude:number, latitude:number):Promise<ApiResult<boolean>> =>
  apiRequest<boolean>(`${base(travelId)}/anchors/${pointId}`,{method:'PUT',body:JSON.stringify({longitude,latitude})})
