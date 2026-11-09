import { apiRequest, type ApiResult } from './request'

/**
 * 统一故事点：CUSTOM=手账地图，REAL=高德真实地图。
 * 只读接口不接受 userId；由后端 JWT 得到当前登录者。
 */
export interface TravelStoryPoint {
  id: number
  travelId: number
  pointType: 'CUSTOM' | 'REAL'
  mediaId: number | null
  title: string
  subtitle: string | null
  content: string | null
  locationName: string | null
  travelDate: string | null
  sortOrder: number
  xRatio: number | null
  yRatio: number | null
  longitude: number | null
  latitude: number | null
}

export const getTravelStoryPointsApi = (
  travelId: number
): Promise<ApiResult<TravelStoryPoint[]>> =>
  apiRequest<TravelStoryPoint[]>(`/api/travels/${travelId}/story/points`, { method: 'GET' })
