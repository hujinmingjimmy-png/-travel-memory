import { apiRequest, type ApiResult } from './request'

/** 旅行地图坐标永远保存成 0～1 的比例，而不是浏览器像素。 */
export interface TravelPoint {
  id: number
  travelId: number
  mediaId: number | null
  title: string
  subtitle: string | null
  content: string | null
  locationName: string | null
  travelDate: string | null
  xRatio: number
  yRatio: number
  sortOrder: number
  createdAt: string | null
  updatedAt: string | null
}

export interface TravelMap {
  travelId: number
  mapBackgroundMediaId: number | null
  points: TravelPoint[]
}

/** 前端不允许传 userId；后端只用 JWT 判断作者身份。 */
export interface TravelPointRequest {
  mediaId: number | null
  title: string
  subtitle: string | null
  content: string | null
  locationName: string | null
  travelDate: string | null
  xRatio: number
  yRatio: number
  sortOrder: number
}

const base = (travelId: number) => `/api/travels/${travelId}/map`

export const getTravelMapApi = (travelId: number): Promise<ApiResult<TravelMap>> =>
  apiRequest<TravelMap>(base(travelId), { method: 'GET' })

/** 与电影式首页的 backgroundMediaId 独立，不会改变电影背景。 */
export const setMapBackgroundApi = (
  travelId: number,
  mediaId: number | null
): Promise<ApiResult<boolean>> =>
  apiRequest<boolean>(`${base(travelId)}/background`, {
    method: 'PUT', body: JSON.stringify({ mediaId })
  })

export const createTravelPointApi = (
  travelId: number,
  point: TravelPointRequest
): Promise<ApiResult<TravelPoint>> =>
  apiRequest<TravelPoint>(`${base(travelId)}/points`, {
    method: 'POST', body: JSON.stringify(point)
  })

export const updateTravelPointApi = (
  travelId: number,
  id: number,
  point: TravelPointRequest
): Promise<ApiResult<TravelPoint>> =>
  apiRequest<TravelPoint>(`${base(travelId)}/points/${id}`, {
    method: 'PUT', body: JSON.stringify(point)
  })

export const deleteTravelPointApi = (
  travelId: number,
  id: number
): Promise<ApiResult<boolean>> =>
  apiRequest<boolean>(`${base(travelId)}/points/${id}`, { method: 'DELETE' })
